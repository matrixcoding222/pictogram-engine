import { generateScript } from "../plugins/script-gen/claude-script-gen.js";
import { planScenes, injectTopicListScenes, planAllSections } from "../plugins/scene-planner/claude-scene-planner.js";
import { generateVoice } from "../plugins/voice-gen/elevenlabs.js";
import { sourceImagesForScenes, sourceImagesForScenesV2 } from "../plugins/image-sourcer/image-pipeline.js";
import { searchPexels } from "../plugins/image-sourcer/pexels.js";
import { renderVideoWithRemotion, renderVideoWithRemotionV2 } from "../plugins/compositor/render.js";
import {
  assembleWithFFmpeg,
  selectMusicTrack,
} from "../plugins/compositor/ffmpeg-assembler.js";
import { generateThumbnail } from "../plugins/thumbnail-gen/grid-thumbnail.js";
import { generateMetadata } from "../plugins/metadata-gen/youtube-seo.js";
import { uploadToYouTube } from "../plugins/uploader/youtube-upload.js";
import { generateSRT } from "../plugins/captions/srt-generator.js";
import { loadConfig } from "./config.js";
import { loadFormatTemplate } from "./format-loader.js";
import { alignStructuralTimeline, calculateTotalFramesFromTimeline } from "./alignment.js";
import { directGridArt } from "../plugins/grid-art/art-director.js";
import { generateAllGridArt } from "../plugins/grid-art/grid-art-generator.js";
import type { ChannelConfig } from "./config.js";
import type { FormatTemplate, TimelineSegment, ScenePlanV2, SourcedImageV2 } from "./types-v2.js";
import type { AlignedScene } from "../plugins/scene-planner/types.js";
import type { ScenePlan } from "../plugins/scene-planner/types.js";
import type { WordTimestamp } from "../plugins/voice-gen/types.js";
import type { SourcedImage } from "../plugins/image-sourcer/types.js";
import type { VideoData, SceneData, VideoDataV2, SegmentRenderData, SceneRenderData } from "../plugins/compositor/remotion-project/src/types.js";
import sharp from "sharp";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// ═══════════════════════════════════════════════════════════════════
// Shared Helpers
// ═══════════════════════════════════════════════════════════════════

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image from ${url} (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// ═══════════════════════════════════════════════════════════════════
// V1 Pipeline (preserved for backward compat)
// ═══════════════════════════════════════════════════════════════════

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
    if (scene.scene_type === "topic_list") {
      const topicListData = scene.topic_list_data ? {
        items: scene.topic_list_data.items.map((item) => ({
          name: item.name,
          imageSrc: item.image_path,
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

  console.log("[Step 1/10] Generating script...");
  const script = await generateScript(topic, config.script);
  fs.writeFileSync(
    path.join(outputDir, "script.json"),
    JSON.stringify(script, null, 2)
  );
  console.log(
    `  Done: ${script.wordCount} words, ${script.subTopics.length} sub-topics\n`
  );

  console.log("[Step 1.5/10] Sourcing topic grid images...");
  const subTopicNames = script.subTopics.map((s) => s.name);
  const topicImages = await sourceTopicImages(subTopicNames, path.join(outputDir, "scenes"));
  console.log(`  Done: ${topicImages.filter(t => t.localPath).length}/${topicImages.length} topic images sourced\n`);

  console.log("[Step 2/10] Planning scenes...");
  const rawScenePlan = await planScenes(script.fullText ?? script.fullNarration, config.visuals);
  const subTopicNarrations = script.subTopics.map((s) => s.narrationText);
  const scenePlan = injectTopicListScenes(rawScenePlan, topicImages, subTopicNarrations);
  fs.writeFileSync(
    path.join(outputDir, "scene-plan.json"),
    JSON.stringify(scenePlan, null, 2)
  );
  console.log(`  Done: ${scenePlan.length} scenes planned\n`);

  console.log("[Step 3/10] Generating voice & sourcing images (parallel)...");
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

  console.log("[Step 4/10] Aligning scenes to voice...");
  const alignedScenes = alignScenesToVoice(scenePlan, voiceResult.wordTimestamps);
  fs.writeFileSync(
    path.join(outputDir, "aligned-scenes.json"),
    JSON.stringify(alignedScenes, null, 2)
  );
  console.log(`  Done: ${alignedScenes.length} scenes aligned\n`);

  console.log("[Step 5/10] Rendering visual track (Remotion)...");
  const visualTrackPath = path.join(outputDir, "visual_track.mp4");
  const videoData = buildRemotionData(alignedScenes, images, config);
  fs.writeFileSync(
    path.join(outputDir, "remotion-data.json"),
    JSON.stringify(videoData, null, 2)
  );
  await renderVideoWithRemotion(videoData, visualTrackPath);
  console.log(`  Done: Visual track rendered\n`);

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

  console.log("[Step 7/10] Generating thumbnail...");
  const thumbnailPath = path.join(outputDir, "thumbnail.png");
  const thumbnailImages = selectThumbnailImages(alignedScenes, images);
  await generateThumbnail(script.title, thumbnailImages, thumbnailPath);
  console.log(`  Done: Thumbnail generated\n`);

  console.log("[Step 8/10] Generating metadata & captions...");
  const metadata = await generateMetadata(script, topic, config.upload);
  const srt = generateSRT(voiceResult.wordTimestamps);
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );
  fs.writeFileSync(path.join(outputDir, "captions.srt"), srt);
  console.log(`  Done: Metadata and captions ready\n`);

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

// ═══════════════════════════════════════════════════════════════════
// V2 Pipeline — Grid-Based Visual Storytelling
// ═══════════════════════════════════════════════════════════════════

/**
 * Build Remotion-ready data from the structural timeline, sourced images,
 * and grid cell art.
 */
function buildRemotionDataV2(
  timeline: TimelineSegment[],
  sectionImages: Map<number, SourcedImageV2[]>,
  gridCellArt: Array<{ topicName: string; localPath: string }>,
  wordTimestamps: WordTimestamp[],
  format: FormatTemplate,
  fps: number,
): VideoDataV2 {
  const segments: SegmentRenderData[] = timeline.map((seg) => {
    const base: SegmentRenderData = {
      type: seg.type,
      startFrame: seg.startFrame,
      durationInFrames: seg.durationInFrames,
      narrationText: seg.narrationText,
      topicIndex: seg.topicIndex,
      topicName: seg.topicName,
      completedCells: seg.completedCells,
      numberCardNumber: seg.numberCardNumber,
    };

    // Attach scene render data for segments with aligned scenes
    if (seg.scenes && seg.scenes.length > 0) {
      // Find the corresponding images for this segment's section
      const sectionKey = seg.type === "hook" ? -1 : seg.type === "outro" ? -2 : (seg.topicIndex ?? 0);
      const images = sectionImages.get(sectionKey) || [];

      let sceneOffset = 0;
      base.scenes = seg.scenes.map((scene, i) => {
        const image = images[i];
        const render: SceneRenderData = {
          sceneType: scene.scene_type,
          camera: scene.camera.type,
          mood: scene.mood,
          imageSrc: image?.localPath || "",
          textCardContent: scene.text_card_content,
          durationInFrames: scene.durationInFrames,
          startFrame: sceneOffset,
        };
        sceneOffset += scene.durationInFrames;
        return render;
      });
    }

    return base;
  });

  return {
    segments,
    gridCells: gridCellArt.map((cell) => ({
      topicName: cell.topicName,
      imageSrc: cell.localPath,
    })),
    wordTimestamps: wordTimestamps.map((w) => ({
      word: w.word,
      start: w.start,
      end: w.end,
    })),
    captions: {
      enabled: format.captions.enabled,
      wordsPerGroup: format.captions.words_per_group,
      position: format.captions.position,
      fontSize: format.captions.font_size,
      highlightColor: format.captions.highlight_color,
      baseColor: format.captions.base_color,
      backgroundOpacity: format.captions.background_opacity,
    },
    fps,
    gridConfig: {
      columns: format.grid.columns,
      backgroundColor: format.grid.background_color,
      cellBorderColor: format.grid.cell_border_color,
      cellHighlightColor: format.grid.cell_highlight_color,
    },
    numberCardConfig: {
      backgroundColor: format.number_card.background_color,
      numberColor: format.number_card.number_color,
      glowColor: format.number_card.glow_color,
    },
  };
}

/**
 * V2 video generation pipeline.
 *
 * Step 1:  Generate format-aware script
 * Step 2:  Generate grid cell art (Claude art direction + FLUX)
 * Step 3:  Plan section scenes (per-section Claude calls)
 * Step 4:  Generate voice + source section images (parallel)
 * Step 5:  Structural alignment
 * Step 6:  Build Remotion data
 * Step 7:  Render visual track (Remotion)
 * Step 8:  Assemble final video (FFmpeg)
 * Step 9:  Generate thumbnail + metadata + captions
 * Step 10: Upload (optional)
 */
export async function generateVideoV2(topic: string) {
  const config = loadConfig(PROJECT_ROOT);
  const format = loadFormatTemplate(config.default_format, PROJECT_ROOT);
  const fps = 30;
  const videoId = crypto.randomUUID().substring(0, 8);
  const outputDir = path.resolve(PROJECT_ROOT, `output/${videoId}`);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.join(outputDir, "scenes"), { recursive: true });
  fs.mkdirSync(path.join(outputDir, "grid-cells"), { recursive: true });

  console.log(`\n════════════════════════════════════════`);
  console.log(`  PICTOGRAM ENGINE v2`);
  console.log(`  Topic: "${topic}"`);
  console.log(`  Format: ${format.format_name}`);
  console.log(`  ID: ${videoId}`);
  console.log(`════════════════════════════════════════\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Generate format-aware script
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 1/10] Generating script...");
  const script = await generateScript(topic, config.script);
  fs.writeFileSync(
    path.join(outputDir, "script.json"),
    JSON.stringify(script, null, 2),
  );
  console.log(`  Title: "${script.title}"`);
  console.log(`  ${script.wordCount} words, ${script.subTopics.length} sub-topics`);
  console.log(`  Hook: ${script.hook.split(/\s+/).length} words`);
  console.log(`  Bridges: ${script.bridges.length}\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Generate grid cell art
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 2/10] Generating grid cell art...");
  console.log("  Art directing with Claude...");
  const artDirection = await directGridArt(script.subTopics);
  fs.writeFileSync(
    path.join(outputDir, "art-direction.json"),
    JSON.stringify(artDirection, null, 2),
  );

  console.log("  Generating cell images with FLUX...");
  const gridCellArt = await generateAllGridArt(
    artDirection,
    format.grid,
    path.join(outputDir, "grid-cells"),
  );
  const gridSuccess = gridCellArt.filter((c) => c.source !== "none").length;
  console.log(`  Done: ${gridSuccess}/${gridCellArt.length} grid cells generated\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Plan section scenes
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 3/10] Planning section scenes...");
  const sectionPlans = await planAllSections(
    script,
    format.section_content.min_scenes_per_section,
    format.section_content.max_scenes_per_section,
  );
  // Save section plans
  const sectionPlansSerialized: Record<string, ScenePlanV2[]> = {};
  for (const [key, scenes] of sectionPlans) {
    sectionPlansSerialized[String(key)] = scenes;
  }
  fs.writeFileSync(
    path.join(outputDir, "section-plans.json"),
    JSON.stringify(sectionPlansSerialized, null, 2),
  );
  let totalScenes = 0;
  for (const scenes of sectionPlans.values()) totalScenes += scenes.length;
  console.log(`  Done: ${totalScenes} scenes across ${sectionPlans.size} sections\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Generate voice + source section images (PARALLEL)
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 4/10] Generating voice & sourcing images (parallel)...");

  // Collect all scenes for image sourcing
  const allScenes: ScenePlanV2[] = [];
  const sceneToSection: number[] = []; // maps scene index → section key
  for (const [key, scenes] of sectionPlans) {
    for (const scene of scenes) {
      allScenes.push(scene);
      sceneToSection.push(key);
    }
  }

  const [voiceResult, allImages] = await Promise.all([
    generateVoice(script.fullNarration, config.voice),
    sourceImagesForScenesV2(allScenes, path.join(outputDir, "scenes")),
  ]);

  fs.writeFileSync(path.join(outputDir, "voice.mp3"), voiceResult.audioBuffer);
  fs.writeFileSync(
    path.join(outputDir, "timestamps.json"),
    JSON.stringify(voiceResult.wordTimestamps, null, 2),
  );
  console.log(`  Voice: ${voiceResult.durationSeconds.toFixed(1)}s`);
  console.log(`  Images: ${allImages.length} sourced\n`);

  // Redistribute images back to section map
  const sectionImages = new Map<number, SourcedImageV2[]>();
  for (let i = 0; i < allImages.length; i++) {
    const key = sceneToSection[i];
    if (!sectionImages.has(key)) sectionImages.set(key, []);
    sectionImages.get(key)!.push(allImages[i]);
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Structural alignment
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 5/10] Building structural timeline...");
  const timeline = alignStructuralTimeline(
    script,
    sectionPlans,
    voiceResult.wordTimestamps,
    format,
    fps,
  );
  fs.writeFileSync(
    path.join(outputDir, "timeline.json"),
    JSON.stringify(timeline, null, 2),
  );
  const totalFrames = calculateTotalFramesFromTimeline(timeline);
  console.log(`  ${timeline.length} segments, ${totalFrames} frames (${(totalFrames / fps).toFixed(1)}s)\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Build Remotion data
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 6/10] Building Remotion render data...");
  const remotionData = buildRemotionDataV2(
    timeline,
    sectionImages,
    gridCellArt,
    voiceResult.wordTimestamps,
    format,
    fps,
  );
  fs.writeFileSync(
    path.join(outputDir, "remotion-data-v2.json"),
    JSON.stringify(remotionData, null, 2),
  );
  console.log(`  ${remotionData.segments.length} segments ready\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Render visual track with Remotion
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 7/10] Rendering visual track (Remotion v2)...");
  const visualTrackPath = path.join(outputDir, "visual_track.mp4");
  await renderVideoWithRemotionV2(remotionData, visualTrackPath);
  console.log(`  Done: Visual track rendered\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: Assemble final video with FFmpeg
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 8/10] Assembling final video (FFmpeg)...");
  const musicTrack = selectMusicTrack([], config.music);
  const finalVideoPath = path.join(outputDir, "final.mp4");
  await assembleWithFFmpeg(
    visualTrackPath,
    path.join(outputDir, "voice.mp3"),
    musicTrack,
    finalVideoPath,
  );
  console.log(`  Done: Final video assembled\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 9: Generate thumbnail + metadata + captions
  // ═══════════════════════════════════════════════════════════════
  console.log("[Step 9/10] Generating thumbnail, metadata & captions...");
  const thumbnailPath = path.join(outputDir, "thumbnail.png");

  // Use grid cell art as thumbnail images
  const thumbnailImages = gridCellArt
    .filter((c) => c.localPath && fs.existsSync(c.localPath))
    .map((c) => ({ path: c.localPath, label: c.topicName }));
  await generateThumbnail(script.title, thumbnailImages, thumbnailPath);

  const metadata = await generateMetadata(script, topic, config.upload);
  const srt = generateSRT(voiceResult.wordTimestamps);
  fs.writeFileSync(
    path.join(outputDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
  );
  fs.writeFileSync(path.join(outputDir, "captions.srt"), srt);
  console.log(`  Done: Thumbnail, metadata and captions ready\n`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 10: Upload (optional)
  // ═══════════════════════════════════════════════════════════════
  if (process.env.AUTO_UPLOAD === "true") {
    console.log("[Step 10/10] Uploading to YouTube...");
    const youtubeId = await uploadToYouTube(
      finalVideoPath,
      thumbnailPath,
      metadata,
    );
    console.log(
      `  Done: Uploaded → https://youtube.com/watch?v=${youtubeId}\n`,
    );
  } else {
    console.log("[Step 10/10] Upload skipped (AUTO_UPLOAD not enabled)\n");
  }

  console.log(`════════════════════════════════════════`);
  console.log(`  VIDEO COMPLETE (v2)`);
  console.log(`  Output: ${outputDir}/final.mp4`);
  console.log(`════════════════════════════════════════\n`);

  return { videoId, outputDir, finalVideoPath };
}
