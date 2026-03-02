import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { SourcedImageV2 } from "../../core/types-v2.js";

const DIAGRAM_SYSTEM_PROMPT = `You are a diagram designer for educational YouTube videos. Generate a clean SVG diagram based on the description.

REQUIREMENTS:
- SVG viewport: 1920x1080
- Dark background (#0d1117)
- White and bright colored text/elements for contrast
- Clean, modern look with rounded corners and consistent spacing
- Labels: font-size 28-36px, sans-serif ('Arial', 'Helvetica', sans-serif)
- Visual hierarchy via size, color, opacity

STYLE:
- Box backgrounds: #1a2332, #162032 (semi-transparent dark)
- Accent colors: #4FC3F7 (blue), #81C784 (green), #FFB74D (orange), #EF5350 (red), #CE93D8 (purple)
- Borders: 2px solid, 8px border-radius
- Arrows: stroke-width 3 with arrowhead markers
- Text: white (#FFFFFF) for labels, accent colors for emphasis

OUTPUT: Return ONLY the SVG code. No explanation. No markdown fences.
Must be a valid SVG starting with <svg and ending with </svg>.`;

/**
 * Uses Claude to generate an SVG diagram, then rasterizes it to PNG.
 */
export async function generateDiagram(
  description: string,
  outputPath: string,
): Promise<SourcedImageV2> {
  const client = new Anthropic();

  console.log(`[diagram] Generating SVG: ${description.slice(0, 80)}...`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 8000,
    system: DIAGRAM_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: `Create an SVG diagram: ${description}`,
    }],
  });

  const rawText = response.content[0].type === "text" ? response.content[0].text : "";

  // Extract SVG — handle potential markdown fences
  const svgMatch = rawText.match(/<svg[\s\S]*<\/svg>/i);
  if (!svgMatch) {
    console.warn(`[diagram] Claude did not return valid SVG, using placeholder`);
    return { localPath: "", source: "none" };
  }

  try {
    // Rasterize SVG to PNG at 1920x1080
    await sharp(Buffer.from(svgMatch[0]))
      .resize(1920, 1080)
      .png()
      .toFile(outputPath);

    console.log(`[diagram] Saved: ${outputPath}`);
    return { localPath: outputPath, source: "diagram" };
  } catch (err) {
    console.warn(`[diagram] Failed to rasterize SVG: ${(err as Error).message}`);
    return { localPath: "", source: "none" };
  }
}
