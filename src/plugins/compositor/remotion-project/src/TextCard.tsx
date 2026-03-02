import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface TextCardProps {
  content: string;
}

/**
 * Whiteboard-style text card.
 * Big bold dark text on white background, like marker on a whiteboard.
 * Words appear one by one for emphasis.
 */
export const TextCard: React.FC<TextCardProps> = ({ content }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const words = content.split(/\s+/).filter(Boolean);

  // Exit fade
  const exitOpacity = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1920,
        height: 1080,
        backgroundColor: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 120,
        opacity: exitOpacity,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: 16,
          maxWidth: 1400,
        }}
      >
        {words.map((word, i) => {
          const delay = i * 3;
          const wordOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const wordTranslate = interpolate(frame, [delay, delay + 8], [12, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <span
              key={i}
              style={{
                fontSize: 60,
                fontFamily: "'Arial Black', Arial, sans-serif",
                fontWeight: 900,
                color: "#1a1a1a",
                opacity: wordOpacity,
                transform: `translateY(${wordTranslate}px)`,
              }}
            >
              {word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
