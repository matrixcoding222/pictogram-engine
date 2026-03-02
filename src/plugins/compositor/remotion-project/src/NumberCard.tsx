import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

interface NumberCardProps {
  number: number;
  topicName: string;
  backgroundColor: string;
  numberColor: string;
  glowColor: string;
}

/**
 * Whiteboard-style number card.
 * Big number + topic name on a clean white background.
 * Looks like someone wrote the number on a whiteboard with a marker.
 */
export const NumberCard: React.FC<NumberCardProps> = ({
  number,
  topicName,
  backgroundColor,
  numberColor,
  glowColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Number bounces in
  const numberSpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.6 },
  });

  // Topic name slides up
  const nameOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const nameTranslate = interpolate(frame, [15, 30], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Subtle underline draws in
  const lineWidth = interpolate(frame, [20, 40], [0, 400], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
        backgroundColor, // white
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: exitOpacity,
      }}
    >
      {/* Number */}
      <div
        style={{
          fontSize: 260,
          fontFamily: "'Arial Black', 'Impact', Arial, sans-serif",
          fontWeight: 900,
          color: numberColor, // dark
          transform: `scale(${numberSpring})`,
          lineHeight: 1,
        }}
      >
        #{number}
      </div>

      {/* Accent underline */}
      <div
        style={{
          width: lineWidth,
          height: 6,
          backgroundColor: glowColor, // accent orange
          borderRadius: 3,
          marginTop: 8,
          marginBottom: 16,
        }}
      />

      {/* Topic name */}
      <div
        style={{
          fontSize: 48,
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          color: "#444444",
          opacity: nameOpacity,
          transform: `translateY(${nameTranslate}px)`,
          textAlign: "center",
          maxWidth: 1400,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {topicName}
      </div>
    </div>
  );
};
