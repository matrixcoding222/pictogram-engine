import { chromium } from "playwright";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThumbnailImage {
  /** Absolute path to the source image file. */
  path: string;
  /** Short label displayed under the image circle. */
  label: string;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

/**
 * Build a self-contained HTML string for a dynamic grid thumbnail.
 * All CSS is embedded inline so no external files are required.
 *
 * Images are referenced via `file://` so Playwright can load them from disk.
 * The grid adapts to the number of columns specified.
 */
function buildThumbnailHTML(title: string, images: ThumbnailImage[], columns: number = 3): string {
  const items = images;

  const cellsHTML = items
    .map((img) => {
      // Normalise to forward slashes and encode for use inside a URL
      const fileUrl = `file:///${img.path.replace(/\\/g, "/")}`
        .replace(/ /g, "%20");

      return `
        <div class="cell">
          <div class="circle" style="background-image: url('${fileUrl}');"></div>
          <span class="label">${escapeHTML(img.label)}</span>
        </div>`;
    })
    .join("\n");

  // Scale circle size based on column count
  const circleSize = columns <= 3 ? 160 : columns === 4 ? 130 : 110;
  const fontSize = columns <= 3 ? 16 : columns === 4 ? 14 : 12;
  const labelWidth = columns <= 3 ? 180 : columns === 4 ? 150 : 120;
  const gap = columns <= 3 ? "18px 32px" : columns === 4 ? "14px 24px" : "10px 16px";
  const padding = columns <= 3 ? "40px 80px 20px 80px" : columns === 4 ? "30px 50px 15px 50px" : "20px 30px 10px 30px";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1280px;
    height: 720px;
    background: #FFFFFF;
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    overflow: hidden;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(${columns}, 1fr);
    gap: ${gap};
    padding: ${padding};
    width: 100%;
    flex: 1;
    align-content: center;
    justify-items: center;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .circle {
    width: ${circleSize}px;
    height: ${circleSize}px;
    border-radius: 12px;
    background-size: cover;
    background-position: center;
    border: 3px solid #d0d0d0;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
  }

  .label {
    color: #222222;
    font-size: ${fontSize}px;
    font-weight: 700;
    text-align: center;
    max-width: ${labelWidth}px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-bar {
    width: 100%;
    padding: 22px 60px 30px 60px;
    text-align: center;
  }

  .title-text {
    color: #1a1a1a;
    font-size: 38px;
    font-weight: 900;
    line-height: 1.2;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
</style>
</head>
<body>
  <div class="grid">
    ${cellsHTML}
  </div>
  <div class="title-bar">
    <div class="title-text">${escapeHTML(title)}</div>
  </div>
</body>
</html>`;
}

/**
 * Escape characters that are special in HTML to prevent injection.
 */
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a 1280x720 YouTube thumbnail image with a dynamic grid of
 * circular-cropped images, each with a short text label, and a bold
 * title across the bottom.
 *
 * Uses a headless Chromium instance via Playwright to screenshot a
 * dynamically built HTML page.
 *
 * @param title      The main title text displayed at the bottom.
 * @param images     Array of images with labels for the grid.
 * @param outputPath Absolute path where the PNG thumbnail will be saved.
 * @param columns    Number of grid columns (default 3).
 */
export async function generateThumbnail(
  title: string,
  images: ThumbnailImage[],
  outputPath: string,
  columns: number = 3,
): Promise<void> {
  if (images.length === 0) {
    throw new Error("At least one image is required to generate a thumbnail.");
  }

  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const html = buildThumbnailHTML(title, images, columns);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });

    // Load the self-contained HTML string directly
    await page.setContent(html, { waitUntil: "networkidle" });

    await page.screenshot({
      path: outputPath,
      type: "png",
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
}
