import React from "react";
import { Composition } from "remotion";
import { VideoComposition, VideoCompositionV2, calculateTotalFrames, calculateTotalFramesV2 } from "./VideoComposition";
import type { VideoData, VideoDataV2 } from "./types";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* V1 composition (preserved for backward compat) */}
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

      {/* V2 composition — segment-based grid video */}
      <Composition
        id="MainVideoV2"
        component={VideoCompositionV2 as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={900}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{
          segments: [],
          gridCells: [],
          wordTimestamps: [],
          captions: {
            enabled: true,
            wordsPerGroup: 4,
            position: "bottom_center",
            fontSize: 48,
            highlightColor: "#FFD700",
            baseColor: "#FFFFFF",
            backgroundOpacity: 0.6,
          },
          fps: 30,
          gridConfig: {
            columns: 3,
            backgroundColor: "#0a0a0a",
            cellBorderColor: "#111111",
            cellHighlightColor: "#FFD700",
          },
          numberCardConfig: {
            backgroundColor: "#000000",
            numberColor: "#FFFFFF",
            glowColor: "#FFD700",
          },
        }}
        calculateMetadata={({ props }) => {
          const segments = (props as unknown as VideoDataV2).segments;
          return { durationInFrames: calculateTotalFramesV2(segments) };
        }}
      />
    </>
  );
};
