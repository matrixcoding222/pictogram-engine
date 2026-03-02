import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";

interface PictogramOverlayProps {
  src: string;
  svgContent?: string;
  xPercent: number;
  yPercent: number;
  scale?: number;
  entranceDelayFrames?: number;
}

/**
 * Injects draw-on animation styles into SVG content.
 * Uses stroke-dasharray/dashoffset to create a "being drawn" effect.
 */
function applyDrawOnAnimation(svg: string, drawProgress: number, fillOpacity: number): string {
  const dashOffset = Math.round(1000 * (1 - drawProgress));

  const styleTag = `<style>
    path, circle, ellipse, line, polyline, polygon {
      stroke-dasharray: 1000 !important;
      stroke-dashoffset: ${dashOffset} !important;
    }
    circle[fill]:not([fill="none"]):not([fill="white"]):not([fill="#FFFFFF"]),
    ellipse[fill]:not([fill="none"]):not([fill="white"]):not([fill="#FFFFFF"]) {
      opacity: ${fillOpacity};
    }
  </style>`;

  return svg.replace(/<svg([^>]*)>/, `<svg$1>${styleTag}`);
}

export const PictogramOverlay: React.FC<PictogramOverlayProps> = ({
  src,
  svgContent,
  xPercent,
  yPercent,
  scale = 1.0,
  entranceDelayFrames = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Adjusted frame accounts for staggered entrance
  const adjustedFrame = Math.max(0, frame - entranceDelayFrames);

  // Entrance: fade in
  const entranceOpacity = interpolate(adjustedFrame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Spring pop-in animation
  const springScale = spring({
    frame: adjustedFrame,
    fps,
    config: {
      damping: 12,
      stiffness: 150,
      mass: 0.8,
    },
  });

  // Slide up from below
  const slideY = interpolate(adjustedFrame, [0, 10], [40, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // SVG draw-on: strokes draw over 30 frames (1 second)
  const drawProgress = interpolate(adjustedFrame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Fills fade in after strokes are mostly drawn
  const fillOpacity = interpolate(adjustedFrame, [22, 32], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
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

  // Combined values
  const finalOpacity = entranceOpacity * exitOpacity;
  const cappedScale = Math.min(scale, 2.0);
  const finalScale = cappedScale * springScale * exitScale;
  const baseSize = 280;

  if (!svgContent && !src) return null;

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    left: `${xPercent}%`,
    top: `${yPercent}%`,
    transform: `translate(-50%, -50%) scale(${finalScale}) translateY(${slideY}px)`,
    width: baseSize,
    height: baseSize,
    opacity: finalOpacity,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // Prefer inline SVG rendering with draw-on animation
  if (svgContent) {
    const animatedSvg = applyDrawOnAnimation(svgContent, drawProgress, fillOpacity);
    return (
      <div
        style={containerStyle}
        dangerouslySetInnerHTML={{ __html: animatedSvg }}
      />
    );
  }

  // Fallback: render as image (for non-SVG files like PNG)
  return (
    <Img
      src={staticFile(src)}
      style={{
        ...containerStyle,
        height: "auto",
      }}
    />
  );
};
