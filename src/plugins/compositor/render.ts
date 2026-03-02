import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// V1 Asset Preparation
// ---------------------------------------------------------------------------

/**
 * Copies all scene images, pictogram SVGs, and topic grid images into a
 * temporary public directory that Remotion can serve, and rewrites the
 * videoData paths to use staticFile() URLs.
 */
function prepareAssets(
  videoData: any,
  publicDir: string
): any {
  fs.mkdirSync(path.join(publicDir, "scenes"), { recursive: true });
  fs.mkdirSync(path.join(publicDir, "pictograms"), { recursive: true });
  fs.mkdirSync(path.join(publicDir, "topics"), { recursive: true });

  const updatedScenes = videoData.scenes.map((scene: any, i: number) => {
    // Copy scene image
    let imageSrc = "";
    if (scene.imageSrc && fs.existsSync(scene.imageSrc)) {
      const ext = path.extname(scene.imageSrc) || ".png";
      const destName = `scene_${i}${ext}`;
      const dest = path.join(publicDir, "scenes", destName);
      fs.copyFileSync(scene.imageSrc, dest);
      imageSrc = `scenes/${destName}`;
    }

    // Read SVG content for inline rendering (vector quality) or copy non-SVG files
    const pictograms = (scene.pictograms || []).map((p: any, j: number) => {
      let src = "";
      let svgContent = "";
      if (p.src && fs.existsSync(p.src)) {
        const ext = path.extname(p.src).toLowerCase();
        if (ext === ".svg") {
          // Read SVG content for inline rendering — preserves vector quality
          svgContent = fs.readFileSync(p.src, "utf-8");
        } else {
          // Non-SVG files: copy to public dir as before
          const destName = `picto_${i}_${j}${ext}`;
          const dest = path.join(publicDir, "pictograms", destName);
          fs.copyFileSync(p.src, dest);
          src = `pictograms/${destName}`;
        }
      }
      return { ...p, src, svgContent };
    });

    // Handle topic grid images
    let topicListData = scene.topicListData;
    if (topicListData?.items) {
      const updatedItems = topicListData.items.map((item: any, j: number) => {
        if (item.imageSrc && fs.existsSync(item.imageSrc)) {
          const ext = path.extname(item.imageSrc) || ".png";
          const destName = `topic_${i}_${j}${ext}`;
          const dest = path.join(publicDir, "topics", destName);
          fs.copyFileSync(item.imageSrc, dest);
          return { ...item, imageSrc: `topics/${destName}` };
        }
        return { ...item, imageSrc: "" };
      });
      topicListData = { ...topicListData, items: updatedItems };
    }

    return { ...scene, imageSrc, pictograms, topicListData };
  });

  return { scenes: updatedScenes };
}

// ---------------------------------------------------------------------------
// V2 Asset Preparation
// ---------------------------------------------------------------------------

/**
 * Copies all v2 assets (scene images, grid cell art, diagrams) into the
 * public directory and rewrites paths to use staticFile() URLs.
 */
function prepareAssetsV2(
  videoData: any,
  publicDir: string,
): any {
  fs.mkdirSync(path.join(publicDir, "scenes"), { recursive: true });
  fs.mkdirSync(path.join(publicDir, "grid-cells"), { recursive: true });

  // Copy grid cell art
  const updatedGridCells = (videoData.gridCells || []).map((cell: any, i: number) => {
    if (cell.imageSrc && fs.existsSync(cell.imageSrc)) {
      const ext = path.extname(cell.imageSrc) || ".png";
      const destName = `cell_${i}${ext}`;
      const dest = path.join(publicDir, "grid-cells", destName);
      fs.copyFileSync(cell.imageSrc, dest);
      return { ...cell, imageSrc: `grid-cells/${destName}` };
    }
    return { ...cell, imageSrc: "" };
  });

  // Copy scene images within segments
  let sceneCounter = 0;
  const updatedSegments = (videoData.segments || []).map((segment: any) => {
    if (!segment.scenes) return segment;

    const updatedScenes = segment.scenes.map((scene: any) => {
      if (scene.imageSrc && fs.existsSync(scene.imageSrc)) {
        const ext = path.extname(scene.imageSrc) || ".png";
        const destName = `scene_${sceneCounter}${ext}`;
        const dest = path.join(publicDir, "scenes", destName);
        fs.copyFileSync(scene.imageSrc, dest);
        sceneCounter++;
        return { ...scene, imageSrc: `scenes/${destName}` };
      }
      sceneCounter++;
      return { ...scene, imageSrc: "" };
    });

    return { ...segment, scenes: updatedScenes };
  });

  return {
    ...videoData,
    gridCells: updatedGridCells,
    segments: updatedSegments,
  };
}

// ---------------------------------------------------------------------------
// V1 Render
// ---------------------------------------------------------------------------

export async function renderVideoWithRemotion(
  videoData: any,
  outputPath: string
): Promise<void> {
  const remotionDir = path.resolve(__dirname, "remotion-project");
  const entryPoint = path.resolve(remotionDir, "src/index.ts");

  // Create a public directory for Remotion to serve assets from
  const publicDir = path.resolve(remotionDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  // Copy all assets and rewrite paths
  console.log("[remotion] Preparing assets for render...");
  const preparedData = prepareAssets(videoData, publicDir);

  console.log("[remotion] Bundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
    publicDir,
  });

  console.log("[remotion] Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "MainVideo",
    inputProps: preparedData,
  });

  console.log(`[remotion] Rendering ${composition.durationInFrames} frames at ${composition.fps}fps...`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: preparedData,
    imageFormat: "png",
    crf: 18,
  });

  // Clean up public directory
  fs.rmSync(publicDir, { recursive: true, force: true });
  console.log("[remotion] Render complete.");
}

// ---------------------------------------------------------------------------
// V2 Render
// ---------------------------------------------------------------------------

export async function renderVideoWithRemotionV2(
  videoData: any,
  outputPath: string,
): Promise<void> {
  const remotionDir = path.resolve(__dirname, "remotion-project");
  const entryPoint = path.resolve(remotionDir, "src/index.ts");

  const publicDir = path.resolve(remotionDir, "public");
  fs.mkdirSync(publicDir, { recursive: true });

  console.log("[remotion-v2] Preparing assets for render...");
  const preparedData = prepareAssetsV2(videoData, publicDir);

  console.log("[remotion-v2] Bundling Remotion project...");
  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
    publicDir,
  });

  console.log("[remotion-v2] Selecting composition...");
  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "MainVideoV2",
    inputProps: preparedData,
    timeoutInMilliseconds: 60000,
  });

  console.log(`[remotion-v2] Rendering ${composition.durationInFrames} frames at ${composition.fps}fps...`);
  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: preparedData,
    imageFormat: "jpeg",
    jpegQuality: 90,
    crf: 18,
    concurrency: 2,
    timeoutInMilliseconds: 60000,
    chromiumOptions: {
      disableWebSecurity: true,
      gl: "angle",
    },
  });

  fs.rmSync(publicDir, { recursive: true, force: true });
  console.log("[remotion-v2] Render complete.");
}
