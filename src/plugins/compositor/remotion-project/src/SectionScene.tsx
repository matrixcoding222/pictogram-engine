import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from "remotion";
import { TextCard } from "./TextCard";
import type { CameraTypeV2 } from "./types";

interface SectionSceneProps {
  sceneType: string;
  camera: CameraTypeV2;
  imageSrc: string;
  textCardContent?: string;
}

/**
 * Whiteboard-style section scene.
 *
 * Images are NEVER full-screen. They appear as framed cards on a white
 * canvas — like illustrations pinned to a whiteboard. The white background
 * is always visible around the image.
 *
 * Camera movements are subtle shifts/zooms on the card, not cinematic pans.
 */

/** Get subtle card animation based on camera type */
function getCardAnimation(
  camera: CameraTypeV2,
  progress: number,
): { scale: number; translateX: number; translateY: number; rotate: number } {
  switch (camera) {
    case "zoom_in":
      return {
        scale: interpolate(progress, [0, 1], [1.0, 1.04]),
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [0, -8]),
        rotate: 0,
      };
    case "zoom_in_dramatic":
      return {
        scale: interpolate(progress, [0, 1], [0.95, 1.08]),
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [5, -12]),
        rotate: 0,
      };
    case "zoom_out":
      return {
        scale: interpolate(progress, [0, 1], [1.06, 1.0]),
        translateX: 0,
        translateY: 0,
        rotate: 0,
      };
    case "pan_left":
      return {
        scale: 1.02,
        translateX: interpolate(progress, [0, 1], [20, -20]),
        translateY: 0,
        rotate: interpolate(progress, [0, 1], [0.3, -0.3]),
      };
    case "pan_right":
      return {
        scale: 1.02,
        translateX: interpolate(progress, [0, 1], [-20, 20]),
        translateY: 0,
        rotate: interpolate(progress, [0, 1], [-0.3, 0.3]),
      };
    case "pan_up":
      return {
        scale: 1.02,
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [15, -15]),
        rotate: 0,
      };
    case "pan_down":
      return {
        scale: 1.02,
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [-15, 15]),
        rotate: 0,
      };
    case "pan_and_zoom":
      return {
        scale: interpolate(progress, [0, 1], [1.0, 1.05]),
        translateX: interpolate(progress, [0, 1], [-12, 12]),
        translateY: interpolate(progress, [0, 1], [8, -8]),
        rotate: 0,
      };
    case "static":
    default:
      return { scale: 1.0, translateX: 0, translateY: 0, rotate: 0 };
  }
}

export const SectionScene: React.FC<SectionSceneProps> = ({
  sceneType,
  camera,
  imageSrc,
  textCardContent,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Text card type — render text overlay on white
  if (sceneType === "text_card" && textCardContent) {
    return <TextCard content={textCardContent} />;
  }

  const progress = durationInFrames > 1 ? frame / (durationInFrames - 1) : 0;
  const { scale, translateX, translateY, rotate } = getCardAnimation(camera, progress);

  // Card entrance: spring pop-in
  const entranceSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 120, mass: 0.8 },
  });

  // Exit fade
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // Shadow grows slightly over time for depth
  const shadowBlur = interpolate(progress, [0, 1], [20, 28]);
  const shadowOpacity = interpolate(progress, [0, 1], [0.15, 0.22]);

  // Card dimensions — image takes up ~60% of the screen, never full bleed
  // Diagrams are wider, illustrations are standard
  const isDiagram = sceneType === "diagram";
  const cardWidth = isDiagram ? 1300 : 1050;
  const cardHeight = isDiagram ? 730 : 620;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFFFF",
        opacity: fadeOut,
      }}
    >
      {/* Centered image card */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: cardWidth,
          height: cardHeight,
          marginLeft: -cardWidth / 2,
          marginTop: -cardHeight / 2,
          transform: `scale(${entranceSpring * scale}) translate(${translateX}px, ${translateY}px) rotate(${rotate}deg)`,
          transformOrigin: "center center",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: `0 ${shadowBlur / 2}px ${shadowBlur}px rgba(0, 0, 0, ${shadowOpacity})`,
          border: "3px solid #e0e0e0",
        }}
      >
        {imageSrc ? (
          <Img
            src={staticFile(imageSrc)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          // Missing image: light gray placeholder
          <div
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#999",
              fontSize: 28,
              fontFamily: "Arial, sans-serif",
            }}
          >
            ◻
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};
