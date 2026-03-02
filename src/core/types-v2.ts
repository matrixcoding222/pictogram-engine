// ---------------------------------------------------------------------------
// Pictogram Engine v2 — Central Type Definitions
// ---------------------------------------------------------------------------

// === FORMAT TEMPLATE ===

export interface GridConfig {
  columns: number;
  cell_art_resolution: number;
  cell_art_prompt_suffix: string;
  cell_border_color: string;
  cell_highlight_color: string;
  background_color: string;
}

export interface NumberCardConfig {
  duration_seconds: number;
  background_color: string;
  number_color: string;
  glow_color: string;
}

export interface CaptionConfig {
  enabled: boolean;
  words_per_group: number;
  position: "bottom_center" | "bottom_left" | "top_center";
  font_size: number;
  highlight_color: string;
  base_color: string;
  background_opacity: number;
}

export interface TimingConfig {
  grid_overview_seconds: number;
  zoom_transition_seconds: number;
  number_card_seconds: number;
  pull_back_seconds: number;
}

export interface SectionContentConfig {
  min_scenes_per_section: number;
  max_scenes_per_section: number;
  image_style_suffixes: Record<string, string>;
}

export interface ThumbnailConfig {
  source: string;
  title_overlay: boolean;
  title_font_size: number;
}

export interface FormatTemplate {
  format_id: string;
  format_name: string;
  grid: GridConfig;
  number_card: NumberCardConfig;
  captions: CaptionConfig;
  timing: TimingConfig;
  section_content: SectionContentConfig;
  thumbnail: ThumbnailConfig;
}

// === PARSED SCRIPT ===

export interface SubTopicV2 {
  index: number;
  name: string;
  narrationText: string;
}

export interface ParsedScript {
  title: string;
  hook: string;
  overview: string;
  subTopics: SubTopicV2[];
  bridges: string[];
  outro: string;
  fullNarration: string;
  fullText?: string;  // Raw text with markers (for backward compat during migration)
  wordCount: number;
}

// === SCENE PLANNING ===

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

export interface ScenePlanV2 {
  scene_id: string;
  scene_type: SceneTypeV2;
  narration_text: string;
  duration_estimate_seconds: number;
  image_search_query: string;
  ai_image_prompt: string;
  diagram_description?: string;
  text_card_content?: string;
  camera: { type: CameraTypeV2 };
  mood: MoodV2;
}

export interface AlignedSceneV2 extends ScenePlanV2 {
  startTime: number;
  endTime: number;
  durationSeconds: number;
  durationInFrames: number;
}

// === GRID ART ===

export interface ArtDirection {
  topic: string;
  visual_description: string;
  primary_colors: string[];
  subject_type: "object" | "creature" | "symbol" | "scene" | "phenomenon";
}

export interface ArtDirectionResult {
  cells: ArtDirection[];
}

export interface GridCellArt {
  cellIndex: number;
  topicName: string;
  localPath: string;
  source: "flux_ai" | "pexels_fallback" | "none";
  artDirection?: ArtDirection;
}

// === STRUCTURAL TIMELINE ===

export type SegmentType =
  | "hook"
  | "overview"
  | "zoom_to_cell"
  | "number_card"
  | "section"
  | "pull_back"
  | "outro";

export interface TimelineSegment {
  type: SegmentType;
  startFrame: number;
  durationInFrames: number;
  narrationText?: string;
  topicIndex?: number;
  scenes?: AlignedSceneV2[];
  numberCardNumber?: number;
  topicName?: string;
  completedCells?: number[];
}

// === IMAGE SOURCING ===

export interface SourcedImageV2 {
  localPath: string;
  source: "flux_ai_illustration" | "flux_ai_cinematic" | "diagram" | "text_card" | "none";
  attribution?: string;
}
