import type { PexelsPhoto } from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PEXELS_API_URL = "https://api.pexels.com/v1/search";

/** Minimum delay between requests to stay within the 200 req/hour rate limit. */
const RATE_LIMIT_DELAY_MS = 2000;

// ---------------------------------------------------------------------------
// Rate-limiting state
// ---------------------------------------------------------------------------

let lastRequestTime = 0;

/**
 * Enforce a minimum delay between Pexels API requests.
 * The Pexels free tier allows 200 requests/hour (~1 every 18s on average),
 * but bursts are fine as long as we don't exceed the hourly cap. A 2-second
 * floor prevents accidental rapid-fire calls from hitting 429 errors.
 */
async function enforceRateLimit(): Promise<void> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
    console.log(`[pexels] Rate limit: waiting ${waitTime}ms before next request`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }
  lastRequestTime = Date.now();
}

// ---------------------------------------------------------------------------
// Pexels API response types
// ---------------------------------------------------------------------------

interface PexelsApiPhoto {
  id: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
  };
}

interface PexelsSearchResponse {
  total_results: number;
  page: number;
  per_page: number;
  photos: PexelsApiPhoto[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search the Pexels library for a landscape photo matching the given query.
 *
 * Returns the first result as a `PexelsPhoto` or `null` if no results were
 * found or the request fails.
 */
export async function searchPexels(query: string): Promise<PexelsPhoto | null> {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    console.error("[pexels] PEXELS_API_KEY environment variable is not set.");
    return null;
  }

  await enforceRateLimit();

  const params = new URLSearchParams({
    query,
    orientation: "landscape",
    size: "large",
    per_page: "5",
  });

  const url = `${PEXELS_API_URL}?${params.toString()}`;

  console.log(`[pexels] Searching for: "${query}"`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: apiKey,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[pexels] API error (${response.status}): ${errorBody}`);
      return null;
    }

    const data = (await response.json()) as PexelsSearchResponse;

    if (!data.photos || data.photos.length === 0) {
      console.log(`[pexels] No results found for: "${query}"`);
      return null;
    }

    // Pick the first (most relevant) result
    const photo = data.photos[0];

    console.log(
      `[pexels] Found ${data.total_results} results for "${query}". ` +
        `Using photo by ${photo.photographer} (id: ${photo.id})`,
    );

    return {
      url: photo.src.large,
      urlLarge2x: photo.src.large2x,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      pexelsUrl: photo.url,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[pexels] Request failed for "${query}": ${message}`);
    return null;
  }
}
