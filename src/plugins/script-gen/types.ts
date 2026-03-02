export interface ScriptConfig {
  model: string;
  target_duration_minutes: number;
  sub_topics_per_video: number;
  words_per_minute: number;
}

// Re-export v2 types for convenience
export type { ParsedScript, SubTopicV2 } from "../../core/types-v2.js";
