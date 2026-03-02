import Replicate from "replicate";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLUX_MODEL = "black-forest-labs/flux-1.1-pro" as const;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an AI image using FLUX 1.1 Pro via the Replicate API.
 *
 * The prompt should describe the desired scene in detail. The image is
 * generated at 16:9 aspect ratio in PNG format, suitable for 1920x1080
 * video backgrounds.
 *
 * @returns A Buffer containing the raw PNG image data.
 */
export async function generateAIImage(prompt: string): Promise<Buffer> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error("REPLICATE_API_TOKEN environment variable is not set.");
  }

  const replicate = new Replicate({ auth: apiToken });

  console.log(`[flux-ai] Generating image with FLUX 1.1 Pro (prompt: ${prompt.slice(0, 80)}...)`);

  const input = {
    prompt,
    aspect_ratio: "16:9",
    output_format: "png",
    output_quality: 90,
    num_inference_steps: 28,
    guidance_scale: 3.5,
  };

  let output: unknown;
  try {
    output = await replicate.run(FLUX_MODEL, { input });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[flux-ai] Replicate API call failed: ${message}`);
  }

  // Replicate returns a URL (string) or a FileOutput/ReadableStream for image models.
  // FLUX 1.1 Pro returns a single URL string.
  const imageUrl = resolveOutputUrl(output);

  if (!imageUrl) {
    throw new Error(
      `[flux-ai] Unexpected output format from Replicate: ${JSON.stringify(output).slice(0, 200)}`,
    );
  }

  console.log(`[flux-ai] Image generated, downloading from: ${imageUrl}`);

  // Download the generated image
  const imageResponse = await fetch(imageUrl);

  if (!imageResponse.ok) {
    throw new Error(
      `[flux-ai] Failed to download generated image (${imageResponse.status}): ${imageResponse.statusText}`,
    );
  }

  const arrayBuffer = await imageResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`[flux-ai] Image downloaded: ${(buffer.length / 1024).toFixed(1)} KB`);

  return buffer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the image URL from the various output formats Replicate may return.
 *
 * - Single string URL
 * - Array of URLs (take the first)
 * - Object with a `.url()` method (FileOutput)
 */
function resolveOutputUrl(output: unknown): string | null {
  if (typeof output === "string") {
    return output;
  }

  if (Array.isArray(output) && output.length > 0) {
    const first = output[0];
    if (typeof first === "string") {
      return first;
    }
    if (first && typeof first === "object" && "url" in first) {
      const urlValue = (first as Record<string, unknown>).url;
      if (typeof urlValue === "function") {
        return urlValue() as string;
      }
      if (typeof urlValue === "string") {
        return urlValue;
      }
    }
  }

  if (output && typeof output === "object" && "url" in output) {
    const urlValue = (output as Record<string, unknown>).url;
    if (typeof urlValue === "function") {
      return urlValue() as string;
    }
    if (typeof urlValue === "string") {
      return urlValue;
    }
  }

  // FileOutput objects may stringify to the URL
  if (output && typeof output === "object" && typeof (output as { toString?: unknown }).toString === "function") {
    const str = String(output);
    if (str.startsWith("http")) {
      return str;
    }
  }

  return null;
}
