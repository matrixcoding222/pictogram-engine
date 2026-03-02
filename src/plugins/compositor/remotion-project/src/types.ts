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
