import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
