import * as fs from "fs";
import * as path from "path";
import sharp from "sharp";

import type { ScenePlan } from "../scene-planner/types.js";
import type { ImageSourcingConfig, SourcedImage } from "./types.js";
import type { ScenePlanV2, SourcedImageV2 } from "../../core/types-v2.js";
import { searchPexels } from "./pexels.js";
import { generateAIImage, generateStyledAIImage } from "./flux-ai.js";
import { generateDiagram } from "./diagram-generator.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Reference images are shown as framed insets, not full-screen
const TARGET_WIDTH = 960;
const TARGET_HEIGHT = 540;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Download an image from a URL and return it as a Buffer.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download image from ${url} (${response.status})`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Resize and crop an image buffer to exactly 1920x1080 using sharp's
 * attention-based smart crop strategy, which focuses on the most
 * visually interesting region of the image.
 */
async function processImage(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .png()
    .toBuffer();
}

/**
 * Try to source an image from Pexels using the scene's search query.
 * Returns a processed image buffer and metadata, or null on failure.
 */
async function tryPexels(
  scene: ScenePlan,
): Promise<{ buffer: Buffer; source: "pexels"; attribution: string } | null> {
  try {
    const photo = await searchPexels(scene.image_search_query);

    if (!photo) {
      console.log(`[image-pipeline] Pexels returned no results for scene ${scene.scene_id}`);
      return null;
    }

    // Prefer the large2x variant for maximum quality
    const imageUrl = photo.urlLarge2x || photo.url;
    console.log(`[image-pipeline] Downloading Pexels image for scene ${scene.scene_id}`);

    const rawBuffer = await downloadImage(imageUrl);
    const processed = await processImage(rawBuffer);

    return {
      buffer: processed,
      source: "pexels",
      attribution: `Photo by ${photo.photographer} on Pexels (${photo.pexelsUrl})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[image-pipeline] Pexels failed for scene ${scene.scene_id}: ${message}`);
    return null;
  }
}

/**
 * Generate an AI image using FLUX via the scene's dedicated prompt.
 * Returns a processed image buffer and metadata, or null on failure.
 */
async function tryFluxAI(
  scene: ScenePlan,
): Promise<{ buffer: Buffer; source: "flux_ai" } | null> {
  try {
    console.log(`[image-pipeline] Generating FLUX AI image for scene ${scene.scene_id}`);

    const rawBuffer = await generateAIImage(scene.ai_image_prompt);
    const processed = await processImage(rawBuffer);

    return {
      buffer: processed,
      source: "flux_ai",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[image-pipeline] FLUX AI failed for scene ${scene.scene_id}: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Source and process background images for every scene in the plan.
 *
 * Images are sourced according to the priority chain defined in the config
 * (typically Pexels first, then FLUX AI as a fallback). All images are
 * resized/cropped to 1920x1080 using attention-based smart cropping and
 * saved as PNG files in the output directory.
 *
 * @param scenes     The scene plans containing search queries and AI prompts.
 * @param config     Image sourcing configuration with provider priority.
 * @param outputDir  Directory where processed images will be saved.
 * @returns          An array of SourcedImage metadata for each scene.
 */
export async function sourceImagesForScenes(
  scenes: ScenePlan[],
  config: ImageSourcingConfig,
  outputDir: string,
): Promise<SourcedImage[]> {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`[image-pipeline] Created output directory: ${outputDir}`);
  }

  const results: SourcedImage[] = [];
  const priorityChain = config.priority || ["pexels", "flux_ai"];

  console.log(
    `[image-pipeline] Sourcing images for ${scenes.length} scene(s) ` +
      `with priority: ${priorityChain.join(" -> ")}`,
  );

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];

    // Skip image sourcing for doodle scenes (white background, no photo needed)
    if (scene.scene_type === "doodle" || scene.scene_type === "topic_list" || !scene.image_search_query) {
      console.log(
        `[image-pipeline] Skipping scene ${scene.scene_id} (doodle type, no image needed)`,
      );
      results.push({
        localPath: "",
        source: "none",
      });
      continue;
    }

    console.log(
      `[image-pipeline] Processing reference image for scene ${scene.scene_id}`,
    );

    let sourced: { buffer: Buffer; source: "pexels" | "flux_ai"; attribution?: string } | null =
      null;

    // Walk the priority chain until we get a successful result
    for (const provider of priorityChain) {
      if (sourced) break;

      switch (provider) {
        case "pexels":
          sourced = await tryPexels(scene);
          break;
        case "flux_ai":
          sourced = await tryFluxAI(scene);
          break;
        default:
          console.warn(`[image-pipeline] Unknown image provider: ${provider}`);
      }
    }

    if (!sourced) {
      // For reference images that fail, fall back to no image instead of crashing
      console.warn(
        `[image-pipeline] All providers failed for scene ${scene.scene_id}, falling back to no image`,
      );
      results.push({
        localPath: "",
        source: "none",
      });
      continue;
    }

    // Write the processed image to disk
    const filename = `${scene.scene_id}.png`;
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, sourced.buffer);
    console.log(
      `[image-pipeline] Saved ${sourced.source} image for scene ${scene.scene_id}: ${outputPath}`,
    );

    results.push({
      localPath: outputPath,
      source: sourced.source,
      ...(sourced.attribution && { attribution: sourced.attribution }),
    });
  }

  const pexelsCount = results.filter((r) => r.source === "pexels").length;
  const fluxCount = results.filter((r) => r.source === "flux_ai").length;
  const skippedCount = results.filter((r) => r.source === "none").length;
  console.log(
    `[image-pipeline] Image sourcing complete. ` +
      `Pexels: ${pexelsCount}, FLUX AI: ${fluxCount}, Skipped (doodle): ${skippedCount}`,
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// V2 Image Pipeline — Multi-Type Routing
// ═══════════════════════════════════════════════════════════════════

// V2 images are 1.2x larger than viewport for Ken Burns camera headroom
const V2_TARGET_WIDTH = 2304;  // 1920 * 1.2
const V2_TARGET_HEIGHT = 1296; // 1080 * 1.2

async function processImageV2(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(V2_TARGET_WIDTH, V2_TARGET_HEIGHT, {
      fit: "cover",
      position: sharp.strategy.attention,
    })
    .png()
    .toBuffer();
}

/**
 * Source images for v2 scenes with multi-type routing.
 * Each scene type maps to exactly one provider.
 */
export async function sourceImagesForScenesV2(
  scenes: ScenePlanV2[],
  outputDir: string,
): Promise<SourcedImageV2[]> {
  fs.mkdirSync(outputDir, { recursive: true });
  const results: SourcedImageV2[] = [];

  console.log(`[image-pipeline-v2] Sourcing images for ${scenes.length} scenes`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const outputPath = path.join(outputDir, `${scene.scene_id}.png`);

    try {
      switch (scene.scene_type) {
        case "real_photo": {
          console.log(`[image-pipeline-v2] Scene ${scene.scene_id}: Pexels → "${scene.image_search_query}"`);
          const photo = await searchPexels(scene.image_search_query);
          if (photo) {
            const raw = await downloadImage(photo.urlLarge2x || photo.url);
            const processed = await processImageV2(raw);
            fs.writeFileSync(outputPath, processed);
            results.push({ localPath: outputPath, source: "pexels", attribution: `Photo by ${photo.photographer}` });
          } else {
            results.push({ localPath: "", source: "none" });
          }
          break;
        }

        case "ai_illustration": {
          console.log(`[image-pipeline-v2] Scene ${scene.scene_id}: FLUX illustration`);
          const raw = await generateStyledAIImage(scene.ai_image_prompt, "illustration");
          const processed = await processImageV2(raw);
          fs.writeFileSync(outputPath, processed);
          results.push({ localPath: outputPath, source: "flux_ai_illustration" });
          break;
        }

        case "cinematic_ai": {
          console.log(`[image-pipeline-v2] Scene ${scene.scene_id}: FLUX cinematic`);
          const raw = await generateStyledAIImage(scene.ai_image_prompt, "cinematic");
          const processed = await processImageV2(raw);
          fs.writeFileSync(outputPath, processed);
          results.push({ localPath: outputPath, source: "flux_ai_cinematic" });
          break;
        }

        case "diagram": {
          console.log(`[image-pipeline-v2] Scene ${scene.scene_id}: Claude diagram`);
          const result = await generateDiagram(
            scene.diagram_description || scene.ai_image_prompt,
            outputPath,
          );
          results.push(result);
          break;
        }

        case "text_card": {
          // No image needed — rendered entirely in Remotion
          results.push({ localPath: "", source: "text_card" });
          break;
        }

        default:
          results.push({ localPath: "", source: "none" });
      }
    } catch (err) {
      console.warn(`[image-pipeline-v2] Failed for scene ${scene.scene_id}: ${(err as Error).message}`);
      // Fallback: try Pexels as last resort for any scene type
      try {
        const query = scene.image_search_query || scene.ai_image_prompt?.slice(0, 50) || scene.scene_id;
        const photo = await searchPexels(query);
        if (photo) {
          const raw = await downloadImage(photo.urlLarge2x || photo.url);
          const processed = await processImageV2(raw);
          fs.writeFileSync(outputPath, processed);
          results.push({ localPath: outputPath, source: "pexels" });
          continue;
        }
      } catch { /* ignore fallback errors */ }
      results.push({ localPath: "", source: "none" });
    }
  }

  const counts = {
    pexels: results.filter(r => r.source === "pexels").length,
    illustration: results.filter(r => r.source === "flux_ai_illustration").length,
    cinematic: results.filter(r => r.source === "flux_ai_cinematic").length,
    diagram: results.filter(r => r.source === "diagram").length,
    textCard: results.filter(r => r.source === "text_card").length,
    none: results.filter(r => r.source === "none").length,
  };
  console.log(`[image-pipeline-v2] Complete: ${JSON.stringify(counts)}`);

  return results;
}
