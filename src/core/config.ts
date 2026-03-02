import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { logger } from "./logger";

// ---------------------------------------------------------------------------
// Channel config interface
// ---------------------------------------------------------------------------

export interface ScriptSettings {
  model: string;
  target_duration_minutes: number;
  sub_topics_per_video: number;
  words_per_minute: number;
}

export interface VoiceSettings {
  provider: string;
  model_id: string;
  voice_id: string;
  language: string;
  speed: number;
  emotion: string;
}

export interface VisualsSettings {
  width: number;
  height: number;
  fps: number;
  scene_duration_range: [number, number];
  background_color?: string;
  style?: string;
}

export interface ImageSourcingSettings {
  priority: string[];
  flux_model: string;
}

export interface MusicSettings {
  volume_during_narration: number;
  volume_during_pause: number;
  default_mood: string;
}

export interface ThumbnailSettings {
  grid: string;
  background: string;
}

export interface UploadSettings {
  category_id: string;
  default_tags: string[];
}

export interface ChannelConfig {
  channel_id: string;
  channel_name: string;
  script: ScriptSettings;
  voice: VoiceSettings;
  visuals: VisualsSettings;
  image_sourcing: ImageSourcingSettings;
  music: MusicSettings;
  thumbnail: ThumbnailSettings;
  upload: UploadSettings;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertString(obj: Record<string, unknown>, key: string, context: string): void {
  if (typeof obj[key] !== "string" || (obj[key] as string).length === 0) {
    throw new Error(`Config validation failed: "${context}.${key}" must be a non-empty string.`);
  }
}

function assertNumber(obj: Record<string, unknown>, key: string, context: string): void {
  if (typeof obj[key] !== "number" || Number.isNaN(obj[key])) {
    throw new Error(`Config validation failed: "${context}.${key}" must be a number.`);
  }
}

function assertTuple(obj: Record<string, unknown>, key: string, length: number, context: string): void {
  const val = obj[key];
  if (!Array.isArray(val) || val.length !== length || val.some((v) => typeof v !== "number")) {
    throw new Error(
      `Config validation failed: "${context}.${key}" must be an array of ${length} numbers.`,
    );
  }
}

function assertStringArray(obj: Record<string, unknown>, key: string, context: string): void {
  const val = obj[key];
  if (!Array.isArray(val) || val.some((v) => typeof v !== "string")) {
    throw new Error(`Config validation failed: "${context}.${key}" must be an array of strings.`);
  }
}

function assertObject(obj: Record<string, unknown>, key: string, context: string): Record<string, unknown> {
  const val = obj[key];
  if (typeof val !== "object" || val === null || Array.isArray(val)) {
    throw new Error(`Config validation failed: "${context}.${key}" must be an object.`);
  }
  return val as Record<string, unknown>;
}

function validate(raw: unknown): ChannelConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Config validation failed: root must be a JSON object.");
  }

  const root = raw as Record<string, unknown>;

  assertString(root, "channel_id", "root");
  assertString(root, "channel_name", "root");

  // script
  const script = assertObject(root, "script", "root");
  assertString(script, "model", "script");
  assertNumber(script, "target_duration_minutes", "script");
  assertNumber(script, "sub_topics_per_video", "script");
  assertNumber(script, "words_per_minute", "script");

  // voice
  const voice = assertObject(root, "voice", "root");
  assertString(voice, "provider", "voice");
  assertString(voice, "model_id", "voice");
  assertString(voice, "voice_id", "voice");
  assertString(voice, "language", "voice");
  assertNumber(voice, "speed", "voice");
  assertString(voice, "emotion", "voice");

  // visuals
  const visuals = assertObject(root, "visuals", "root");
  assertNumber(visuals, "width", "visuals");
  assertNumber(visuals, "height", "visuals");
  assertNumber(visuals, "fps", "visuals");
  assertTuple(visuals, "scene_duration_range", 2, "visuals");

  // image_sourcing
  const imageSourcing = assertObject(root, "image_sourcing", "root");
  assertStringArray(imageSourcing, "priority", "image_sourcing");
  assertString(imageSourcing, "flux_model", "image_sourcing");

  // music
  const music = assertObject(root, "music", "root");
  assertNumber(music, "volume_during_narration", "music");
  assertNumber(music, "volume_during_pause", "music");
  assertString(music, "default_mood", "music");

  // thumbnail
  const thumbnail = assertObject(root, "thumbnail", "root");
  assertString(thumbnail, "grid", "thumbnail");
  assertString(thumbnail, "background", "thumbnail");

  // upload
  const upload = assertObject(root, "upload", "root");
  assertString(upload, "category_id", "upload");
  assertStringArray(upload, "default_tags", "upload");

  return root as unknown as ChannelConfig;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load environment variables from `.env` and read + validate the channel
 * configuration from `config/channel.json`.
 *
 * @param projectRoot  Absolute path to the project root directory.
 *                     Defaults to two levels up from this file
 *                     (i.e. `src/core/../../`).
 */
export function loadConfig(projectRoot?: string): ChannelConfig {
  const root = projectRoot ?? path.resolve(__dirname, "..", "..");

  // Load .env
  const envPath = path.join(root, ".env");
  dotenv.config({ path: envPath });
  logger.debug(`Loaded environment from ${envPath}`);

  // Read channel config
  const configPath = path.join(root, "config", "channel.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Channel config not found at ${configPath}`);
  }

  const raw: unknown = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const config = validate(raw);

  logger.info(`Loaded channel config for "${config.channel_name}" (${config.channel_id})`);
  return config;
}
