import React from "react";
import { useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";

interface NumberCardProps {
  number: number;
  topicName: string;
  backgroundColor: string;
  numberColor: string;
  glowColor: string;
}

export const NumberCard: React.FC<NumberCardProps> = ({
  number,
  topicName,
  backgroundColor,
  numberColor,
  glowColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Number bounces in with spring
  const numberSpring = spring({
    frame,
    fps,
    config: { damping: 8, stiffness: 200, mass: 0.6 },
  });

  // Topic name fades in slightly later
  const nameOpacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const nameTranslate = interpolate(frame, [15, 30], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Glow pulse
  const glowIntensity = interpolate(
    frame,
    [0, 20, 40, durationInFrames],
    [0, 40, 25, 25],
    { extrapolateRight: "clamp" },
  );

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
        backgroundColor,
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
          fontSize: 280,
          fontFamily: "'Arial Black', 'Impact', Arial, sans-serif",
          fontWeight: 900,
          color: numberColor,
          transform: `scale(${numberSpring})`,
          textShadow: `0 0 ${glowIntensity}px ${glowColor}, 0 0 ${glowIntensity * 2}px ${glowColor}`,
          lineHeight: 1,
        }}
      >
        #{number}
      </div>

      {/* Topic name */}
      <div
        style={{
          fontSize: 52,
          fontFamily: "'Arial Black', Arial, sans-serif",
          fontWeight: 900,
          color: numberColor,
          opacity: nameOpacity,
          transform: `translateY(${nameTranslate}px)`,
          marginTop: 20,
          textAlign: "center",
          maxWidth: 1400,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {topicName}
      </div>
    </div>
  );
};
