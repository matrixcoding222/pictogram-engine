import Anthropic from "@anthropic-ai/sdk";
import type { ScriptConfig } from "./types.js";
import type { ParsedScript, SubTopicV2 } from "../../core/types-v2.js";

const SCRIPT_SYSTEM_PROMPT = `You are the head scriptwriter for a YouTube channel that creates "Top N" list videos about science and the unexplained. You write narration scripts that are spoken as voiceover over visually rich content.

UNDERSTANDING THE VIDEO FORMAT:
This script will be turned into a video with this visual structure:
- A MASTER GRID shows cartoon depictions of all items (like a table of contents)
- The camera ZOOMS INTO each grid cell when transitioning to a new item
- Each section has its own visual content (photos, illustrations, diagrams)
- The camera PULLS BACK to the grid between sections
- A NUMBER CARD ("#5", "#4", etc.) appears before each section

Your script must work with this visual system.

VOICE & TONE:
- Curious, slightly dramatic, never sensationalized
- Explain to an intelligent friend who isn't a scientist
- Use vivid analogies and thought experiments
- Vary sentence length — short punchy for impact, longer for explanation
- Express genuine wonder. Admit when something is unknown or debated.
- Never use: "In this video", "Let's dive in", "Without further ado"

STRUCTURE:

1. HOOK (first 15-20 seconds, 40-50 words):
   A provocative question, mind-blowing statement, or "what if" scenario.
   Must grab attention IMMEDIATELY. This plays over dramatic imagery.
   End the hook with a clear transition to the list.

2. OVERVIEW (1-2 sentences, 15-25 words):
   Brief line that transitions from the hook to the list.
   This plays while the master grid is being revealed.
   Example: "From the bizarre to the terrifying, here are five discoveries that changed everything."

3. NUMBERED SECTIONS (one per sub-topic):
   Each section follows this internal structure:

   a) OPENING STATEMENT (1-2 sentences): Sets up what this item is.
      This plays right after the number card and grid zoom.

   b) EXPLANATION (main body, 150-300 words): The meat of the section.
      Include specific details, dates, names, locations — things that
      can be visualized with real photos or illustrations.
      IMPORTANT: Write with visual scenes in mind. Every 25-40 words,
      the visual will change, so reference specific visualizable things.

   c) PAYOFF (1-2 sentences): The "wow" moment or key takeaway.

   d) BRIDGE TO NEXT (1 sentence, after the section): Builds anticipation for the next item.
      Examples: "But that's not even the strangest part..."
      "If you thought that was unsettling, wait until you hear this..."
      The bridge plays as the camera pulls back to the grid.
      The LAST section does NOT have a bridge — it transitions to the outro.

4. ARRANGE BY IMPACT:
   The list should build in intensity. The most mind-blowing item comes LAST.

5. OUTRO (15-25 words):
   Thought-provoking reflection that ties back to the hook.
   Weave in a natural subscribe CTA. No "smash that like button."

MARKERS — use these EXACTLY:
- [HOOK] at the very start
- [OVERVIEW] before the overview bridge sentence
- [TOPIC: Full Topic Name] at the start of each numbered section
- [SCENE BREAK] where the visual should change (every 25-40 words within sections)
- [BRIDGE] before each between-section bridge line
- [OUTRO] before the outro

CRITICAL RULES:
- Target word count: {targetWords} words total
- Exactly {subTopicCount} sub-topics
- Every sub-topic section must reference 3-6 specific, visualizable things
- The overview must be short enough for a 3-5 second grid reveal
- Bridges between sections must be exactly 1 sentence
- Write ONLY the spoken narration. No stage directions. No visual descriptions.

OUTPUT: Return ONLY the narration text with the markers above. Nothing else.`;

/**
 * Capitalizes words in a topic string for use as a video title.
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
      if (index === 0 || index === words.length - 1) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      if (minorWords.has(lower)) {
        return lower;
      }
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function generateTitle(topic: string): string {
  const titled = toTitleCase(topic);
  if (titled.length > 60) {
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
 * Parses a raw script containing v2 markers into the ParsedScript structure.
 * Markers: [HOOK], [OVERVIEW], [TOPIC: Name], [SCENE BREAK], [BRIDGE], [OUTRO]
 */
function parseScriptV2(rawText: string): Omit<ParsedScript, "title"> {
  let hook = "";
  let overview = "";
  const subTopics: SubTopicV2[] = [];
  const bridges: string[] = [];
  let outro = "";

  // Split the text by all major markers
  const markerRegex = /\[(HOOK|OVERVIEW|TOPIC:\s*.+?|BRIDGE|OUTRO)\]/g;
  const parts: Array<{ marker: string; text: string }> = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(rawText)) !== null) {
    // Capture text before this marker (if any, belongs to previous marker)
    if (parts.length > 0 && lastIndex < match.index) {
      parts[parts.length - 1].text += rawText.substring(lastIndex, match.index);
    } else if (lastIndex < match.index) {
      // Text before the first marker (pre-hook)
      const preText = rawText.substring(lastIndex, match.index).trim();
      if (preText) {
        parts.push({ marker: "PRE", text: preText });
      }
    }

    parts.push({ marker: match[1], text: "" });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last marker
  if (parts.length > 0 && lastIndex < rawText.length) {
    parts[parts.length - 1].text += rawText.substring(lastIndex);
  }

  // Process each part
  let topicIndex = 0;
  for (const part of parts) {
    const cleanedText = part.text
      .replace(/\[SCENE BREAK\]/g, "")
      .trim();

    if (part.marker === "HOOK" || part.marker === "PRE") {
      hook = cleanedText;
    } else if (part.marker === "OVERVIEW") {
      overview = cleanedText;
    } else if (part.marker.startsWith("TOPIC:")) {
      const topicName = part.marker.replace(/^TOPIC:\s*/, "").trim();
      subTopics.push({
        index: topicIndex,
        name: topicName,
        narrationText: cleanedText,
      });
      topicIndex++;
    } else if (part.marker === "BRIDGE") {
      bridges.push(cleanedText);
    } else if (part.marker === "OUTRO") {
      outro = cleanedText;
    }
  }

  // Build fullNarration — all sections concatenated in order
  const narrationParts: string[] = [];
  if (hook) narrationParts.push(hook);
  if (overview) narrationParts.push(overview);
  for (let i = 0; i < subTopics.length; i++) {
    if (subTopics[i].narrationText) {
      narrationParts.push(subTopics[i].narrationText);
    }
    if (i < bridges.length && bridges[i]) {
      narrationParts.push(bridges[i]);
    }
  }
  if (outro) narrationParts.push(outro);

  const fullNarration = narrationParts.join(" ").replace(/\s+/g, " ").trim();
  const wordCount = fullNarration.split(/\s+/).filter(Boolean).length;

  return {
    hook,
    overview,
    subTopics,
    bridges,
    outro,
    fullNarration,
    wordCount,
  };
}

/**
 * Calls Claude to generate a format-aware narration script for a "Top N" video,
 * then parses it into the ParsedScript structure.
 */
export async function generateScript(
  topic: string,
  config: ScriptConfig,
): Promise<ParsedScript> {
  const client = new Anthropic();
  const targetWords = config.target_duration_minutes * config.words_per_minute;

  const prompt = SCRIPT_SYSTEM_PROMPT
    .replace("{targetWords}", String(targetWords))
    .replace("{subTopicCount}", String(config.sub_topics_per_video));

  const stream = client.messages.stream({
    model: config.model,
    max_tokens: 16000,
    system: prompt,
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

  const parsed = parseScriptV2(rawText);
  const title = generateTitle(topic);

  return {
    title,
    fullText: rawText,
    ...parsed,
  };
}
