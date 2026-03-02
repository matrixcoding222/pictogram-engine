import Anthropic from "@anthropic-ai/sdk";
import type { ScriptConfig, GeneratedScript, SubTopic } from "./types.js";

const SCRIPT_SYSTEM_PROMPT = `You are the head scriptwriter for a YouTube channel that explains intriguing scientific theories and phenomena. You write narration scripts that are spoken as voiceover.

VOICE & TONE:
- Curious, slightly dramatic, but never sensationalized
- Explain to an intelligent friend who isn't a scientist
- Use vivid analogies: "Imagine shrinking yourself down to the size of an atom. At this scale, the solid table in front of you would look like a vast, mostly empty cathedral..."
- Vary sentence length — short punchy for impact, longer for explanation
- Express genuine wonder. Admit when something is unknown or debated.
- Never use: "In this video", "Let's dive in", "Without further ado"

STRUCTURE:
1. HOOK (first 15 seconds): A provocative question, mind-blowing statement, or "what if" scenario. Must grab attention IMMEDIATELY.
2. BODY: Cover the sub-topics, each with its own mini-arc (setup → explanation → payoff). Between sub-topics, use anticipation bridges: "But that's not even the strangest part..." / "And this is where things get really weird..." / "Now, if you think that was unsettling..."
3. BUILD: Arrange sub-topics so the most mind-blowing one comes near the end.
4. CLOSE: Thought-provoking reflection + natural subscribe CTA woven into narration.

Mark your script with:
- [SCENE BREAK] where the visual should change (roughly every 20-40 words)
- [TOPIC: Topic Name] at the start of each sub-topic section

OUTPUT: Return ONLY the spoken narration text with markers. Nothing else. No stage directions, no visual descriptions.`;

/**
 * Capitalizes words in a topic string for use as a video title.
 * Lowercases minor words (articles, conjunctions, short prepositions)
 * unless they are the first or last word of the title.
 */
function toTitleCase(text: string): string {
  const minorWords = new Set([
    "a", "an", "the", "and", "but", "or", "nor", "for", "yet", "so",
    "in", "on", "at", "to", "by", "of", "up", "as", "is", "if", "it",
    "vs", "via", "per", "from", "into", "with", "than", "over",
  ]);

  const words = text.trim().split(/\s+/);

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();

      // Always capitalize first and last word
      if (index === 0 || index === words.length - 1) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }

      // Keep minor words lowercase
      if (minorWords.has(lower)) {
        return lower;
      }

      // Capitalize everything else
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Generates a properly formatted title from a topic string.
 * Truncates to 60 characters max (with ellipsis) and applies title casing.
 */
function generateTitle(topic: string): string {
  const titled = toTitleCase(topic);
  if (titled.length > 60) {
    // Truncate at the last word boundary before 57 characters
    const truncated = titled.substring(0, 57);
    const lastSpace = truncated.lastIndexOf(" ");
    if (lastSpace > 30) {
      return truncated.substring(0, lastSpace) + "...";
    }
    return truncated + "...";
  }
  return titled;
}

/**
 * Parses a raw script containing [TOPIC:] and [SCENE BREAK] markers
 * into structured sub-topics and clean narration text.
 */
function parseScript(rawText: string): { subTopics: SubTopic[]; fullNarration: string } {
  const subTopics: SubTopic[] = [];
  const topicRegex = /\[TOPIC:\s*(.+?)\]/g;

  // Check if any [TOPIC:] markers exist
  const hasTopicMarkers = topicRegex.test(rawText);
  topicRegex.lastIndex = 0; // Reset regex state after test

  if (!hasTopicMarkers) {
    // No markers found: treat the entire text as a single section
    const cleaned = rawText.replace(/\[SCENE BREAK\]/g, "").trim();
    subTopics.push({ name: "Main", narrationText: cleaned });
    return { subTopics, fullNarration: cleaned };
  }

  const sections = rawText.split(topicRegex);
  let fullNarration = "";

  for (let i = 0; i < sections.length; i++) {
    if (i % 2 === 0) {
      // Content section (either hook or body content following a topic name)
      const cleaned = sections[i].replace(/\[SCENE BREAK\]/g, "").trim();
      if (cleaned) fullNarration += cleaned + " ";
    } else {
      // Topic name (odd indices from split are the capture groups)
      const topicName = sections[i].trim();
      const content = sections[i + 1]
        ? sections[i + 1].replace(/\[SCENE BREAK\]/g, "").trim()
        : "";
      subTopics.push({ name: topicName, narrationText: content });
    }
  }

  fullNarration = fullNarration.trim();
  return { subTopics, fullNarration };
}

/**
 * Calls the Claude API to generate a narration script for the given topic
 * using the channel's script configuration, then parses the result into
 * structured data.
 */
export async function generateScript(
  topic: string,
  config: ScriptConfig,
): Promise<GeneratedScript> {
  const client = new Anthropic();
  const targetWords = config.target_duration_minutes * config.words_per_minute;

  // Use streaming to avoid SDK timeout for large requests
  const stream = client.messages.stream({
    model: config.model,
    max_tokens: 16000,
    system: SCRIPT_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Write a complete narration script about: "${topic}". Target: ${targetWords} words covering ${config.sub_topics_per_video} sub-topics.`,
      },
    ],
  });

  const response = await stream.finalMessage();

  const rawText =
    response.content[0].type === "text" ? response.content[0].text : "";

  if (!rawText.trim()) {
    throw new Error(
      "Claude returned an empty response. Check your API key and model availability.",
    );
  }

  const { subTopics, fullNarration } = parseScript(rawText);
  const wordCount = fullNarration.split(/\s+/).filter(Boolean).length;
  const title = generateTitle(topic);

  return {
    title,
    fullText: rawText,
    fullNarration,
    wordCount,
    subTopics,
  };
}
