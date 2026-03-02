export interface ScriptConfig {
  model: string;
  target_duration_minutes: number;
  sub_topics_per_video: number;
  words_per_minute: number;
}

export interface SubTopic {
  name: string;
  narrationText: string;
}

export interface GeneratedScript {
  title: string;
  fullText: string;
  fullNarration: string;
  wordCount: number;
  subTopics: SubTopic[];
}
