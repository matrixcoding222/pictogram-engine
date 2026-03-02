import React from "react";
import { Sequence, useCurrentFrame, interpolate, AbsoluteFill } from "remotion";
import { Scene } from "./Scene";
import type { VideoData, SceneData } from "./types";

const TRANSITION_FRAMES = 15; // 0.5 seconds crossfade at 30fps

const SceneWithTransition: React.FC<{
  scene: SceneData;
  isFirst: boolean;
  isLast: boolean;
}> = ({ scene, isFirst, isLast }) => {
  const frame = useCurrentFrame();
  const total = scene.durationInFrames;

  // Fade in (skip for first scene)
  const fadeIn = !isFirst
    ? interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  // Fade out (skip for last scene)
  const fadeOut = !isLast
    ? interpolate(frame, [total - TRANSITION_FRAMES, total], [1, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  const opacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ opacity }}>
      <Scene {...scene} />
    </AbsoluteFill>
  );
};

export const VideoComposition: React.FC<VideoData> = ({ scenes }) => {
  // Calculate start frames with overlap for crossfade transitions
  const startFrames: number[] = [];
  let currentStart = 0;

  for (let i = 0; i < scenes.length; i++) {
    startFrames.push(currentStart);
    // Overlap with next scene by TRANSITION_FRAMES
    const overlap = i < scenes.length - 1 ? TRANSITION_FRAMES : 0;
    currentStart += scenes[i].durationInFrames - overlap;
  }

  return (
    <>
      {scenes.map((scene, i) => (
        <Sequence
          key={`scene-${i}`}
          from={startFrames[i]}
          durationInFrames={scene.durationInFrames}
        >
          <SceneWithTransition
            scene={scene}
            isFirst={i === 0}
            isLast={i === scenes.length - 1}
          />
        </Sequence>
      ))}
    </>
  );
};

/** Calculate total frames accounting for crossfade overlaps */
export function calculateTotalFrames(scenes: SceneData[]): number {
  if (scenes.length === 0) return 900;
  let total = 0;
  for (let i = 0; i < scenes.length; i++) {
    total += scenes[i].durationInFrames;
    if (i < scenes.length - 1) {
      total -= TRANSITION_FRAMES;
    }
  }
  return total || 900;
}
