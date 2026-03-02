import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";

/**
 * Assemble the final video by combining a silent visual track with voice
 * narration and (optionally) background music.  When music is present,
 * sidechain-compression ("ducking") is applied so that the music volume
 * drops whenever the narrator is speaking.
 *
 * @param visualTrack  Path to the silent video file rendered by Remotion.
 * @param voiceTrack   Path to the narration audio file.
 * @param musicTrack   Path to a background music file (may be empty / missing).
 * @param outputPath   Path where the finished .mp4 will be written.
 */
export function assembleWithFFmpeg(
  visualTrack: string,
  voiceTrack: string,
  musicTrack: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Ensure the output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // If no music track exists, just combine video + voice
    if (!musicTrack || !fs.existsSync(musicTrack)) {
      ffmpeg()
        .input(visualTrack)
        .input(voiceTrack)
        .outputOptions([
          "-map", "0:v",
          "-map", "1:a",
          "-c:v", "copy",
          "-c:a", "aac",
          "-b:a", "192k",
          "-shortest",
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
      return;
    }

    // Full assembly with audio ducking via sidechain compression.
    //
    // Filter graph explanation:
    //   1. Lower the raw music volume to 12 % so it sits under the voice.
    //   2. Split the voice into two copies — one for mixing, one as the
    //      sidechain control signal.
    //   3. Use sidechaincompress on the music controlled by the voice copy
    //      so the music ducks further whenever the narrator is speaking.
    //   4. Mix the voice and ducked music together into the final audio.
    ffmpeg()
      .input(visualTrack)
      .input(voiceTrack)
      .input(musicTrack)
      .complexFilter([
        "[2:a]volume=0.12[music_base]",
        "[1:a]asplit=2[voice][voice_sc]",
        "[music_base][voice_sc]sidechaincompress=threshold=0.015:ratio=10:attack=100:release=800:level_sc=0.8[ducked_music]",
        "[voice][ducked_music]amix=inputs=2:duration=first:dropout_transition=3[final_audio]",
      ])
      .outputOptions([
        "-map", "0:v",
        "-map", "[final_audio]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * Analyse the moods across all scenes and pick a background music file
 * from the local `assets/music/{mood}/` directory that matches the most
 * frequently occurring mood.
 *
 * @param scenes       Array of scene objects, each carrying a `mood` string.
 * @param musicConfig  Music settings from the channel config.
 * @returns            Absolute path to a music file, or an empty string if
 *                     no suitable file is found.
 */
export function selectMusicTrack(
  scenes: Array<{ mood: string }>,
  musicConfig: { default_mood: string },
): string {
  // Count mood frequency across all scenes
  const moodCounts = new Map<string, number>();
  for (const scene of scenes) {
    const mood = scene.mood || musicConfig.default_mood;
    moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
  }

  // Find dominant mood
  let dominantMood = musicConfig.default_mood;
  let maxCount = 0;
  for (const [mood, count] of moodCounts) {
    if (count > maxCount) {
      maxCount = count;
      dominantMood = mood;
    }
  }

  // Look for music file in assets/music/{mood}/
  const musicDir = path.resolve(`assets/music/${dominantMood}`);
  if (fs.existsSync(musicDir)) {
    const files = fs
      .readdirSync(musicDir)
      .filter((f) => f.endsWith(".mp3") || f.endsWith(".wav") || f.endsWith(".ogg"));

    if (files.length > 0) {
      // Pick a random track from the mood folder
      const pick = files[Math.floor(Math.random() * files.length)];
      return path.join(musicDir, pick);
    }
  }

  return "";
}
