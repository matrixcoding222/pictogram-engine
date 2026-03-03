import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { generateVideoV2 } from "./core/orchestrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

async function main() {
  const args = process.argv.slice(2);

  let topic = "";
  const topicIndex = args.indexOf("--topic");
  if (topicIndex !== -1 && args[topicIndex + 1]) {
    topic = args[topicIndex + 1];
  } else {
    const bareArgs = args.filter((a) => !a.startsWith("--"));
    if (bareArgs.length > 0) topic = bareArgs.join(" ");
  }

  if (!topic) {
    console.log("Pictogram Engine — YouTube Video Generator\n");
    console.log("Usage:");
    console.log('  npx tsx src/index.ts --topic "Your video topic here"');
    console.log("\nEnvironment variables required (.env):");
    console.log("  ANTHROPIC_API_KEY    — Claude API key");
    console.log("  REPLICATE_API_TOKEN  — Replicate API key (FLUX AI images)");
    console.log("\nOptional:");
    console.log("  AUTO_UPLOAD=true     — Auto-upload to YouTube");
    process.exit(1);
  }

  const required = ["ANTHROPIC_API_KEY", "REPLICATE_API_TOKEN"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`\n❌ Missing required environment variables: ${missing.join(", ")}`);
    if (missing.includes("REPLICATE_API_TOKEN")) {
      console.error("\nREPLICATE_API_TOKEN is REQUIRED — AI images are generated via FLUX.");
      console.error("Get a token at: https://replicate.com/account/api-tokens");
    }
    console.error("\nCreate a .env file with your API keys.");
    process.exit(1);
  }


  try {
    const result = await generateVideoV2(topic);
    console.log(`\nVideo ID: ${result.videoId}`);
    console.log(`Output directory: ${result.outputDir}`);
    console.log(`Final video: ${result.finalVideoPath}`);
  } catch (error) {
    console.error("\n❌ Video generation failed:");
    console.error(error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error("\nStack trace:");
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
