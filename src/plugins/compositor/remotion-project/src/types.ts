// ---------------------------------------------------------------------------
// Pictogram Engine v2 — Remotion Type Definitions
// ---------------------------------------------------------------------------

// === V1 Types (kept for backward compat) ===

export interface TopicListRenderItem {
  name: string;
  imageSrc: string;
}

export interface TopicListRenderData {
  items: TopicListRenderItem[];
  highlightedIndex: number;
}

export interface SceneData {
  durationInFrames: number;
  sceneType: "doodle" | "reference_image" | "topic_list";
  imageSrc: string;
  camera: "zoom_in" | "static";
  pictograms: Array<{
    src: string;
    svgContent?: string;
    xPercent: number;
    yPercent: number;
    scale: number;
    entranceDelayFrames?: number;
  }>;
  textLabels: Array<{
    text: string;
    xPercent: number;
    yPercent: number;
    size: "small" | "medium" | "large";
    color: string;
    entranceDelayFrames?: number;
  }>;
  topicListData?: TopicListRenderData;
}

export interface VideoData {
  scenes: SceneData[];
}

// === V2 Types ===

export type SceneTypeV2 =
  | "real_photo"
  | "ai_illustration"
  | "cinematic_ai"
  | "diagram"
  | "text_card";

export type CameraTypeV2 =
  | "zoom_in"
  | "zoom_in_dramatic"
  | "zoom_out"
  | "pan_left"
  | "pan_right"
  | "pan_up"
  | "pan_down"
  | "pan_and_zoom"
  | "static";

export type MoodV2 =
  | "mysterious"
  | "dramatic"
  | "wonder"
  | "tense"
  | "calm"
  | "exciting"
  | "triumphant"
  | "dark";

export type SegmentType =
  | "hook"
  | "overview"
  | "zoom_to_cell"
  | "number_card"
  | "section"
  | "pull_back"
  | "outro";

// Scene-level render data (within a section)
export interface SceneRenderData {
  sceneType: SceneTypeV2;
  camera: CameraTypeV2;
  mood: MoodV2;
  imageSrc: string;           // staticFile path (empty for text_card)
  textCardContent?: string;   // for text_card scenes
  durationInFrames: number;
  startFrame: number;         // relative to parent section
}

// Grid cell render data
export interface GridCellRenderData {
  topicName: string;
  imageSrc: string;           // staticFile path to grid cell art
}

// Word timestamp for caption track
export interface WordRenderData {
  word: string;
  start: number;  // seconds
  end: number;    // seconds
}

// Caption configuration
export interface CaptionRenderConfig {
  enabled: boolean;
  wordsPerGroup: number;
  position: "bottom_center" | "bottom_left" | "top_center";
  fontSize: number;
  highlightColor: string;
  baseColor: string;
  backgroundOpacity: number;
}

// Segment-level render data
export interface SegmentRenderData {
  type: SegmentType;
  startFrame: number;
  durationInFrames: number;

  // Narrated segments
  narrationText?: string;

  // Grid-related segments
  topicIndex?: number;
  topicName?: string;
  completedCells?: number[];

  // Number card
  numberCardNumber?: number;

  // Section content
  scenes?: SceneRenderData[];
}

// Top-level video data for v2
export interface VideoDataV2 {
  segments: SegmentRenderData[];
  gridCells: GridCellRenderData[];
  wordTimestamps: WordRenderData[];
  captions: CaptionRenderConfig;
  fps: number;
  gridConfig: {
    columns: number;
    backgroundColor: string;
    cellBorderColor: string;
    cellHighlightColor: string;
  };
  numberCardConfig: {
    backgroundColor: string;
    numberColor: string;
    glowColor: string;
  };
}
