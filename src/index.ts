import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { generateVideo, generateVideoV2 } from "./core/orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const args = process.argv.slice(2);

  // Parse flags
  const useV2 = args.includes("--v2");
  const filteredArgs = args.filter((a) => a !== "--v2");

  // Parse --topic flag
  let topic = "";
  const topicIndex = filteredArgs.indexOf("--topic");
  if (topicIndex !== -1 && filteredArgs[topicIndex + 1]) {
    topic = filteredArgs[topicIndex + 1];
  } else if (filteredArgs.length > 0 && !filteredArgs[0].startsWith("--")) {
    topic = filteredArgs.join(" ");
  }

  if (!topic) {
    console.log("Pictogram Engine - YouTube Video Generator\n");
    console.log("Usage:");
    console.log('  npx tsx src/index.ts --topic "Your video topic here"');
    console.log('  npx tsx src/index.ts --v2 --topic "Your video topic here"');
    console.log('  npx tsx src/index.ts "Your video topic here"');
    console.log("\nFlags:");
    console.log("  --v2    Use the v2 grid-based visual storytelling pipeline");
    console.log("\nExamples:");
    console.log(
      '  npx tsx src/index.ts --topic "The Most Terrifying Theories About the Universe"'
    );
    console.log(
      '  npx tsx src/index.ts --v2 --topic "The Most Disturbing Planets Ever Found"'
    );
    console.log("\nEnvironment variables required (.env):");
    console.log("  ANTHROPIC_API_KEY    - Claude API key");
    console.log("  PEXELS_API_KEY       - Pexels API key");
    console.log("  REPLICATE_API_TOKEN  - Replicate API token (for FLUX)");
    console.log("\nOptional:");
    console.log("  AUTO_UPLOAD=true     - Auto-upload to YouTube");
    process.exit(1);
  }

  // Validate required env vars
  const required = [
    "ANTHROPIC_API_KEY",
    "PEXELS_API_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
    console.error("Create a .env file based on .env.example");
    process.exit(1);
  }

  try {
    const result = useV2
      ? await generateVideoV2(topic)
      : await generateVideo(topic);
    console.log(`\nVideo ID: ${result.videoId}`);
    console.log(`Output directory: ${result.outputDir}`);
    console.log(`Final video: ${result.finalVideoPath}`);
  } catch (error) {
    console.error("\nVideo generation failed:");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
