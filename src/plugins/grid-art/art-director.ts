import Anthropic from "@anthropic-ai/sdk";
import type { ArtDirection, ArtDirectionResult, SubTopicV2 } from "../../core/types-v2.js";

const ART_DIRECTOR_SYSTEM_PROMPT = `You are a visual art director designing cartoon depictions for a video thumbnail grid. You will be given a list of topics. For each topic, describe EXACTLY what the cartoon image should depict.

CONSTRAINTS — every image in this grid must follow these rules:
- Single centered subject — ONE main object/figure/symbol per image
- Same level of detail — if one is simple, all are simple
- Dark or solid background (the grid has a dark theme)
- Bold, vibrant, saturated colors — must pop on a small grid cell
- No text in the image — labels are added separately
- Square composition — subject fills most of the frame
- Same artistic "weight" — no image should overwhelm or underwhelm the others

YOUR JOB:
For each topic, return a SHORT visual description (15-30 words) of what to depict.
Focus on: the MAIN SUBJECT, its COLOR PALETTE, and any KEY VISUAL ELEMENT.

Think about what a viewer would instantly recognize as representing this topic
even at thumbnail size (small, 300x200 pixels).

EXAMPLES:
Topic: "Black Holes"
→ "A massive swirling black void with bright orange accretion disk, surrounded by warped starlight. Deep purples and fiery oranges."

Topic: "Boltzmann Brain"
→ "A glowing translucent brain floating alone in dark empty space, with faint purple neural connections sparking. Eerie blue-purple glow."

Return a JSON array in this exact format:
[
  {
    "topic": "exact topic name",
    "visual_description": "15-30 word description of what to show",
    "primary_colors": ["color1", "color2"],
    "subject_type": "object|creature|symbol|scene|phenomenon"
  }
]

IMPORTANT: All descriptions must work together as a cohesive set.
They should feel like the same artist designed all of them.
Return ONLY the JSON array. No markdown fences. No commentary.`;

/**
 * Uses Claude as art director to design consistent visual descriptions
 * for each sub-topic's grid cell.
 */
export async function directGridArt(
  subTopics: SubTopicV2[],
): Promise<ArtDirectionResult> {
  const client = new Anthropic();

  const topicList = subTopics
    .map((t, i) => `${i + 1}. "${t.name}"`)
    .join("\n");

  const stream = client.messages.stream({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 4000,
    system: ART_DIRECTOR_SYSTEM_PROMPT,
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
    // Try to extract JSON array from the response
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      cells = JSON.parse(arrayMatch[0]);
    } else {
      throw new Error(`Failed to parse art direction JSON: ${cleaned.slice(0, 200)}`);
    }
  }

  // Validate and ensure all topics are covered
  if (!Array.isArray(cells) || cells.length === 0) {
    throw new Error("Art direction returned empty or invalid array");
  }

  console.log(`[art-director] Generated art direction for ${cells.length} cells`);

  return { cells };
}
