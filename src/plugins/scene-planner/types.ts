export type Mood = "mysterious" | "dramatic" | "wonder" | "tense" | "calm" | "exciting";

export interface PictogramPosition {
  id: string;
  x_percent: number;
  y_percent: number;
  scale: number;
}

export interface TextLabel {
  text: string;
  x_percent: number;
  y_percent: number;
  size: "small" | "medium" | "large";
  color?: "red" | "blue" | "green" | "black" | "orange" | "purple";
}

export interface CameraConfig {
  type: "zoom_in" | "static";
}

export interface TopicListItem {
  name: string;
  image_path: string;
}

export interface TopicListData {
  items: TopicListItem[];
  highlighted_index: number;
}

export interface ScenePlan {
  scene_id: string;
  scene_type: "doodle" | "reference_image" | "topic_list";
  narration_text: string;
  duration_estimate_seconds: number;
  image_search_query: string;
  ai_image_prompt: string;
  pictogram_ids: string[];
  pictogram_positions: PictogramPosition[];
  text_labels: TextLabel[];
  camera: CameraConfig;
  mood: Mood;
  topic_list_data?: TopicListData;
}

export interface AlignedScene extends ScenePlan {
  startTime: number;
  endTime: number;
  durationSeconds: number;
  durationInFrames: number;
}
