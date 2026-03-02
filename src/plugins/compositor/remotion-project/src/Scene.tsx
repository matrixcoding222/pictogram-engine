import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { ReferenceImage } from "./ReferenceImage";
import { PictogramOverlay } from "./PictogramOverlay";
import { TextLabel } from "./TextLabel";
import { TopicList } from "./TopicList";
import type { SceneData } from "./types";

export const Scene: React.FC<SceneData> = ({
  sceneType,
  imageSrc,
  camera,
  pictograms,
  textLabels,
  topicListData,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const cameraScale = camera === "zoom_in"
    ? interpolate(frame, [0, durationInFrames], [1, 1.05], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      })
    : 1;

  return (
    <AbsoluteFill style={{ backgroundColor: "#FFFFFF" }}>
      <div
        style={{
          width: "100%",
          height: "100%",
          transform: `scale(${cameraScale})`,
          transformOrigin: "center center",
        }}
      >
        {/* Topic list scene */}
        {sceneType === "topic_list" && topicListData && (
          <TopicList
            items={topicListData.items}
            highlightedIndex={topicListData.highlightedIndex}
          />
        )}

        {/* Reference image scene */}
        {sceneType === "reference_image" && imageSrc && (
          <ReferenceImage src={imageSrc} />
        )}

        {/* Pictograms with staggered entrance */}
        {pictograms.map((p, i) => (
          <PictogramOverlay
            key={`pictogram-${i}`}
            src={p.src}
            svgContent={p.svgContent}
            xPercent={p.xPercent}
            yPercent={p.yPercent}
            scale={p.scale}
            entranceDelayFrames={p.entranceDelayFrames ?? i * 10}
          />
        ))}

        {/* Text labels with staggered entrance (after pictograms) */}
        {textLabels.map((t, i) => (
          <TextLabel
            key={`label-${i}`}
            text={t.text}
            xPercent={t.xPercent}
            yPercent={t.yPercent}
            size={t.size}
            color={t.color}
            entranceDelayFrames={t.entranceDelayFrames ?? (pictograms.length * 10 + i * 8)}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
