import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import type { SourcedImageV2 } from "../../core/types-v2.js";

const DIAGRAM_SYSTEM_PROMPT = `You are a diagram designer for educational YouTube videos with a whiteboard aesthetic. Generate a clean SVG diagram based on the description.

REQUIREMENTS:
- SVG viewport: 1920x1080
- White/light background (#FFFFFF or #f8f9fa)
- Dark text and elements for readability
- Clean, hand-drawn educational feel with rounded corners and consistent spacing
- Labels: font-size 28-36px, sans-serif ('Arial', 'Helvetica', sans-serif)
- Visual hierarchy via size, color, weight

STYLE:
- Background: #FFFFFF (white)
- Box backgrounds: #f0f4f8, #e8edf2 (light gray/blue)
- Accent colors: #2196F3 (blue), #4CAF50 (green), #FF6B35 (orange), #E53935 (red), #7E57C2 (purple)
- Borders: 2-3px solid #d0d0d0, 10px border-radius
- Arrows: stroke-width 3, color #555555, with arrowhead markers
- Text: #1a1a1a for labels, accent colors for emphasis
- Use thick outlines and bold shapes — like marker on a whiteboard

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
