import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Img, staticFile } from "remotion";
import { TextCard } from "./TextCard";
import type { CameraTypeV2 } from "./types";

interface SectionSceneProps {
  sceneType: string;
  camera: CameraTypeV2;
  imageSrc: string;
  textCardContent?: string;
}

/**
 * Ken Burns camera definitions.
 * Images are rendered 1.2x larger than viewport for pan headroom.
 * Each camera type maps to a CSS transform animation.
 */
function getCameraTransform(
  camera: CameraTypeV2,
  progress: number, // 0..1 through the scene
): { scale: number; translateX: number; translateY: number } {
  // Base scale: image is 1.2x viewport, so default scale = 1 shows 1.2x
  // We scale between ~0.85 (showing most of image) and 1.0 (showing viewport)
  switch (camera) {
    case "zoom_in":
      return {
        scale: interpolate(progress, [0, 1], [0.88, 1.0]),
        translateX: 0,
        translateY: 0,
      };
    case "zoom_in_dramatic":
      return {
        scale: interpolate(progress, [0, 1], [0.83, 1.05]),
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [0, -20]),
      };
    case "zoom_out":
      return {
        scale: interpolate(progress, [0, 1], [1.0, 0.88]),
        translateX: 0,
        translateY: 0,
      };
    case "pan_left":
      return {
        scale: 0.92,
        translateX: interpolate(progress, [0, 1], [60, -60]),
        translateY: 0,
      };
    case "pan_right":
      return {
        scale: 0.92,
        translateX: interpolate(progress, [0, 1], [-60, 60]),
        translateY: 0,
      };
    case "pan_up":
      return {
        scale: 0.92,
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [40, -40]),
      };
    case "pan_down":
      return {
        scale: 0.92,
        translateX: 0,
        translateY: interpolate(progress, [0, 1], [-40, 40]),
      };
    case "pan_and_zoom":
      return {
        scale: interpolate(progress, [0, 1], [0.88, 1.0]),
        translateX: interpolate(progress, [0, 1], [-40, 40]),
        translateY: interpolate(progress, [0, 1], [20, -20]),
      };
    case "static":
    default:
      return { scale: 0.92, translateX: 0, translateY: 0 };
  }
}

export const SectionScene: React.FC<SectionSceneProps> = ({
  sceneType,
  camera,
  imageSrc,
  textCardContent,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Text card type — render text overlay
  if (sceneType === "text_card" && textCardContent) {
    return <TextCard content={textCardContent} />;
  }

  // Image-based scene types
  const progress = durationInFrames > 1
    ? frame / (durationInFrames - 1)
    : 0;
  const { scale, translateX, translateY } = getCameraTransform(camera, progress);

  // Entrance fade
  const fadeIn = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Exit fade
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 10, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a", opacity }}>
      {imageSrc ? (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <Img
            src={staticFile(imageSrc)}
            style={{
              // 1.2x larger than viewport for Ken Burns headroom
              width: "120%",
              height: "120%",
              objectFit: "cover",
              transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
              transformOrigin: "center center",
            }}
          />
        </div>
      ) : (
        // Fallback: dark background for missing images
        <div
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "#0d1117",
          }}
        />
      )}
    </AbsoluteFill>
  );
};
