import type {
  ParsedScript,
  ScenePlanV2,
  AlignedSceneV2,
  TimelineSegment,
  FormatTemplate,
} from "./types-v2.js";
import type { WordTimestamp } from "../plugins/voice-gen/types.js";

/**
 * Align individual scenes within a narrated section to word timestamps.
 * Distributes frames proportionally based on word count per scene.
 */
function alignSectionScenes(
  scenes: ScenePlanV2[],
  wordTimestamps: WordTimestamp[],
  startWordIdx: number,
  totalFrames: number,
  fps: number,
): { aligned: AlignedSceneV2[]; wordsConsumed: number } {
  // Count total words across all scenes
  const sceneWordCounts = scenes.map(
    (s) => s.narration_text.split(/\s+/).filter(Boolean).length || 1,
  );
  const totalWords = sceneWordCounts.reduce((a, b) => a + b, 0);

  const aligned: AlignedSceneV2[] = [];
  let currentFrame = 0;
  let wordIdx = startWordIdx;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneWords = sceneWordCounts[i];

    // Proportional frame allocation
    const proportion = sceneWords / totalWords;
    const sceneDurationFrames =
      i === scenes.length - 1
        ? totalFrames - currentFrame // last scene gets remaining frames
        : Math.round(totalFrames * proportion);

    const startTime = wordIdx < wordTimestamps.length
      ? wordTimestamps[wordIdx].start
      : 0;
    const endWordIdx = Math.min(wordIdx + sceneWords, wordTimestamps.length) - 1;
    const endTime = endWordIdx >= 0 && endWordIdx < wordTimestamps.length
      ? wordTimestamps[endWordIdx].end
      : startTime + sceneDurationFrames / fps;

    aligned.push({
      ...scene,
      startTime,
      endTime,
      durationSeconds: endTime - startTime,
      durationInFrames: Math.max(sceneDurationFrames, fps), // minimum 1 second
    });

    currentFrame += sceneDurationFrames;
    wordIdx += sceneWords;
  }

  return { aligned, wordsConsumed: totalWords };
}

/**
 * Count words in a text string.
 */
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Build the structural timeline for a v2 video.
 *
 * Timeline structure:
 *   HOOK (narrated) → OVERVIEW (narrated)
 *   → [ZOOM_TO_CELL + BRIDGE (narrated over zoom) → NUMBER_CARD (silent)
 *      → SECTION (narrated) → PULL_BACK (silent)] × N
 *   → OUTRO (narrated)
 */
export function alignStructuralTimeline(
  script: ParsedScript,
  sectionPlans: Map<number, ScenePlanV2[]>,
  wordTimestamps: WordTimestamp[],
  format: FormatTemplate,
  fps: number = 30,
): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let wordIdx = 0;
  let currentFrame = 0;

  const secondsToFrames = (s: number) => Math.round(s * fps);

  // --- HOOK ---
  const hookWords = countWords(script.hook);
  const hookScenes = sectionPlans.get(-1) || [];
  if (hookWords > 0) {
    const hookEndWordIdx = Math.min(wordIdx + hookWords, wordTimestamps.length) - 1;
    const hookEndTime = hookEndWordIdx >= 0 ? wordTimestamps[hookEndWordIdx].end : 5;
    const hookDurationFrames = secondsToFrames(hookEndTime - (wordTimestamps[wordIdx]?.start ?? 0));

    const { aligned: hookAligned } = alignSectionScenes(
      hookScenes.length > 0 ? hookScenes : [{ scene_id: "hook_0", scene_type: "cinematic_ai", narration_text: script.hook, duration_estimate_seconds: hookEndTime, image_search_query: "", ai_image_prompt: script.hook.slice(0, 100), camera: { type: "zoom_in_dramatic" as const }, mood: "dramatic" as const }],
      wordTimestamps,
      wordIdx,
      hookDurationFrames,
      fps,
    );

    segments.push({
      type: "hook",
      startFrame: currentFrame,
      durationInFrames: hookDurationFrames,
      narrationText: script.hook,
      scenes: hookAligned,
    });
    currentFrame += hookDurationFrames;
    wordIdx += hookWords;
  }

  // --- OVERVIEW (grid reveal) ---
  const overviewWords = countWords(script.overview);
  if (overviewWords > 0) {
    const overviewEndWordIdx = Math.min(wordIdx + overviewWords, wordTimestamps.length) - 1;
    const overviewEndTime = overviewEndWordIdx >= 0 ? wordTimestamps[overviewEndWordIdx].end : 4;
    const overviewStartTime = wordTimestamps[wordIdx]?.start ?? 0;
    const overviewDuration = Math.max(
      secondsToFrames(overviewEndTime - overviewStartTime),
      secondsToFrames(format.timing.grid_overview_seconds),
    );

    segments.push({
      type: "overview",
      startFrame: currentFrame,
      durationInFrames: overviewDuration,
      narrationText: script.overview,
    });
    currentFrame += overviewDuration;
    wordIdx += overviewWords;
  }

  // --- PER-TOPIC SECTIONS ---
  for (let i = 0; i < script.subTopics.length; i++) {
    const topic = script.subTopics[i];
    const completedCells = Array.from({ length: i }, (_, k) => k);

    // ZOOM_TO_CELL (bridge narration plays over this)
    const bridgeText = i < script.bridges.length ? script.bridges[i] : "";
    const bridgeWords = countWords(bridgeText);
    const zoomDuration = Math.max(
      secondsToFrames(format.timing.zoom_transition_seconds),
      bridgeWords > 0 ? secondsToFrames(bridgeWords / 2.5) : 0, // ~2.5 words/sec
    );

    segments.push({
      type: "zoom_to_cell",
      startFrame: currentFrame,
      durationInFrames: zoomDuration,
      topicIndex: i,
      topicName: topic.name,
      narrationText: bridgeText || undefined,
      completedCells,
    });
    currentFrame += zoomDuration;
    wordIdx += bridgeWords;

    // NUMBER_CARD (silent)
    const numberCardDuration = secondsToFrames(format.timing.number_card_seconds);
    segments.push({
      type: "number_card",
      startFrame: currentFrame,
      durationInFrames: numberCardDuration,
      topicIndex: i,
      topicName: topic.name,
      numberCardNumber: script.subTopics.length - i, // countdown: 5, 4, 3, 2, 1
    });
    currentFrame += numberCardDuration;

    // SECTION CONTENT (narrated)
    const sectionScenes = sectionPlans.get(i) || [];
    const sectionWords = countWords(topic.narrationText);
    const sectionEndWordIdx = Math.min(wordIdx + sectionWords, wordTimestamps.length) - 1;
    const sectionStartTime = wordTimestamps[wordIdx]?.start ?? 0;
    const sectionEndTime = sectionEndWordIdx >= 0
      ? wordTimestamps[sectionEndWordIdx].end
      : sectionStartTime + sectionWords / 2.5;
    const sectionDuration = secondsToFrames(sectionEndTime - sectionStartTime);

    let sectionAligned: AlignedSceneV2[] = [];
    if (sectionScenes.length > 0) {
      const result = alignSectionScenes(sectionScenes, wordTimestamps, wordIdx, sectionDuration, fps);
      sectionAligned = result.aligned;
    }

    segments.push({
      type: "section",
      startFrame: currentFrame,
      durationInFrames: sectionDuration,
      topicIndex: i,
      topicName: topic.name,
      narrationText: topic.narrationText,
      scenes: sectionAligned,
    });
    currentFrame += sectionDuration;
    wordIdx += sectionWords;

    // PULL_BACK (silent) — skip for last section
    if (i < script.subTopics.length - 1) {
      const pullBackDuration = secondsToFrames(format.timing.pull_back_seconds);
      segments.push({
        type: "pull_back",
        startFrame: currentFrame,
        durationInFrames: pullBackDuration,
        topicIndex: i,
        completedCells: [...completedCells, i],
      });
      currentFrame += pullBackDuration;
    }
  }

  // --- OUTRO ---
  const outroWords = countWords(script.outro);
  const outroScenes = sectionPlans.get(-2) || [];
  if (outroWords > 0) {
    const outroEndWordIdx = Math.min(wordIdx + outroWords, wordTimestamps.length) - 1;
    const outroStartTime = wordTimestamps[wordIdx]?.start ?? 0;
    const outroEndTime = outroEndWordIdx >= 0
      ? wordTimestamps[outroEndWordIdx].end
      : outroStartTime + outroWords / 2.5;
    const outroDuration = secondsToFrames(outroEndTime - outroStartTime);

    const { aligned: outroAligned } = alignSectionScenes(
      outroScenes.length > 0 ? outroScenes : [{ scene_id: "outro_0", scene_type: "cinematic_ai", narration_text: script.outro, duration_estimate_seconds: outroDuration / fps, image_search_query: "", ai_image_prompt: "", camera: { type: "zoom_out" as const }, mood: "calm" as const }],
      wordTimestamps,
      wordIdx,
      outroDuration,
      fps,
    );

    segments.push({
      type: "outro",
      startFrame: currentFrame,
      durationInFrames: outroDuration,
      narrationText: script.outro,
      scenes: outroAligned,
    });
    currentFrame += outroDuration;
  }

  console.log(`[alignment] Built ${segments.length} timeline segments, ${currentFrame} total frames (${(currentFrame / fps).toFixed(1)}s)`);
  return segments;
}

/**
 * Calculate total video duration from timeline segments.
 */
export function calculateTotalFramesFromTimeline(segments: TimelineSegment[]): number {
  if (segments.length === 0) return 900;
  const last = segments[segments.length - 1];
  return last.startFrame + last.durationInFrames;
}
