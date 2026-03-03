import path from "path";
import sharp from "sharp";
import { generateAIImageSquare } from "../image-sourcer/flux-ai.js";
import type { ArtDirectionResult, GridCellArt, GridConfig } from "../../core/types-v2.js";

// Photorealistic style suffix for real_photo grids
const REAL_PHOTO_SUFFIX = "photorealistic, high detail, natural lighting, sharp focus, centered composition, clean background, no text, square format";

/**
 * Generate all grid cell art images via FLUX AI.
 * Uses photorealistic style for real_photo grids, cartoon style for ai_illustration grids.
 */
export async function generateAllGridArt(
  artDirection: ArtDirectionResult,
  gridConfig: GridConfig,
  outputDir: string,
): Promise<GridCellArt[]> {
  const results: GridCellArt[] = [];
  const styleSuffix = artDirection.grid_source === "real_photo"
    ? REAL_PHOTO_SUFFIX
    : gridConfig.cell_art_prompt_suffix;

  for (let i = 0; i < artDirection.cells.length; i++) {
    const cell = artDirection.cells[i];
    const outputPath = path.join(outputDir, `grid_cell_${i}.png`);

    // Compose full FLUX prompt: visual description + style suffix
    const fullPrompt = `${cell.visual_description}. ${styleSuffix}`;

    try {
      console.log(`[grid-art] Generating cell ${i}: "${cell.topic}" via FLUX (${artDirection.grid_source})...`);
      const buffer = await generateAIImageSquare(fullPrompt);

      await sharp(buffer)
        .resize(640, 420, { fit: "cover", position: "attention" })
        .sharpen()
        .png()
        .toFile(outputPath);

      results.push({
        cellIndex: i,
        topicName: cell.topic,
        localPath: outputPath,
        source: "flux_ai",
        artDirection: cell,
      });

      console.log(`[grid-art] ✅ Cell ${i} generated`);
    } catch (err) {
      console.warn(`[grid-art] ❌ FLUX failed for "${cell.topic}": ${(err as Error).message}`);

      // Retry with simpler prompt
      try {
        console.log(`[grid-art]   Retrying with simpler prompt...`);
        const simplePrompt = `${cell.visual_description}, digital illustration, vibrant colors, white background`;
        const buffer = await generateAIImageSquare(simplePrompt);

        await sharp(buffer)
          .resize(640, 420, { fit: "cover", position: "attention" })
          .sharpen()
          .png()
          .toFile(outputPath);

        results.push({
          cellIndex: i,
          topicName: cell.topic,
          localPath: outputPath,
          source: "flux_ai",
          artDirection: cell,
        });

        console.log(`[grid-art] ✅ Cell ${i} generated on retry`);
      } catch {
        await createPlaceholder(i, cell.topic, outputPath, results);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createPlaceholder(
  i: number,
  topic: string,
  outputPath: string,
  results: GridCellArt[],
): Promise<void> {
  console.warn(`[grid-art]   Creating color placeholder for "${topic}"`);
  const colors = ["#1a237e", "#b71c1c", "#1b5e20", "#e65100", "#4a148c"];
  const bgColor = colors[i % colors.length];

  const svg = `<svg width="640" height="420" xmlns="http://www.w3.org/2000/svg">
    <rect width="640" height="420" fill="${bgColor}"/>
    <text x="320" y="210" font-family="Arial Black, sans-serif" font-size="36"
          fill="white" text-anchor="middle" dominant-baseline="middle">
      ${escapeXml(topic)}
    </text>
  </svg>`;

  try {
    await sharp(Buffer.from(svg)).png().toFile(outputPath);
    results.push({
      cellIndex: i,
      topicName: topic,
      localPath: outputPath,
      source: "none",
    });
  } catch {
    results.push({
      cellIndex: i,
      topicName: topic,
      localPath: "",
      source: "none",
    });
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
