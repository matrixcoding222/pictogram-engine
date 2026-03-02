import path from "path";
import sharp from "sharp";
import { generateAIImageSquare } from "../image-sourcer/flux-ai.js";
import type { ArtDirectionResult, GridCellArt, GridConfig } from "../../core/types-v2.js";

/**
 * Generate all grid cell art images using FLUX with the locked style suffix.
 * No stock photo fallback — every cell is AI-generated for visual consistency.
 * If FLUX fails for a cell, it retries once with a simpler prompt.
 * If that also fails, it creates a solid color placeholder.
 */
export async function generateAllGridArt(
  artDirection: ArtDirectionResult,
  gridConfig: GridConfig,
  outputDir: string,
): Promise<GridCellArt[]> {
  const results: GridCellArt[] = [];

  for (let i = 0; i < artDirection.cells.length; i++) {
    const cell = artDirection.cells[i];
    const outputPath = path.join(outputDir, `grid_cell_${i}.png`);

    // Compose full FLUX prompt: visual description + locked style suffix
    const fullPrompt = `${cell.visual_description}. ${gridConfig.cell_art_prompt_suffix}`;

    try {
      console.log(`[grid-art] Generating cell ${i}: "${cell.topic}" via FLUX...`);
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

      // Retry with simpler prompt (just the core description, no style suffix)
      try {
        console.log(`[grid-art]   Retrying with simpler prompt...`);
        const simplePrompt = `${cell.visual_description}, digital illustration, dark background, vibrant colors`;
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
        // Generate a solid color placeholder with the topic name
        console.warn(`[grid-art]   Retry also failed — creating color placeholder`);
        const colors = ["#1a237e", "#b71c1c", "#1b5e20", "#e65100", "#4a148c"];
        const bgColor = colors[i % colors.length];

        // Create a simple SVG placeholder
        const svg = `<svg width="640" height="420" xmlns="http://www.w3.org/2000/svg">
          <rect width="640" height="420" fill="${bgColor}"/>
          <text x="320" y="210" font-family="Arial Black, sans-serif" font-size="36"
                fill="white" text-anchor="middle" dominant-baseline="middle">
            ${escapeXml(cell.topic)}
          </text>
        </svg>`;

        try {
          await sharp(Buffer.from(svg)).png().toFile(outputPath);
          results.push({
            cellIndex: i,
            topicName: cell.topic,
            localPath: outputPath,
            source: "none",
          });
        } catch {
          results.push({
            cellIndex: i,
            topicName: cell.topic,
            localPath: "",
            source: "none",
          });
        }
      }
    }
  }

  return results;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
