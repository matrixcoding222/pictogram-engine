import Anthropic from "@anthropic-ai/sdk";
import type {
  ArtDirection,
  ArtDirectionResult,
  GridSourceType,
  SubTopicV2,
} from "../../core/types-v2.js";

// ---------------------------------------------------------------------------
// Grid Source Decision — photorealistic vs cartoon illustrations
// ---------------------------------------------------------------------------

const GRID_SOURCE_DECISION_PROMPT = `You are deciding whether a list of video topics should use PHOTOREALISTIC AI IMAGES or CARTOON-STYLE AI ILLUSTRATIONS for their thumbnail grid images.

RULE: ALL grid cells MUST use the SAME style. Never mix photorealistic and cartoon in the same grid.

Use "real_photo" when the topics are CONCRETE, PHOTOGRAPHABLE things that exist in the real world:
- Specific animals, species, breeds
- Real places, countries, cities, landmarks
- Physical objects, vehicles, buildings, food
- Specific technology, gadgets, machines
- Famous people (by category, not by name)

Use "ai_illustration" when the topics are ABSTRACT, THEORETICAL, or HARD TO PHOTOGRAPH:
- Scientific concepts, theories, phenomena
- Emotions, psychological states
- Historical eras or events (not a specific place)
- Mathematical or philosophical concepts
- Hypothetical or speculative ideas
- Microscopic or cosmic-scale things that don't photograph well

Return ONLY valid JSON: {"grid_source": "real_photo" or "ai_illustration", "reasoning": "one sentence explanation"}`;

interface GridSourceDecision {
  grid_source: GridSourceType;
  reasoning: string;
}

/**
 * Ask Claude whether the topics are better represented by photorealistic images or cartoon illustrations.
 */
async function decideGridSource(subTopics: SubTopicV2[]): Promise<GridSourceDecision> {
  const client = new Anthropic();

  const topicList = subTopics.map((t, i) => `${i + 1}. "${t.name}"`).join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 200,
    system: GRID_SOURCE_DECISION_PROMPT,
    messages: [{
      role: "user",
      content: `Decide the grid source for these ${subTopics.length} topics:\n\n${topicList}`,
    }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";

  try {
    const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as GridSourceDecision;

    if (parsed.grid_source === "real_photo" || parsed.grid_source === "ai_illustration") {
      return parsed;
    }
  } catch {
    console.warn("[art-director] Failed to parse grid source decision, defaulting to ai_illustration");
  }

  return { grid_source: "ai_illustration", reasoning: "default fallback" };
}

// ---------------------------------------------------------------------------
// Photorealistic Art Direction (for real_photo grids)
// ---------------------------------------------------------------------------

const REAL_PHOTO_ART_DIRECTOR_PROMPT = `You are a visual art director designing PHOTOREALISTIC images for a video thumbnail grid. You will be given a list of topics. For each topic, describe EXACTLY what the photorealistic image should depict.

CONSTRAINTS — every image in this grid must follow these rules:
- Single centered subject — ONE main object/figure/scene per image
- Same level of detail — consistent visual quality across all cells
- Clean, simple background — white, light, or natural setting
- Bold, vibrant, saturated colors — must pop on a small grid cell
- No text in the image — labels are added separately
- Square composition — subject fills most of the frame
- Same artistic "weight" — no image should overwhelm or underwhelm the others
- Photorealistic style — looks like a real photograph, high detail, natural lighting

YOUR JOB:
For each topic, return a SHORT visual description (15-30 words) of exactly what the photorealistic image should show.
Focus on: the MAIN SUBJECT, the SETTING/BACKGROUND, LIGHTING, and CAMERA ANGLE.

Think about what a viewer would instantly recognize as representing this topic
even at thumbnail size (small, 300x200 pixels).

EXAMPLES:
Topic: "Poison Dart Frog"
→ "Close-up of a bright blue poison dart frog perched on a green leaf, vibrant colors, shallow depth of field, rainforest setting, natural light."

Topic: "The Sahara Desert"
→ "Sweeping view of golden sand dunes in the Sahara at sunset, dramatic shadows, warm orange light, clear blue sky on the horizon."

Return a JSON array in this exact format:
[
  {
    "topic": "exact topic name",
    "visual_description": "15-30 word photorealistic image description",
    "primary_colors": ["color1", "color2"],
    "subject_type": "object|creature|symbol|scene|phenomenon"
  }
]

IMPORTANT: All descriptions must work together as a cohesive set.
They should feel like the same photographer shot all of them.
Return ONLY the JSON array. No markdown fences. No commentary.`;

// ---------------------------------------------------------------------------
// Cartoon Illustration Art Direction (for ai_illustration grids)
// ---------------------------------------------------------------------------

const ILLUSTRATION_ART_DIRECTOR_PROMPT = `You are a visual art director designing BOLD CARTOON images for a video thumbnail grid. These images have a very specific style: bright, saturated, flat cartoon illustrations on solid BLACK backgrounds. Think retro cartoon meets educational poster.

CONSTRAINTS — every image MUST follow these rules:
- Single centered subject — ONE main object/figure/symbol per image
- SOLID BLACK background — no gradients, no scenes, just pure black behind the subject
- EXTREMELY vibrant, neon-saturated colors — electric blue, hot orange, bright red, vivid green, neon purple
- FLAT shading — no realistic lighting, no 3D rendering, flat color blocks with thick black outlines
- Bold, simple, iconic — recognizable even at tiny thumbnail size
- Same level of detail across all cells — consistent style
- No text in the image
- Square composition — subject fills 70-80% of the frame

STYLE REFERENCE: Think bold vector art, retro cartoon, almost like a stylized emoji or app icon. NOT realistic, NOT painterly, NOT detailed. SIMPLE, BOLD, FLAT, BRIGHT.

YOUR JOB:
For each topic, describe the SINGLE SUBJECT to depict in 15-25 words.
Focus on: what the MAIN SHAPE/OBJECT is, its PRIMARY COLORS (pick 2-3 neon/vibrant colors), and one KEY DETAIL.

EXAMPLES:
Topic: "HD 189733 b" (a planet)
→ "A large blue sphere with swirling white storm bands, glowing hot orange atmosphere rim. Electric blue and fiery orange."

Topic: "Rogue Planets"
→ "A dark rocky planet drifting alone, one side lit with dim red glow, cracks of molten orange. Dark red and orange."

Topic: "Neutron Stars"
→ "A small ultra-bright white-blue sphere with beams of light shooting from poles, surrounded by blue energy rings. White-blue and electric cyan."

Return a JSON array:
[
  {
    "topic": "exact topic name",
    "visual_description": "15-25 word description of the single subject to show",
    "primary_colors": ["neon_color1", "neon_color2"],
    "subject_type": "object|creature|symbol|scene|phenomenon"
  }
]

IMPORTANT: Every description must produce images that look like they belong in the SAME SET — same artist, same style, same level of detail.
Return ONLY the JSON array. No markdown fences. No commentary.`;

// ---------------------------------------------------------------------------
// Shared art direction generator
// ---------------------------------------------------------------------------

async function generateArtDirection(subTopics: SubTopicV2[], systemPrompt: string): Promise<ArtDirection[]> {
  const client = new Anthropic();

  const topicList = subTopics
    .map((t, i) => `${i + 1}. "${t.name}"`)
    .join("\n");

  const stream = client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Design the grid cell art for these ${subTopics.length} topics:\n\n${topicList}\n\nReturn the JSON array.`,
      },
    ],
  });

  const response = await stream.finalMessage();
  const rawText = response.content[0].type === "text" ? response.content[0].text : "[]";

  // Parse JSON — strip markdown fences if present
  const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let cells: ArtDirection[];
  try {
    cells = JSON.parse(cleaned);
  } catch {
    console.warn("[art-director] Failed to parse JSON, attempting salvage...");
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      cells = JSON.parse(arrayMatch[0]);
    } else {
      throw new Error(`Failed to parse art direction JSON: ${cleaned.slice(0, 200)}`);
    }
  }

  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error("Art direction returned empty or invalid array");
  }

  return cells;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decide whether grid cells should use photorealistic or cartoon style,
 * then generate art direction for FLUX image generation.
 */
export async function directGridArt(
  subTopics: SubTopicV2[],
): Promise<ArtDirectionResult> {
  // Step 1: Decide grid source type
  const decision = await decideGridSource(subTopics);
  console.log(`[art-director] Grid source: ${decision.grid_source} (${decision.reasoning})`);

  if (decision.grid_source === "real_photo") {
    console.log("[art-director] Generating photorealistic art direction...");
    const cells = await generateArtDirection(subTopics, REAL_PHOTO_ART_DIRECTOR_PROMPT);
    console.log(`[art-director] Generated art direction for ${cells.length} cells`);
    return { grid_source: "real_photo", cells };
  }

  console.log("[art-director] Generating cartoon illustration art direction...");
  const cells = await generateArtDirection(subTopics, ILLUSTRATION_ART_DIRECTOR_PROMPT);
  console.log(`[art-director] Generated art direction for ${cells.length} cells`);
  return { grid_source: "ai_illustration", cells };
}
