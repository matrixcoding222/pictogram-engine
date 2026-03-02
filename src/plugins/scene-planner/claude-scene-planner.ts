import Anthropic from "@anthropic-ai/sdk";
import type { ScenePlan, CameraConfig, Mood, TopicListItem } from "./types.js";
import type { ScenePlanV2, CameraTypeV2, MoodV2, ParsedScript } from "../../core/types-v2.js";

const SCENE_PLANNER_SYSTEM_PROMPT = `You are a visual director for "The Paint Explainer" — a minimalist doodle animation style. You receive a narration script and break it into visual scenes, outputting a JSON array.

The video style: clean WHITE background is the canvas for every scene. Stick figure pictograms are the PRIMARY visual element — large, center-stage, expressive. Text labels are bold, colorful, and frequent. Reference photos are ONLY used when showing a specific real-world thing (a named building, animal, location, planet, artifact, etc.).

There are two scene types:

1. "doodle" — used for abstract concepts and transitions (~40-50% of scenes). White background with large stick figure pictograms and colorful text labels. NO background image. For abstract explanations, reactions, transitions, and conceptual storytelling.

Example doodle scene:
{
  "scene_id": 1,
  "scene_type": "doodle",
  "narration_text": "exact text spoken during this scene",
  "duration_estimate_seconds": 10,
  "image_search_query": "",
  "ai_image_prompt": "",
  "pictogram_ids": ["stick_thinking", "question_mark"],
  "pictogram_positions": [
    {"id": "stick_thinking", "x_percent": 40, "y_percent": 55, "scale": 1.5},
    {"id": "question_mark", "x_percent": 65, "y_percent": 30, "scale": 1.2}
  ],
  "text_labels": [{"text": "Dark Matter", "x_percent": 50, "y_percent": 12, "size": "large", "color": "blue"}],
  "camera": {"type": "zoom_in"},
  "mood": "mysterious"
}

2. "reference_image" — the PRIMARY scene type (~50-60% of scenes). Used whenever the narration mentions a specific thing the viewer should SEE — planets, locations, phenomena, objects, animals, buildings, artifacts, etc.

Example reference_image scene:
{
  "scene_id": 5,
  "scene_type": "reference_image",
  "narration_text": "exact text spoken during this scene",
  "duration_estimate_seconds": 10,
  "image_search_query": "Arecibo radio telescope Puerto Rico aerial",
  "ai_image_prompt": "",
  "pictogram_ids": ["stick_looking_up"],
  "pictogram_positions": [{"id": "stick_looking_up", "x_percent": 20, "y_percent": 70, "scale": 1.2}],
  "text_labels": [{"text": "Arecibo Observatory", "x_percent": 50, "y_percent": 10, "size": "large", "color": "green"}],
  "camera": {"type": "static"},
  "mood": "wonder"
}

RULES:
- ~40-50% of scenes should be "doodle" type, ~50-60% "reference_image"
- Use "reference_image" for EVERY specific named thing — planets, locations, phenomena, objects, animals. The viewer should SEE what is being described.
- Doodle scenes are only for abstract transitions, reactions, and conceptual explanations where no specific thing is being shown.
- For "doodle" scenes: image_search_query and ai_image_prompt should be empty strings
- For "reference_image" scenes: image_search_query must be SPECIFIC: "Arecibo radio telescope Puerto Rico aerial" not "telescope"
- Pictograms in 60-70% of scenes — they complement the visual
- Pictogram scale should be 1.0-1.5 (they are large and prominent)

LAYOUT RULES (CRITICAL — prevents overlapping elements):
- Maximum 2 pictograms per scene. NEVER use more than 2.
- If 1 pictogram: center it at x_percent 45-55, y_percent 45-60
- If 2 pictograms: place one LEFT (x_percent 25-38) and one RIGHT (x_percent 62-75), both at y_percent 45-65
- Text labels go ONLY at the TOP (y_percent 8-15) or BOTTOM (y_percent 85-92) of the screen — NEVER in the middle where pictograms are
- Maximum 1 text label per scene
- Available text label colors: "red", "blue", "green", "black", "orange", "purple"

- For abstract concepts, use pictograms + text labels on white background — do NOT use reference_image
- Only use "reference_image" for specific NAMED real things the viewer needs to see
- Camera: mostly "zoom_in" (slow zoom), some "static" — only these two options
- Keep ai_image_prompt SHORT (under 100 chars) to save tokens, only needed for reference_image scenes

Available pictogram_ids:
FIGURES: stick_standing, stick_pointing, stick_thinking, stick_shrugging, stick_scared, stick_celebrating, stick_running, stick_sitting, stick_falling, stick_looking_up
INTERACTIONS: two_figures_talking, figure_pushing, group_of_figures, figure_looking_at_something
EXPRESSIONS: question_mark, exclamation_mark, thought_bubble, speech_bubble, lightbulb
PROPS: magnifying_glass, telescope, beaker, book, computer, globe, rocket, brain, atom
INDICATORS: arrow_right, arrow_left, arrow_up, arrow_down, circle, x_mark, checkmark, versus

Return ONLY a valid JSON array. No markdown code fences. No explanation.`;

const VALID_MOODS = new Set<string>([
  "mysterious", "dramatic", "wonder", "tense", "calm", "exciting",
]);

const VALID_SCENE_TYPES = new Set<string>(["doodle", "reference_image", "topic_list"]);

const VALID_TEXT_COLORS = new Set<string>([
  "red", "blue", "green", "black", "orange", "purple",
]);

const DEFAULT_CAMERA: CameraConfig = {
  type: "zoom_in",
};

/**
 * Attempts to parse JSON from Claude's response, handling common issues
 * like markdown code fences, trailing commas, and leading/trailing text.
 */
function parseClaudeJSON(text: string): unknown {
  let cleaned = text.trim();

  // Strip markdown code fences if present
  cleaned = cleaned
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "");

  // If the response has leading text before the JSON array, extract just the array
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    cleaned = cleaned.substring(arrayStart, arrayEnd + 1);
  }

  // Remove trailing commas before closing braces/brackets (invalid JSON)
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch (_firstErr) {
    // The response was likely truncated by max_tokens.
    // Strategy: extract all individually parseable JSON objects from the array.
    console.log("[scene-planner] JSON truncated, attempting salvage...");

    const objects: unknown[] = [];
    let depth = 0;
    let objStart = -1;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];

      // Skip characters inside strings
      if (ch === '"') {
        i++; // move past the opening quote
        while (i < cleaned.length) {
          if (cleaned[i] === '\\') { i++; } // skip escaped char
          else if (cleaned[i] === '"') { break; }
          i++;
        }
        continue;
      }

      if (ch === '{') {
        if (depth === 0) objStart = i;
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0 && objStart !== -1) {
          const objStr = cleaned.substring(objStart, i + 1);
          try {
            objects.push(JSON.parse(objStr));
          } catch {
            // Skip malformed objects
          }
          objStart = -1;
        }
      }
    }

    if (objects.length > 0) {
      console.log(`[scene-planner] Salvaged ${objects.length} complete scenes from truncated response`);
      return objects;
    }

    throw new Error(
      `Failed to parse scene plan JSON from Claude response. Could not salvage any complete scene objects.\nRaw text starts with: ${text.substring(0, 200)}`,
    );
  }
}

/**
 * Validates a scene_type string, defaulting to "doodle".
 */
function validateSceneType(sceneType: unknown): "doodle" | "reference_image" | "topic_list" {
  if (typeof sceneType === "string" && VALID_SCENE_TYPES.has(sceneType)) {
    return sceneType as "doodle" | "reference_image" | "topic_list";
  }
  return "doodle";
}

/**
 * Validates a camera config object, returning a sanitized copy or the default.
 */
function validateCamera(cam: unknown): CameraConfig {
  if (!cam || typeof cam !== "object") return { ...DEFAULT_CAMERA };

  const obj = cam as Record<string, unknown>;
  const validTypes = ["zoom_in", "static"];
  const type = validTypes.includes(obj.type as string)
    ? (obj.type as CameraConfig["type"])
    : "zoom_in";

  return { type };
}

/**
 * Validates text labels, ensuring colors are valid.
 */
function validateTextLabels(labels: unknown): Array<{
  text: string;
  x_percent: number;
  y_percent: number;
  size: "small" | "medium" | "large";
  color?: "red" | "blue" | "green" | "black" | "orange" | "purple";
}> {
  if (!Array.isArray(labels)) return [];

  const validSizes = new Set(["small", "medium", "large"]);

  return labels.map((label: Record<string, unknown>) => {
    const result: Record<string, unknown> = {
      text: typeof label.text === "string" ? label.text : "",
      x_percent: typeof label.x_percent === "number" ? label.x_percent : 50,
      y_percent: typeof label.y_percent === "number" ? label.y_percent : 15,
      size: validSizes.has(label.size as string) ? label.size : "medium",
    };
    if (typeof label.color === "string" && VALID_TEXT_COLORS.has(label.color)) {
      result.color = label.color;
    }
    return result as {
      text: string;
      x_percent: number;
      y_percent: number;
      size: "small" | "medium" | "large";
      color?: "red" | "blue" | "green" | "black" | "orange" | "purple";
    };
  });
}

/**
 * Validates a mood string against the known set of moods.
 */
function validateMood(mood: unknown): Mood {
  if (typeof mood === "string" && VALID_MOODS.has(mood)) {
    return mood as Mood;
  }
  return "mysterious";
}

/**
 * Clamps scene duration to a reasonable range (3-30 seconds).
 */
function clampDuration(duration: unknown): number {
  if (typeof duration !== "number" || isNaN(duration)) return 10;
  return Math.max(3, Math.min(30, duration));
}

/**
 * Creates a topic_list scene for the photo grid display.
 */
function createTopicListScene(
  sceneId: string,
  topicItems: TopicListItem[],
  highlightedIndex: number,
  durationSeconds: number,
): ScenePlan {
  return {
    scene_id: sceneId,
    scene_type: "topic_list",
    narration_text: "",
    duration_estimate_seconds: durationSeconds,
    image_search_query: "",
    ai_image_prompt: "",
    pictogram_ids: [],
    pictogram_positions: [],
    text_labels: [],
    camera: { type: "static" },
    mood: "calm",
    topic_list_data: {
      items: topicItems,
      highlighted_index: highlightedIndex,
    },
  };
}

/**
 * Normalizes text for comparison: lowercase, remove punctuation, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Injects topic_list scenes (photo grid) into the scene plan:
 * 1. An overview scene after the hook (highlighted_index = -1, shows full grid)
 * 2. A transition scene before each new sub-topic (highlighted_index = N, zooms in)
 *
 * Topic boundaries are detected by matching sub-topic narration against scene text.
 */
export function injectTopicListScenes(
  scenes: ScenePlan[],
  topicImages: Array<{ name: string; localPath: string }>,
  subTopicNarrations: string[],
): ScenePlan[] {
  if (topicImages.length === 0 || scenes.length === 0) return scenes;

  // Convert to TopicListItem format
  const topicItems: TopicListItem[] = topicImages.map((t) => ({
    name: t.name,
    image_path: t.localPath,
  }));

  // Build normalized "first N words" for each sub-topic to detect boundaries
  const topicStarters = subTopicNarrations.map((narr) => {
    const words = normalizeText(narr).split(" ").slice(0, 15).join(" ");
    return words;
  });

  const result: ScenePlan[] = [];

  // Determine where to insert the overview (after hook scenes)
  const hookEndIndex = Math.min(2, scenes.length);

  // Insert hook scenes first
  for (let i = 0; i < hookEndIndex; i++) {
    result.push(scenes[i]);
  }

  // Insert overview topic_list (full grid, no highlight, no zoom)
  result.push(createTopicListScene("topic_overview", topicItems, -1, 5));

  // Walk remaining scenes, detecting topic boundaries
  let currentTopicIndex = 0;
  const insertedForTopic = new Set<number>();

  for (let i = hookEndIndex; i < scenes.length; i++) {
    const sceneNarration = normalizeText(scenes[i].narration_text);

    // Check if this scene starts a new topic section
    for (let t = currentTopicIndex; t < topicStarters.length; t++) {
      if (insertedForTopic.has(t)) continue;

      const starter = topicStarters[t];
      if (starter && sceneNarration.length > 0 && starter.startsWith(sceneNarration.slice(0, Math.min(40, starter.length)))) {
        // Insert transition scene (grid + zoom into this topic's cell)
        result.push(createTopicListScene(
          `topic_transition_${t}`,
          topicItems,
          t,
          4,
        ));
        insertedForTopic.add(t);
        currentTopicIndex = t;
        break;
      }
    }

    result.push(scenes[i]);
  }

  const injectedCount = insertedForTopic.size + 1; // +1 for overview
  console.log(`[scene-planner] Injected ${injectedCount} topic grid scenes (overview + ${insertedForTopic.size} transitions)`);

  return result;
}

/**
 * Calls the Claude API to break a narration script into a sequence of
 * visual scene plans, then validates and normalizes the returned data.
 */
export async function planScenes(
  scriptText: string,
  visualsConfig: { width: number; height: number; fps: number },
): Promise<ScenePlan[]> {
  const client = new Anthropic();

  // Dynamically compute scene count based on word count
  const wordCount = scriptText.split(/\s+/).filter(Boolean).length;
  const minScenes = Math.max(5, Math.floor(wordCount / 80));
  const maxScenes = Math.max(10, Math.ceil(wordCount / 40));

  // Use streaming to avoid SDK timeout for large requests
  const stream = client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 32000,
    system: SCENE_PLANNER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Break this script into visual scenes for a ${visualsConfig.width}x${visualsConfig.height} video at ${visualsConfig.fps}fps. Target: ${minScenes}-${maxScenes} scenes total. Each scene covers 40-80 words of narration (8-15 seconds). Return ONLY valid JSON.\n\nSCRIPT:\n${scriptText}`,
      },
    ],
  });

  const response = await stream.finalMessage();

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "[]";

  // Save raw response for debugging
  const fs = await import("fs");
  const path = await import("path");
  const debugDir = path.resolve("output");
  fs.mkdirSync(debugDir, { recursive: true });
  fs.writeFileSync(path.join(debugDir, "scene-plan-raw.txt"), rawText);

  const parsed = parseClaudeJSON(rawText);

  if (!Array.isArray(parsed)) {
    throw new Error(
      `Expected a JSON array from Claude scene planner, got ${typeof parsed}`,
    );
  }

  if (parsed.length === 0) {
    throw new Error(
      "Claude scene planner returned an empty array. The script may be too short or malformed.",
    );
  }

  // Validate and normalize each scene
  const scenes: ScenePlan[] = parsed.map((scene: Record<string, unknown>, index: number) => {
    const sceneType = validateSceneType(scene.scene_type);

    return {
      scene_id: typeof scene.scene_id === "number" || typeof scene.scene_id === "string"
        ? String(scene.scene_id)
        : String(index + 1),
      scene_type: sceneType,
      narration_text: typeof scene.narration_text === "string" ? scene.narration_text : "",
      duration_estimate_seconds: clampDuration(scene.duration_estimate_seconds),
      image_search_query: typeof scene.image_search_query === "string"
        ? scene.image_search_query
        : (sceneType === "reference_image" ? "abstract science concept" : ""),
      ai_image_prompt: typeof scene.ai_image_prompt === "string"
        ? scene.ai_image_prompt
        : "",
      pictogram_ids: Array.isArray(scene.pictogram_ids)
        ? scene.pictogram_ids.filter((id): id is string => typeof id === "string")
        : [],
      pictogram_positions: Array.isArray(scene.pictogram_positions)
        ? scene.pictogram_positions
        : [],
      text_labels: validateTextLabels(scene.text_labels),
      camera: validateCamera(scene.camera ?? scene.ken_burns),
      mood: validateMood(scene.mood),
    };
  });

  return scenes;
}

// ═══════════════════════════════════════════════════════════════════
// V2 Scene Planning — Per-Section, Multi-Type
// ═══════════════════════════════════════════════════════════════════

const SECTION_SCENE_PLANNER_PROMPT = `You are a visual director for YouTube explainer videos. You receive the narration text for ONE section of a "Top N" video and plan the visual scenes for that section ONLY.

CONTEXT: Grid transitions, number cards, and section bridges are handled automatically. You are ONLY planning what appears DURING the explanation of this specific topic.

IMPORTANT: ALL images are AI-generated using FLUX. There are NO stock photos. Every visual is custom-generated, so your ai_image_prompt must be detailed and descriptive for EVERY visual scene type.

AVAILABLE SCENE TYPES:

1. "real_photo" — AI-generated PHOTOREALISTIC image of a specific real-world thing.
   Use when the viewer needs to SEE a realistic depiction of a named thing.
   USE FOR: named locations, famous experiments, specific animals/species,
   historical events, named structures, specific technology.
   ai_image_prompt REQUIRED: Describe what the photo should look like (20-40 words).
   Example: "Photorealistic aerial view of the Arecibo radio telescope in Puerto Rico, massive dish nestled in lush green hills, dramatic afternoon light"

2. "ai_illustration" — AI-generated illustration/concept art style.
   Use for things that CANNOT be photographed or benefit from artistic interpretation.
   USE FOR: theoretical concepts, microscopic/atomic scale, far future scenarios,
   artistic interpretations, "imagine this" moments, cutaway views.
   ai_image_prompt REQUIRED: Describe the SCENE (20-40 words), include lighting and mood.

3. "cinematic_ai" — AI-generated dramatic cinematic shot.
   Photorealistic but with dramatic movie-quality lighting and composition.
   USE FOR: opening dramatic shot of a section, key visual climax, "wow" moments.
   ai_image_prompt REQUIRED: Describe as a movie shot (20-40 words).

4. "diagram" — Claude-generated SVG diagram, rasterized to PNG.
   An SVG diagram will be generated. Describe what it should show.
   USE FOR: step-by-step processes, size comparisons, timelines, statistics.
   diagram_description REQUIRED: What to SHOW + layout + what text labels are needed.

5. "text_card" — Big bold text on screen. No image generated.
   Maximum 12 words. Use sparingly (max 1 per section).

CAMERA TYPES:
- "zoom_in" — gentle push in (default)
- "zoom_in_dramatic" — strong push in, for impact
- "zoom_out" — start tight, reveal wider
- "pan_left" / "pan_right" — horizontal drift
- "pan_down" / "pan_up" — vertical drift
- "pan_and_zoom" — diagonal drift + slow zoom, most cinematic
- "static" — no movement (for diagrams and text cards only)

OUTPUT FORMAT — return a JSON array:
[
  {
    "scene_type": "real_photo|ai_illustration|diagram|text_card|cinematic_ai",
    "narration_text": "exact words spoken during this scene",
    "duration_estimate_seconds": 8,
    "image_search_query": "brief keyword summary (used for logging only)",
    "ai_image_prompt": "DETAILED visual description for FLUX image generation (REQUIRED for real_photo, ai_illustration, cinematic_ai)",
    "diagram_description": "what the diagram should show (diagram only)",
    "text_card_content": "the text to display (text_card only)",
    "camera": {"type": "zoom_in"},
    "mood": "mysterious|dramatic|wonder|tense|calm|exciting|triumphant|dark"
  }
]

RULES:
- Use real_photo for 30-40% of scenes (photorealistic AI images)
- Use ai_illustration/cinematic_ai for 40-50% (stylized AI images)
- Use diagram for 0-15%, text_card for 0-10%
- ai_image_prompt is REQUIRED for real_photo, ai_illustration, and cinematic_ai — it drives image generation
- EVERY word of narration must be assigned to exactly one scene
- Alternate camera types — never use the same camera twice in a row
- Diagrams and text cards always use "static" camera
- Start each section with a visually striking scene
- Return ONLY valid JSON. No markdown fences. No commentary.`;

const VALID_SCENE_TYPES_V2 = new Set([
  "real_photo", "ai_illustration", "cinematic_ai", "diagram", "text_card",
]);

const VALID_CAMERA_TYPES_V2 = new Set([
  "zoom_in", "zoom_in_dramatic", "zoom_out",
  "pan_left", "pan_right", "pan_up", "pan_down",
  "pan_and_zoom", "static",
]);

const VALID_MOODS_V2 = new Set([
  "mysterious", "dramatic", "wonder", "tense", "calm", "exciting", "triumphant", "dark",
]);

function validateSceneTypeV2(s: unknown): ScenePlanV2["scene_type"] {
  if (typeof s === "string" && VALID_SCENE_TYPES_V2.has(s)) return s as ScenePlanV2["scene_type"];
  return "real_photo";
}

function validateCameraV2(cam: unknown): { type: CameraTypeV2 } {
  if (!cam || typeof cam !== "object") return { type: "zoom_in" };
  const t = (cam as Record<string, unknown>).type;
  if (typeof t === "string" && VALID_CAMERA_TYPES_V2.has(t)) return { type: t as CameraTypeV2 };
  return { type: "zoom_in" };
}

function validateMoodV2(m: unknown): MoodV2 {
  if (typeof m === "string" && VALID_MOODS_V2.has(m)) return m as MoodV2;
  return "mysterious";
}

/**
 * Plan scenes for a single section of the video.
 */
export async function planSectionScenes(
  sectionNarration: string,
  sectionIndex: number,
  topicName: string,
  minScenes: number,
  maxScenes: number,
): Promise<ScenePlanV2[]> {
  const client = new Anthropic();
  const wordCount = sectionNarration.split(/\s+/).filter(Boolean).length;

  const userPrompt = `Plan the visual scenes for this section of the video.

SECTION TOPIC: "${topicName}"
SECTION NUMBER: ${sectionIndex + 1}

NARRATION TEXT FOR THIS SECTION:
${sectionNarration}

The narration contains approximately ${wordCount} words.
Plan ${minScenes}-${maxScenes} scenes.
Every word of the narration must be covered by exactly one scene.

Return ONLY the JSON array.`;

  const stream = client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8000,
    system: SECTION_SCENE_PLANNER_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const response = await stream.finalMessage();
  const rawText = response.content[0].type === "text" ? response.content[0].text : "[]";
  const parsed = parseClaudeJSON(rawText);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(`Scene planner returned invalid data for section "${topicName}"`);
  }

  return parsed.map((scene: Record<string, unknown>, idx: number) => ({
    scene_id: `s${sectionIndex}_${idx}`,
    scene_type: validateSceneTypeV2(scene.scene_type),
    narration_text: typeof scene.narration_text === "string" ? scene.narration_text : "",
    duration_estimate_seconds: clampDuration(scene.duration_estimate_seconds),
    image_search_query: typeof scene.image_search_query === "string" ? scene.image_search_query : "",
    ai_image_prompt: typeof scene.ai_image_prompt === "string" ? scene.ai_image_prompt : "",
    diagram_description: typeof scene.diagram_description === "string" ? scene.diagram_description : undefined,
    text_card_content: typeof scene.text_card_content === "string" ? scene.text_card_content : undefined,
    camera: validateCameraV2(scene.camera),
    mood: validateMoodV2(scene.mood),
  }));
}

/**
 * Plan scenes for ALL sections of the video, calling Claude once per section.
 */
export async function planAllSections(
  script: ParsedScript,
  minScenesPerSection: number,
  maxScenesPerSection: number,
): Promise<Map<number, ScenePlanV2[]>> {
  const sectionPlans = new Map<number, ScenePlanV2[]>();

  for (const topic of script.subTopics) {
    console.log(`[scene-planner-v2] Planning section ${topic.index + 1}/${script.subTopics.length}: "${topic.name}"`);

    try {
      const scenes = await planSectionScenes(
        topic.narrationText,
        topic.index,
        topic.name,
        minScenesPerSection,
        maxScenesPerSection,
      );

      sectionPlans.set(topic.index, scenes);
      console.log(`[scene-planner-v2]   → ${scenes.length} scenes planned`);
    } catch (err) {
      console.error(`[scene-planner-v2] ❌ Failed to plan section "${topic.name}": ${(err as Error).message}`);
      // Create a single fallback scene covering the entire section narration
      const fallback: ScenePlanV2 = {
        scene_id: `s${topic.index}_0`,
        scene_type: "cinematic_ai",
        narration_text: topic.narrationText,
        duration_estimate_seconds: Math.max(5, Math.ceil(topic.narrationText.split(/\s+/).length / 3)),
        image_search_query: topic.name,
        ai_image_prompt: `Dramatic cinematic visualization of ${topic.name}, dark moody lighting, volumetric fog, 8k quality`,
        camera: { type: "pan_and_zoom" },
        mood: "dramatic",
      };
      sectionPlans.set(topic.index, [fallback]);
      console.log(`[scene-planner-v2]   → Using 1 fallback scene`);
    }
  }

  // Also plan hook scenes
  if (script.hook) {
    console.log(`[scene-planner-v2] Planning hook scenes...`);
    try {
      const hookScenes = await planSectionScenes(
        script.hook,
        -1,
        "_hook",
        1,
        3,
      );
      sectionPlans.set(-1, hookScenes);
      console.log(`[scene-planner-v2]   → ${hookScenes.length} hook scenes`);
    } catch (err) {
      console.error(`[scene-planner-v2] ❌ Hook planning failed: ${(err as Error).message}`);
      sectionPlans.set(-1, [{
        scene_id: "hook_0",
        scene_type: "cinematic_ai",
        narration_text: script.hook,
        duration_estimate_seconds: Math.max(5, Math.ceil(script.hook.split(/\s+/).length / 3)),
        image_search_query: "dramatic intro",
        ai_image_prompt: "Dramatic dark cinematic opening shot, volumetric lighting, mysterious atmosphere, 8k",
        camera: { type: "zoom_in_dramatic" },
        mood: "dramatic",
      }]);
    }
  }

  // Plan outro scenes
  if (script.outro) {
    console.log(`[scene-planner-v2] Planning outro scenes...`);
    try {
      const outroScenes = await planSectionScenes(
        script.outro,
        -2,
        "_outro",
        1,
        2,
      );
      sectionPlans.set(-2, outroScenes);
      console.log(`[scene-planner-v2]   → ${outroScenes.length} outro scenes`);
    } catch (err) {
      console.error(`[scene-planner-v2] ❌ Outro planning failed: ${(err as Error).message}`);
      sectionPlans.set(-2, [{
        scene_id: "outro_0",
        scene_type: "cinematic_ai",
        narration_text: script.outro,
        duration_estimate_seconds: Math.max(5, Math.ceil(script.outro.split(/\s+/).length / 3)),
        image_search_query: "outro",
        ai_image_prompt: "Cinematic wide shot fading to dark, stars in background, contemplative mood, 8k",
        camera: { type: "zoom_out" },
        mood: "calm",
      }]);
    }
  }

  return sectionPlans;
}
