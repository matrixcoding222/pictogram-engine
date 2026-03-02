export interface ImageSourcingConfig {
  priority: string[];
  flux_model: string;
}

export interface PexelsPhoto {
  url: string;
  urlLarge2x: string;
  photographer: string;
  photographerUrl: string;
  pexelsUrl: string;
}

export interface SourcedImage {
  localPath: string;
  source: "pexels" | "flux_ai" | "none";
  attribution?: string;
}
