import type { WordTimestamp } from "../voice-gen/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of words to group into each subtitle line. */
const WORDS_PER_LINE = 8;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Pad a number with leading zeros to the specified width.
 */
function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * Format a time value in seconds to the SRT timestamp format
 * `HH:MM:SS,mmm` (e.g. `00:01:23,456`).
 */
function formatSRTTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);

  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1_000);
  const ms = totalMs % 1_000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(ms, 3)}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an SRT subtitle string from word-level timestamps.
 *
 * Words are grouped into lines of {@link WORDS_PER_LINE} words each.
 * Each subtitle entry spans from the start time of the first word in the
 * group to the end time of the last word in the group.
 *
 * @param wordTimestamps  Array of word-level timing data from the TTS engine.
 * @returns               A fully-formatted SRT string ready to be written
 *                        to a `.srt` file.
 *
 * @example
 * ```
 * 1
 * 00:00:00,120 --> 00:00:03,450
 * The universe is incredibly vast and
 *
 * 2
 * 00:00:03,500 --> 00:00:06,890
 * filled with mysteries that scientists are
 * ```
 */
export function generateSRT(wordTimestamps: WordTimestamp[]): string {
  if (wordTimestamps.length === 0) {
    return "";
  }

  const lines: string[] = [];
  let sequenceNumber = 1;

  for (let i = 0; i < wordTimestamps.length; i += WORDS_PER_LINE) {
    const group = wordTimestamps.slice(i, i + WORDS_PER_LINE);

    const startTime = group[0].start;
    const endTime = group[group.length - 1].end;
    const text = group.map((w) => w.word).join(" ");

    lines.push(
      `${sequenceNumber}`,
      `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}`,
      text,
      "", // blank line separating entries
    );

    sequenceNumber++;
  }

  return lines.join("\n");
}
