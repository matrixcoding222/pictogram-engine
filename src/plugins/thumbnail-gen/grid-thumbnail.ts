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
 * Build a self-contained HTML string for the 3x3 grid thumbnail.
 * All CSS is embedded inline so no external files are required.
 *
 * Images are referenced via `file://` so Playwright can load them from disk.
 * If fewer than 9 images are supplied the grid simply shows what is available.
 */
function buildThumbnailHTML(title: string, images: ThumbnailImage[]): string {
  // Limit to a maximum of 9 items for the 3x3 grid
  const items = images.slice(0, 9);

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
    grid-template-columns: repeat(3, 1fr);
    gap: 18px 32px;
    padding: 40px 80px 20px 80px;
    width: 100%;
    flex: 1;
    align-content: center;
    justify-items: center;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .circle {
    width: 160px;
    height: 160px;
    border-radius: 50%;
    background-size: cover;
    background-position: center;
    border: 4px solid #e0e0e0;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.1);
  }

  .label {
    color: #333333;
    font-size: 16px;
    font-weight: 700;
    text-align: center;
    max-width: 180px;
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
 * Generate a 1280x720 YouTube thumbnail image with a 3x3 grid of
 * circular-cropped images, each with a short text label, and a bold
 * title across the bottom.
 *
 * Uses a headless Chromium instance via Playwright to screenshot a
 * dynamically built HTML page.
 *
 * @param title      The main title text displayed at the bottom.
 * @param images     Array of up to 9 images with labels for the grid.
 * @param outputPath Absolute path where the PNG thumbnail will be saved.
 */
export async function generateThumbnail(
  title: string,
  images: ThumbnailImage[],
  outputPath: string,
): Promise<void> {
  if (images.length === 0) {
    throw new Error("At least one image is required to generate a thumbnail.");
  }

  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const html = buildThumbnailHTML(title, images);

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
