import Anthropic from "@anthropic-ai/sdk";
import type { GeneratedScript } from "../script-gen/types.js";
import type { UploadSettings } from "../../core/config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SEO_SYSTEM_PROMPT = `You are a YouTube SEO specialist for a science / education channel. Given a video script and its topic, generate optimised YouTube metadata.

RULES:
- Title: under 70 characters, engaging, curiosity-driven. Do NOT use all-caps clickbait. Prefer a question or surprising statement.
- Description: 2-3 sentence summary, then a blank line, then a "Timestamps:" section with one line per sub-topic using the format "00:00 - Topic Name". End with 2-3 relevant hashtags.
- Tags: 15-25 comma-separated tags. Mix broad terms ("science", "explained") with specific long-tail keywords related to the topic.

RESPOND WITH VALID JSON ONLY — no markdown fences, no commentary:
{
  "title": "...",
  "description": "...",
  "tags": ["tag1", "tag2", ...]
}`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Call Claude to generate SEO-optimised YouTube metadata (title, description,
 * and tags) based on the generated script and topic.
 *
 * The returned tags are the union of Claude-generated tags and any
 * `default_tags` defined in the channel's upload configuration.
 *
 * @param script       The generated narration script with sub-topics.
 * @param topic        The original topic string for the video.
 * @param uploadConfig Upload settings from the channel config.
 * @returns            YouTube metadata ready for the Data API.
 */
export async function generateMetadata(
  script: GeneratedScript,
  topic: string,
  uploadConfig: UploadSettings,
): Promise<YouTubeMetadata> {
  const client = new Anthropic();

  // Build a concise representation of the script for the prompt
  const subTopicList = script.subTopics
    .map((st, i) => `${i + 1}. ${st.name}`)
    .join("\n");

  const userPrompt = [
    `Topic: "${topic}"`,
    `Video title (working): "${script.title}"`,
    `Word count: ${script.wordCount}`,
    ``,
    `Sub-topics covered:`,
    subTopicList,
    ``,
    `Script excerpt (first 1500 chars):`,
    script.fullNarration.slice(0, 1500),
  ].join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SEO_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  if (!rawText.trim()) {
    throw new Error(
      "Claude returned an empty response when generating YouTube metadata.",
    );
  }

  // Parse the JSON response — strip any accidental markdown fences
  const cleaned = rawText.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: { title: string; description: string; tags: string[] };
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse Claude metadata response as JSON: ${(err as Error).message}\n\nRaw response:\n${rawText}`,
    );
  }

  // Validate required fields
  if (!parsed.title || typeof parsed.title !== "string") {
    throw new Error("Claude metadata response missing a valid 'title' field.");
  }
  if (!parsed.description || typeof parsed.description !== "string") {
    throw new Error("Claude metadata response missing a valid 'description' field.");
  }
  if (!Array.isArray(parsed.tags)) {
    throw new Error("Claude metadata response missing a valid 'tags' array.");
  }

  // Enforce title length constraint
  let title = parsed.title;
  if (title.length > 70) {
    const truncated = title.substring(0, 67);
    const lastSpace = truncated.lastIndexOf(" ");
    title = lastSpace > 30 ? truncated.substring(0, lastSpace) + "..." : truncated + "...";
  }

  // Merge Claude-generated tags with channel default tags, deduplicating
  const tagSet = new Set<string>(
    parsed.tags.map((t) => t.trim().toLowerCase()),
  );
  for (const defaultTag of uploadConfig.default_tags) {
    tagSet.add(defaultTag.trim().toLowerCase());
  }
  const mergedTags = Array.from(tagSet);

  return {
    title,
    description: parsed.description,
    tags: mergedTags,
    categoryId: uploadConfig.category_id,
  };
}
