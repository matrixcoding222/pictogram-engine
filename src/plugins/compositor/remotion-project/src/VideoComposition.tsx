import React from "react";
import { Sequence, useCurrentFrame, interpolate, AbsoluteFill } from "remotion";
import { Scene } from "./Scene";
import { GridCamera } from "./GridCamera";
import { NumberCard } from "./NumberCard";
import { SectionScene } from "./SectionScene";
import { CaptionTrack } from "./CaptionTrack";
import type { VideoData, VideoDataV2, SceneData, SegmentRenderData } from "./types";

const TRANSITION_FRAMES = 15; // 0.5 seconds crossfade at 30fps

// ═══════════════════════════════════════════════════════════════════
// V1 Composition (preserved for backward compatibility)
// ═══════════════════════════════════════════════════════════════════

const SceneWithTransition: React.FC<{
  scene: SceneData;
  isFirst: boolean;
  isLast: boolean;
}> = ({ scene, isFirst, isLast }) => {
  const frame = useCurrentFrame();
  const total = scene.durationInFrames;

  const fadeIn = !isFirst
    ? interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

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
  const startFrames: number[] = [];
  let currentStart = 0;

  for (let i = 0; i < scenes.length; i++) {
    startFrames.push(currentStart);
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

/** Calculate total frames accounting for crossfade overlaps (v1) */
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

// ═══════════════════════════════════════════════════════════════════
// V2 Composition — Segment-Based Dispatch
// ═══════════════════════════════════════════════════════════════════

const V2_TRANSITION_FRAMES = 8;

/**
 * Renders a single segment based on its type.
 */
const SegmentRenderer: React.FC<{
  segment: SegmentRenderData;
  videoData: VideoDataV2;
}> = ({ segment, videoData }) => {
  const frame = useCurrentFrame();

  switch (segment.type) {
    case "hook":
    case "outro": {
      // Narrated scenes with Ken Burns camera
      const scenes = segment.scenes || [];
      // Pre-compute start frames for each scene
      const sceneOffsets: number[] = [];
      let accum = 0;
      for (const s of scenes) {
        sceneOffsets.push(accum);
        accum += s.durationInFrames;
      }
      return (
        <AbsoluteFill>
          {scenes.map((scene, i) => (
            <Sequence
              key={i}
              from={sceneOffsets[i]}
              durationInFrames={scene.durationInFrames}
            >
              <SectionScene
                sceneType={scene.sceneType}
                camera={scene.camera}
                imageSrc={scene.imageSrc}
                textCardContent={scene.textCardContent}
              />
            </Sequence>
          ))}
        </AbsoluteFill>
      );
    }

    case "overview":
      return (
        <GridCamera
          cells={videoData.gridCells}
          columns={videoData.gridConfig.columns}
          backgroundColor={videoData.gridConfig.backgroundColor}
          cellBorderColor={videoData.gridConfig.cellBorderColor}
          cellHighlightColor={videoData.gridConfig.cellHighlightColor}
          mode="overview"
          completedCells={[]}
        />
      );

    case "zoom_to_cell":
      return (
        <GridCamera
          cells={videoData.gridCells}
          columns={videoData.gridConfig.columns}
          backgroundColor={videoData.gridConfig.backgroundColor}
          cellBorderColor={videoData.gridConfig.cellBorderColor}
          cellHighlightColor={videoData.gridConfig.cellHighlightColor}
          mode="zoom_to_cell"
          targetCellIndex={segment.topicIndex}
          completedCells={segment.completedCells}
        />
      );

    case "number_card":
      return (
        <NumberCard
          number={segment.numberCardNumber ?? 1}
          topicName={segment.topicName ?? ""}
          backgroundColor={videoData.numberCardConfig.backgroundColor}
          numberColor={videoData.numberCardConfig.numberColor}
          glowColor={videoData.numberCardConfig.glowColor}
        />
      );

    case "section": {
      const scenes = segment.scenes || [];
      const offsets: number[] = [];
      let acc = 0;
      for (const s of scenes) {
        offsets.push(acc);
        acc += s.durationInFrames;
      }
      return (
        <AbsoluteFill>
          {scenes.map((scene, i) => (
            <Sequence
              key={i}
              from={offsets[i]}
              durationInFrames={scene.durationInFrames}
            >
              <SectionScene
                sceneType={scene.sceneType}
                camera={scene.camera}
                imageSrc={scene.imageSrc}
                textCardContent={scene.textCardContent}
              />
            </Sequence>
          ))}
        </AbsoluteFill>
      );
    }

    case "pull_back":
      return (
        <GridCamera
          cells={videoData.gridCells}
          columns={videoData.gridConfig.columns}
          backgroundColor={videoData.gridConfig.backgroundColor}
          cellBorderColor={videoData.gridConfig.cellBorderColor}
          cellHighlightColor={videoData.gridConfig.cellHighlightColor}
          mode="pull_back"
          targetCellIndex={segment.topicIndex}
          completedCells={segment.completedCells}
        />
      );

    default:
      return <AbsoluteFill style={{ backgroundColor: "#000" }} />;
  }
};

export const VideoCompositionV2: React.FC<VideoDataV2> = (props) => {
  const { segments, wordTimestamps, captions, fps } = props;

  // Total duration from segments
  const totalFrames = segments.length > 0
    ? segments[segments.length - 1].startFrame + segments[segments.length - 1].durationInFrames
    : 900;

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0a" }}>
      {/* Segment layers */}
      {segments.map((segment, i) => (
        <Sequence
          key={`seg-${i}`}
          from={segment.startFrame}
          durationInFrames={segment.durationInFrames}
        >
          <SegmentRenderer segment={segment} videoData={props} />
        </Sequence>
      ))}

      {/* Caption track — persistent overlay on top of everything */}
      <CaptionTrack
        wordTimestamps={wordTimestamps}
        config={captions}
      />
    </AbsoluteFill>
  );
};

/** Calculate total frames from v2 segments. */
export function calculateTotalFramesV2(segments: SegmentRenderData[]): number {
  if (segments.length === 0) return 900;
  const last = segments[segments.length - 1];
  return last.startFrame + last.durationInFrames;
}
