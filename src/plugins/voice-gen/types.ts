export interface VoiceConfig {
  provider: string;
  model_id: string;
  voice_id: string;
  language: string;
  speed: number;
  emotion: string;
}

export interface CartesiaWordTimestamps {
  words: string[];
  start: number[];
  end: number[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface VoiceResult {
  audioBuffer: Buffer;
  wordTimestamps: WordTimestamp[];
  durationSeconds: number;
  requestIds: string[];
}
