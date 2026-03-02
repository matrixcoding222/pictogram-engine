import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

interface TextCardProps {
  content: string;
}

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
        background: "linear-gradient(135deg, #0d1117 0%, #1a1a2e 50%, #0d1117 100%)",
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
          // Staggered word-by-word fade-in
          const delay = i * 3;
          const wordOpacity = interpolate(frame, [delay, delay + 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const wordTranslate = interpolate(frame, [delay, delay + 8], [15, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          return (
            <span
              key={i}
              style={{
                fontSize: 64,
                fontFamily: "'Arial Black', Arial, sans-serif",
                fontWeight: 900,
                color: "#FFFFFF",
                opacity: wordOpacity,
                transform: `translateY(${wordTranslate}px)`,
                textShadow: "0 2px 8px rgba(0,0,0,0.5)",
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
