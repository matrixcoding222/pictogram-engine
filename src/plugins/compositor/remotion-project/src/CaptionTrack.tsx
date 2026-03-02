import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { WordRenderData, CaptionRenderConfig } from "./types";

interface CaptionTrackProps {
  wordTimestamps: WordRenderData[];
  config: CaptionRenderConfig;
}

/**
 * Whiteboard-style caption track.
 * Dark text on semi-transparent white pill, sits at bottom of white canvas.
 * Current word is highlighted with accent color.
 */
export const CaptionTrack: React.FC<CaptionTrackProps> = ({
  wordTimestamps,
  config,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!config.enabled || wordTimestamps.length === 0) return null;

  const currentTime = frame / fps;
  const { wordsPerGroup, highlightColor, baseColor, fontSize, backgroundOpacity, position } = config;

  // Group words into lines
  const groups: WordRenderData[][] = [];
  for (let i = 0; i < wordTimestamps.length; i += wordsPerGroup) {
    groups.push(wordTimestamps.slice(i, i + wordsPerGroup));
  }

  // Find active group
  let activeGroupIndex = -1;
  for (let g = 0; g < groups.length; g++) {
    const group = groups[g];
    const groupStart = group[0].start;
    const groupEnd = group[group.length - 1].end;
    if (currentTime >= groupStart - 0.1 && currentTime <= groupEnd + 0.3) {
      activeGroupIndex = g;
      break;
    }
  }

  if (activeGroupIndex === -1) return null;

  const activeGroup = groups[activeGroupIndex];
  const groupStart = activeGroup[0].start;
  const groupEnd = activeGroup[activeGroup.length - 1].end;

  const groupFadeIn = interpolate(
    currentTime,
    [groupStart - 0.1, groupStart],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const groupFadeOut = interpolate(
    currentTime,
    [groupEnd, groupEnd + 0.3],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const groupOpacity = Math.min(groupFadeIn, groupFadeOut);

  const positionStyle: React.CSSProperties =
    position === "top_center"
      ? { top: 60, left: "50%", transform: "translateX(-50%)" }
      : position === "bottom_left"
        ? { bottom: 60, left: 80 }
        : { bottom: 60, left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        opacity: groupOpacity,
        zIndex: 100,
      }}
    >
      {/* White pill background for whiteboard style */}
      <div
        style={{
          backgroundColor: `rgba(255, 255, 255, ${backgroundOpacity})`,
          borderRadius: 12,
          padding: "10px 24px",
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
        }}
      >
        {activeGroup.map((wordData, i) => {
          const isActive =
            currentTime >= wordData.start && currentTime <= wordData.end;

          return (
            <span
              key={i}
              style={{
                fontSize,
                fontFamily: "'Arial Black', Arial, sans-serif",
                fontWeight: 900,
                color: isActive ? highlightColor : baseColor,
                transition: "color 0.05s",
              }}
            >
              {wordData.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
