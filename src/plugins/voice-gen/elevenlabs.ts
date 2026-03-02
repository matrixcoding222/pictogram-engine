import { EdgeTTS } from "node-edge-tts";
import type { VoiceConfig, VoiceResult, WordTimestamp } from "./types.js";
import fs from "fs";
import path from "path";
import os from "os";

const MAX_CHARS_PER_CHUNK = 3000;

/**
 * Split text into chunks at paragraph or sentence boundaries.
 */
function splitIntoChunks(text: string, maxChars: number): string[] {
  // First try paragraph breaks
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // If any chunk is still too long, split on sentences
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChars) {
      result.push(chunk);
      continue;
    }
    const sentences = chunk.split(/(?<=[.!?])\s+/);
    let sub = "";
    for (const sentence of sentences) {
      const candidate = sub ? `${sub} ${sentence}` : sentence;
      if (candidate.length > maxChars && sub.length > 0) {
        result.push(sub.trim());
        sub = sentence;
      } else {
        sub = candidate;
      }
    }
    if (sub.trim()) result.push(sub.trim());
  }

  return result;
}

// MP3 bitrate: 24khz 96kbps mono → ~12,000 bytes per second
const BYTES_PER_SECOND = 12000;

/**
 * Generate synthetic word timestamps by distributing words evenly
 * across the estimated audio duration.
 */
function generateSyntheticTimestamps(
  text: string,
  audioBuffer: Buffer
): WordTimestamp[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const estimatedDuration = audioBuffer.length / BYTES_PER_SECOND;
  const wordDuration = estimatedDuration / words.length;

  console.log(
    `[edge-tts] Using synthetic timestamps: ${estimatedDuration.toFixed(1)}s for ${words.length} words`
  );

  return words.map((word, i) => ({
    word,
    start: i * wordDuration,
    end: (i + 1) * wordDuration,
  }));
}

/**
 * Generate a single chunk of audio with Edge TTS.
 */
async function generateChunk(
  text: string,
  voice: string,
  lang: string,
  chunkIndex: number
): Promise<{ audioBuffer: Buffer; wordTimestamps: WordTimestamp[] }> {
  const tts = new EdgeTTS({
    voice,
    lang,
    outputFormat: "audio-24khz-96kbitrate-mono-mp3",
    saveSubtitles: true,
    timeout: 120000, // 2 minute timeout per chunk
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `edge-tts-${chunkIndex}-`));
  const audioPath = path.join(tmpDir, "voice.mp3");

  await tts.ttsPromise(text, audioPath);

  const audioBuffer = fs.readFileSync(audioPath);

  // Try multiple possible subtitle file locations
  const subtitlePaths = [
    audioPath.replace(".mp3", ".json"),
    audioPath.replace(".mp3", ".srt"),
    path.join(tmpDir, "subtitles.json"),
  ];

  const wordTimestamps: WordTimestamp[] = [];
  let subtitlesFound = false;

  for (const subtitlePath of subtitlePaths) {
    if (!fs.existsSync(subtitlePath)) continue;

    try {
      const raw = fs.readFileSync(subtitlePath, "utf-8");
      console.log(`[edge-tts] Found subtitle file: ${path.basename(subtitlePath)} (${raw.length} bytes)`);

      const subtitles = JSON.parse(raw) as Array<{ part: string; start: number; end: number }>;

      for (const sub of subtitles) {
        const words = sub.part.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) continue;

        const startSec = sub.start / 1000;
        const endSec = sub.end / 1000;
        const wordDuration = (endSec - startSec) / words.length;

        for (let i = 0; i < words.length; i++) {
          wordTimestamps.push({
            word: words[i],
            start: startSec + i * wordDuration,
            end: startSec + (i + 1) * wordDuration,
          });
        }
      }

      if (wordTimestamps.length > 0) {
        subtitlesFound = true;
        console.log(`[edge-tts] Parsed ${wordTimestamps.length} word timestamps from subtitles`);
        break;
      }
    } catch (err) {
      console.warn(`[edge-tts] Failed to parse subtitle file ${path.basename(subtitlePath)}:`, err);
    }
  }

  // Fallback: generate synthetic timestamps from audio buffer size
  if (!subtitlesFound || wordTimestamps.length === 0) {
    console.log(`[edge-tts] No subtitle timestamps found for chunk ${chunkIndex}, using synthetic fallback`);
    const synthetic = generateSyntheticTimestamps(text, audioBuffer);
    wordTimestamps.push(...synthetic);
  }

  // Clean up
  try {
    const files = fs.readdirSync(tmpDir);
    for (const f of files) fs.unlinkSync(path.join(tmpDir, f));
    fs.rmdirSync(tmpDir);
  } catch { /* ignore */ }

  return { audioBuffer, wordTimestamps };
}

/**
 * Generate narration audio with word-level timestamps using Microsoft Edge TTS.
 * Free, no API key required, outputs MP3 directly with subtitle timestamps.
 * Long texts are split into chunks to avoid timeouts.
 */
export async function generateVoice(
  narrationText: string,
  config: VoiceConfig
): Promise<VoiceResult> {
  const voice = config.voice_id || "en-US-GuyNeural";
  const lang = config.language || "en-US";

  const chunks = splitIntoChunks(narrationText, MAX_CHARS_PER_CHUNK);

  console.log(
    `[edge-tts] Generating voice with "${voice}" for ${narrationText.length} chars in ${chunks.length} chunk(s)`
  );

  const allAudioBuffers: Buffer[] = [];
  const allTimestamps: WordTimestamp[] = [];
  let cumulativeDuration = 0;

  for (let i = 0; i < chunks.length; i++) {
    console.log(
      `[edge-tts] Processing chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`
    );

    const { audioBuffer, wordTimestamps } = await generateChunk(
      chunks[i],
      voice,
      lang,
      i
    );

    allAudioBuffers.push(audioBuffer);

    // Calculate chunk duration from timestamps, with buffer-size fallback
    let chunkDuration =
      wordTimestamps.length > 0
        ? wordTimestamps[wordTimestamps.length - 1].end
        : 0;

    // If timestamps report 0 duration, estimate from buffer size
    if (chunkDuration <= 0) {
      chunkDuration = audioBuffer.length / BYTES_PER_SECOND;
      console.log(`[edge-tts] Chunk ${i} duration estimated from buffer: ${chunkDuration.toFixed(1)}s`);
    }

    // Offset timestamps by cumulative duration
    for (const wt of wordTimestamps) {
      allTimestamps.push({
        word: wt.word,
        start: wt.start + cumulativeDuration,
        end: wt.end + cumulativeDuration,
      });
    }

    cumulativeDuration += chunkDuration;
  }

  // Concatenate MP3 buffers (MP3 frames are independently decodable, so concat works)
  const combinedAudio = Buffer.concat(allAudioBuffers);

  console.log(
    `[edge-tts] Voice generation complete: ${cumulativeDuration.toFixed(1)}s, ${allTimestamps.length} words`
  );

  return {
    audioBuffer: combinedAudio,
    wordTimestamps: allTimestamps,
    durationSeconds: cumulativeDuration,
    requestIds: ["edge-tts"],
  };
}
