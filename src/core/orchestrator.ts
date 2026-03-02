import { generateScript } from "../plugins/script-gen/claude-script-gen.js";
import { planScenes, injectTopicListScenes } from "../plugins/scene-planner/claude-scene-planner.js";
import { generateVoice } from "../plugins/voice-gen/elevenlabs.js";
import { sourceImagesForScenes } from "../plugins/image-sourcer/image-pipeline.js";
import { searchPexels } from "../plugins/image-sourcer/pexels.js";
import { renderVideoWithRemotion } from "../plugins/compositor/render.js";
import {
  assembleWithFFmpeg,
  selectMusicTrack,
} from "../plugins/compositor/ffmpeg-assembler.js";
import { generateThumbnail } from "../plugins/thumbnail-gen/grid-thumbnail.js";
import { generateMetadata } from "../plugins/metadata-gen/youtube-seo.js";
import { uploadToYouTube } from "../plugins/uploader/youtube-upload.js";
import { generateSRT } from "../plugins/captions/srt-generator.js";
import { loadConfig } from "./config.js";
import type { ChannelConfig } from "./config.js";
import type { AlignedScene } from "../plugins/scene-planner/types.js";
import type { ScenePlan } from "../plugins/scene-planner/types.js";
import type { WordTimestamp } from "../plugins/voice-gen/types.js";
import type { SourcedImage } from "../plugins/image-sourcer/types.js";
import type { VideoData, SceneData } from "../plugins/compositor/remotion-project/src/types.js";
import sharp from "sharp";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

/**
 * Downloads an image from a URL and returns it as a Buffer.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url} (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Sources a representative image for each sub-topic from Pexels.
 * These images are used in the photo grid topic overview.
 */
async function sourceTopicImages(
  subTopicNames: string[],
  outputDir: string,
): Promise<Array<{ name: string; localPath: string }>> {
  console.log(`[topic-images] Sourcing images for ${subTopicNames.length} sub-topics...`);
  const results: Array<{ name: string; localPath: string }> = [];

  for (let i = 0; i < subTopicNames.length; i++) {
    const query = subTopicNames[i];
    try {
      const photo = await searchPexels(query);
      if (photo) {
        const imageBuffer = await downloadImage(photo.url);
        const localPath = path.join(outputDir, `topic_${i}.png`);
        await sharp(imageBuffer)
          .resize(640, 400, { fit: "cover", position: "attention" })
          .png()
          .toFile(localPath);
        console.log(`[topic-images] Saved image for "${query}" → topic_${i}.png`);
        results.push({ name: query, localPath });
      } else {
        console.log(`[topic-images] No image found for "${query}", using placeholder`);
        results.push({ name: query, localPath: "" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[topic-images] Failed to source image for "${query}": ${msg}`);
      results.push({ name: query, localPath: "" });
    }
  }

  return results;
}

function alignScenesToVoice(
  scenes: ScenePlan[],
  wordTimestamps: WordTimestamp[]
): AlignedScene[] {
  let wordIndex = 0;
  let lastEndTime = 0;

  return scenes.map((scene) => {
    // topic_list scenes have no narration — give them fixed duration
    if (scene.scene_type === "topic_list") {
      const fixedDuration = scene.duration_estimate_seconds;
      const startTime = lastEndTime;
      const endTime = startTime + fixedDuration;
      lastEndTime = endTime;
      return {
        ...scene,
        startTime,
        endTime,
        durationSeconds: fixedDuration,
        durationInFrames: Math.round(fixedDuration * 30),
      };
    }

    const sceneWords = scene.narration_text.split(/\s+/).filter(Boolean);
    const startTime = wordTimestamps[wordIndex]?.start || lastEndTime;
    wordIndex += sceneWords.length;
    const endTime =
      wordTimestamps[Math.min(wordIndex - 1, wordTimestamps.length - 1)]
        ?.end || startTime + 1;
    const durationSeconds = Math.max(endTime - startTime, 1);
    lastEndTime = endTime;
    return {
      ...scene,
      startTime,
      endTime,
      durationSeconds,
      durationInFrames: Math.round(durationSeconds * 30),
    };
  });
}

function buildRemotionData(
  alignedScenes: AlignedScene[],
  images: SourcedImage[],
  _config: ChannelConfig
): VideoData {
  let imageIndex = 0;

  const scenes: SceneData[] = alignedScenes.map((scene) => {
    // Topic list scenes: pass topic grid data with image paths
    if (scene.scene_type === "topic_list") {
      const topicListData = scene.topic_list_data ? {
        items: scene.topic_list_data.items.map((item) => ({
          name: item.name,
          imageSrc: item.image_path, // absolute path, prepareAssets will copy
        })),
        highlightedIndex: scene.topic_list_data.highlighted_index,
      } : undefined;

      return {
        durationInFrames: scene.durationInFrames,
        sceneType: "topic_list" as const,
        imageSrc: "",
        camera: "static" as const,
        pictograms: [],
        textLabels: [],
        topicListData,
      };
    }

    const image = images[imageIndex];
    imageIndex++;

    const imageSrc =
      scene.scene_type === "reference_image" && image && image.localPath
        ? image.localPath
        : "";

    const pictograms = (scene.pictogram_positions || []).map((p) => {
      const svgPath = resolvePictogramPath(p.id);
      return {
        src: svgPath,
        xPercent: p.x_percent,
        yPercent: p.y_percent,
        scale: p.scale || 1.0,
      };
    });

    const textLabels = (scene.text_labels || []).map((t) => ({
      text: t.text,
      xPercent: t.x_percent,
      yPercent: t.y_percent,
      size: t.size,
      color: t.color || "black",
    }));

    return {
      durationInFrames: scene.durationInFrames,
      sceneType: scene.scene_type || "doodle",
      imageSrc,
      camera: scene.camera?.type || "zoom_in",
      pictograms,
      textLabels,
    };
  });

  return { scenes };
}

function resolvePictogramPath(id: string): string {
  const categories: Record<string, string> = {
    stick_standing: "figures",
    stick_pointing: "figures",
    stick_thinking: "figures",
    stick_shrugging: "figures",
    stick_scared: "figures",
    stick_celebrating: "figures",
    stick_running: "figures",
    stick_sitting: "figures",
    stick_falling: "figures",
    stick_looking_up: "figures",
    two_figures_talking: "figures",
    figure_pushing: "figures",
    group_of_figures: "figures",
    figure_looking_at_something: "figures",
    question_mark: "indicators",
    exclamation_mark: "indicators",
    thought_bubble: "indicators",
    speech_bubble: "indicators",
    lightbulb: "indicators",
    arrow_right: "indicators",
    arrow_left: "indicators",
    arrow_up: "indicators",
    arrow_down: "indicators",
    circle: "indicators",
    x_mark: "indicators",
    checkmark: "indicators",
    versus: "indicators",
    magnifying_glass: "props",
    telescope: "props",
    beaker: "props",
    book: "props",
    computer: "props",
    globe: "props",
    rocket: "props",
    brain: "props",
    atom: "props",
  };

  const category = categories[id] || "figures";
  const svgPath = path.resolve(
    PROJECT_ROOT,
    `assets/pictograms/${category}/${id}.svg`
  );
  if (fs.existsSync(svgPath)) return svgPath;

  const pngPath = svgPath.replace(".svg", ".png");
  if (fs.existsSync(pngPath)) return pngPath;

  return svgPath;
}

function selectThumbnailImages(
  alignedScenes: AlignedScene[],
  images: SourcedImage[]
): Array<{ path: string; label: string }> {
  const result: Array<{ path: string; label: string }> = [];

  let imageIndex = 0;
  for (let i = 0; i < alignedScenes.length && result.length < 9; i++) {
    const scene = alignedScenes[i];
    if (scene.scene_type === "topic_list") continue;
    const image = images[imageIndex];
    imageIndex++;
    if (image && image.localPath && fs.existsSync(image.localPath)) {
      const label =
        scene.text_labels?.[0]?.text ||
        scene.narration_text.split(/\s+/).slice(0, 3).join(" ");
      result.push({ path: image.localPath, label });
    }
  }

  if (result.length < 3) {
    for (let i = 0; i < alignedScenes.length && result.length < 9; i++) {
      const scene = alignedScenes[i];
      if (scene.text_labels?.length) {
        const label = scene.text_labels[0].text;
        if (!result.some((r) => r.label === label)) {
          result.push({ path: "", label });
        }
      }
    }
  }

  return result;
}

export async function generateVideo(topic: string) {
  const config = loadConfig(PROJECT_ROOT);
  const videoId = crypto.randomUUID().substring(0, 8);
  const outputDir = path.resolve(PROJECT_ROOT, `output/${videoId}`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, "scenes"), { recursive: true });

  console.log(`\n========================================`);
  console.log(`  PICTOGRAM ENGINE`);
  console.log(`  Topic: "${topic}"`);
  console.log(`  ID: ${videoId}`);
  console.log(`========================================\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 1: Generate script
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 1/10] Generating script...");
  const script = await generateScript(topic, config.script);
  fs.writeFileSync(
    path.join(outputDir, "script.json"),
    JSON.stringify(script, null, 2)
  );
  console.log(
    `  Done: ${script.wordCount} words, ${script.subTopics.length} sub-topics\n`
  );

  // ═══════════════════════════════════════════════════════════
  // STEP 1.5: Source images for topic grid overview
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 1.5/10] Sourcing topic grid images...");
  const subTopicNames = script.subTopics.map((s) => s.name);
  const topicImages = await sourceTopicImages(subTopicNames, path.join(outputDir, "scenes"));
  console.log(`  Done: ${topicImages.filter(t => t.localPath).length}/${topicImages.length} topic images sourced\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 2: Plan scenes + inject topic grid
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 2/10] Planning scenes...");
  const rawScenePlan = await planScenes(script.fullText, config.visuals);

  // Inject topic grid scenes programmatically
  const subTopicNarrations = script.subTopics.map((s) => s.narrationText);
  const scenePlan = injectTopicListScenes(rawScenePlan, topicImages, subTopicNarrations);

  fs.writeFileSync(
    path.join(outputDir, "scene-plan.json"),
    JSON.stringify(scenePlan, null, 2)
  );
  const doodleCount = scenePlan.filter((s) => s.scene_type === "doodle").length;
  const refCount = scenePlan.filter((s) => s.scene_type === "reference_image").length;
  const topicListCount = scenePlan.filter((s) => s.scene_type === "topic_list").length;
  console.log(`  Done: ${scenePlan.length} scenes planned (${doodleCount} doodle, ${refCount} reference, ${topicListCount} topic grid)\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 3: Generate voice + source images IN PARALLEL
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 3/10] Generating voice & sourcing images (parallel)...");

  // Only pass non-topic-list scenes to image sourcer
  const scenesForImages = scenePlan.filter((s) => s.scene_type !== "topic_list");

  const [voiceResult, images] = await Promise.all([
    generateVoice(script.fullNarration, config.voice),
    sourceImagesForScenes(
      scenesForImages,
      config.image_sourcing,
      path.join(outputDir, "scenes")
    ),
  ]);
  fs.writeFileSync(path.join(outputDir, "voice.mp3"), voiceResult.audioBuffer);
  fs.writeFileSync(
    path.join(outputDir, "timestamps.json"),
    JSON.stringify(voiceResult.wordTimestamps, null, 2)
  );
  console.log(`  Voice: ${voiceResult.durationSeconds.toFixed(1)}s`);
  console.log(`  Images: ${images.length} sourced\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 4: Align scenes to voice timestamps
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 4/10] Aligning scenes to voice...");
  const alignedScenes = alignScenesToVoice(
    scenePlan,
    voiceResult.wordTimestamps
  );
  fs.writeFileSync(
    path.join(outputDir, "aligned-scenes.json"),
    JSON.stringify(alignedScenes, null, 2)
  );
  console.log(`  Done: ${alignedScenes.length} scenes aligned to audio\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 5: Render visual track with Remotion
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 5/10] Rendering visual track (Remotion)...");
  const visualTrackPath = path.join(outputDir, "visual_track.mp4");
  const videoData = buildRemotionData(alignedScenes, images, config);
  fs.writeFileSync(
    path.join(outputDir, "remotion-data.json"),
    JSON.stringify(videoData, null, 2)
  );
  await renderVideoWithRemotion(videoData, visualTrackPath);
  console.log(`  Done: Visual track rendered\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 6: Assemble final video with FFmpeg
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 6/10] Assembling final video (FFmpeg)...");
  const musicTrack = selectMusicTrack(scenePlan, config.music);
  const finalVideoPath = path.join(outputDir, "final.mp4");
  await assembleWithFFmpeg(
    visualTrackPath,
    path.join(outputDir, "voice.mp3"),
    musicTrack,
    finalVideoPath
  );
  console.log(`  Done: Final video assembled\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 7: Generate thumbnail
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 7/10] Generating thumbnail...");
  const thumbnailPath = path.join(outputDir, "thumbnail.png");
  const thumbnailImages = selectThumbnailImages(alignedScenes, images);
  await generateThumbnail(script.title, thumbnailImages, thumbnailPath);
  console.log(`  Done: Thumbnail generated\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 8: Generate metadata + captions
  // ═══════════════════════════════════════════════════════════
  console.log("[Step 8/10] Generating metadata & captions...");
  const metadata = await generateMetadata(script, topic, config.upload);
  const srt = generateSRT(voiceResult.wordTimestamps);
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );
  fs.writeFileSync(path.join(outputDir, "captions.srt"), srt);
  console.log(`  Done: Metadata and captions ready\n`);

  // ═══════════════════════════════════════════════════════════
  // STEP 9: Upload (optional)
  // ═══════════════════════════════════════════════════════════
  if (process.env.AUTO_UPLOAD === "true") {
    console.log("[Step 9/10] Uploading to YouTube...");
    const youtubeId = await uploadToYouTube(
      finalVideoPath,
      thumbnailPath,
      metadata
    );
    console.log(
      `  Done: Uploaded → https://youtube.com/watch?v=${youtubeId}\n`
    );
  } else {
    console.log("[Step 9/10] Upload skipped (AUTO_UPLOAD not enabled)\n");
  }

  console.log(`========================================`);
  console.log(`  VIDEO COMPLETE`);
  console.log(`  Output: ${outputDir}/final.mp4`);
  console.log(`========================================\n`);

  return { videoId, outputDir, finalVideoPath };
}
