import Anthropic from "@anthropic-ai/sdk";
import type { ScenePlan, CameraConfig, Mood, TopicListItem } from "./types.js";

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
