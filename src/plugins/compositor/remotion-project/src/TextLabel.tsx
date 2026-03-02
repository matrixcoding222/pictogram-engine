import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate } from "remotion";

interface TextLabelProps {
  text: string;
  xPercent: number;
  yPercent: number;
  size: "small" | "medium" | "large";
  color?: string;
  entranceDelayFrames?: number;
}

const sizeMap: Record<string, number> = {
  small: 40,
  medium: 54,
  large: 72,
};

const colorMap: Record<string, string> = {
  red: "#E63946",
  blue: "#1565C0",
  green: "#2E7D32",
  black: "#1a1a1a",
  orange: "#E65100",
  purple: "#6A1B9A",
};

export const TextLabel: React.FC<TextLabelProps> = ({
  text,
  xPercent,
  yPercent,
  size,
  color = "black",
  entranceDelayFrames = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Adjusted frame for staggered entrance
  const adjustedFrame = Math.max(0, frame - entranceDelayFrames);

  // Spring pop-in: scale from 0 -> overshoot -> settle at 1
  const springVal = spring({
    frame: adjustedFrame - 3,
    fps,
    config: {
      damping: 10,
      stiffness: 180,
      mass: 0.6,
    },
  });

  // Exit animation: fade + shrink in last 12 frames
  const exitStart = durationInFrames - 12;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitScale = interpolate(frame, [exitStart, durationInFrames], [1, 0.85], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const finalScale = springVal * exitScale;
  const finalOpacity = (adjustedFrame > 0 ? 1 : 0) * exitOpacity;

  const fontSize = sizeMap[size] || sizeMap.medium;
  const resolvedColor = colorMap[color] || colorMap.black;

  return (
    <div
      style={{
        position: "absolute",
        left: `${xPercent}%`,
        top: `${yPercent}%`,
        transform: `translate(-50%, -50%) scale(${finalScale})`,
        opacity: finalOpacity,
        color: resolvedColor,
        fontSize,
        fontFamily: "'Arial Black', 'Impact', Arial, sans-serif",
        fontWeight: 900,
        textTransform: "uppercase",
        letterSpacing: 3,
        textAlign: "center",
        lineHeight: 1.1,
        whiteSpace: "pre-wrap",
        maxWidth: "80%",
        WebkitTextStroke: `2px ${resolvedColor}`,
        paintOrder: "stroke fill",
      }}
    >
      {text}
    </div>
  );
};
