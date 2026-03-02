import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { WordRenderData, CaptionRenderConfig } from "./types";

interface CaptionTrackProps {
  wordTimestamps: WordRenderData[];
  config: CaptionRenderConfig;
}

/**
 * Persistent word-by-word caption overlay.
 * Groups words into lines of N, highlights the current word,
 * crossfades between line groups.
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

  // Find which group is active based on current time
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

  // Fade in/out for the group
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

  // Position styles
  const positionStyle: React.CSSProperties =
    position === "top_center"
      ? { top: 60, left: "50%", transform: "translateX(-50%)" }
      : position === "bottom_left"
        ? { bottom: 80, left: 80 }
        : { bottom: 80, left: "50%", transform: "translateX(-50%)" };

  return (
    <div
      style={{
        position: "absolute",
        ...positionStyle,
        opacity: groupOpacity,
        zIndex: 100,
      }}
    >
      {/* Background pill */}
      <div
        style={{
          backgroundColor: `rgba(0, 0, 0, ${backgroundOpacity})`,
          borderRadius: 12,
          padding: "12px 28px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {activeGroup.map((wordData, i) => {
          // Is this word currently being spoken?
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
                textShadow: isActive
                  ? `0 0 12px ${highlightColor}`
                  : "0 2px 4px rgba(0,0,0,0.5)",
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
