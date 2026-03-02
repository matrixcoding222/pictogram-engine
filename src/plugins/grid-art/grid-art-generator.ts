import path from "path";
import sharp from "sharp";
import { generateAIImageSquare } from "../image-sourcer/flux-ai.js";
import { searchPexels } from "../image-sourcer/pexels.js";
import type { ArtDirectionResult, GridCellArt, GridConfig } from "../../core/types-v2.js";

/**
 * Downloads an image from a URL and returns it as a Buffer.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Generate all grid cell art images using FLUX with the locked style suffix.
 * Falls back to Pexels if FLUX fails for any cell.
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

      // Resize to grid cell dimensions
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

      console.log(`[grid-art] Cell ${i} generated: ${outputPath}`);
    } catch (err) {
      console.warn(`[grid-art] FLUX failed for "${cell.topic}": ${(err as Error).message}`);
      console.warn(`[grid-art] Falling back to Pexels for cell ${i}...`);

      try {
        const photo = await searchPexels(cell.topic);
        if (photo) {
          const imgBuffer = await downloadImage(photo.url);
          await sharp(imgBuffer)
            .resize(640, 420, { fit: "cover", position: "attention" })
            .sharpen()
            .png()
            .toFile(outputPath);

          results.push({
            cellIndex: i,
            topicName: cell.topic,
            localPath: outputPath,
            source: "pexels_fallback",
          });
        } else {
          results.push({
            cellIndex: i,
            topicName: cell.topic,
            localPath: "",
            source: "none",
          });
        }
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

  return results;
}
