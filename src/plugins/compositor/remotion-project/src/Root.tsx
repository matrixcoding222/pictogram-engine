import React from "react";
import { Composition } from "remotion";
import { VideoComposition, calculateTotalFrames } from "./VideoComposition";
import type { VideoData } from "./types";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="MainVideo"
      component={VideoComposition as unknown as React.ComponentType<Record<string, unknown>>}
      durationInFrames={900}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{
        scenes: [],
      }}
      calculateMetadata={({ props }) => {
        const scenes = (props as unknown as VideoData).scenes;
        return { durationInFrames: calculateTotalFrames(scenes) };
      }}
    />
  );
};
