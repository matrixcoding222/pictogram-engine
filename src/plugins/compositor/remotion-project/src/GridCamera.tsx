import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { MasterGrid, getCellCenter } from "./MasterGrid";
import type { GridCellRenderData } from "./types";

interface GridCameraProps {
  cells: GridCellRenderData[];
  columns: number;
  backgroundColor: string;
  cellBorderColor: string;
  cellHighlightColor: string;
  mode: "overview" | "zoom_to_cell" | "pull_back";
  targetCellIndex?: number;
  completedCells?: number[];
}

export const GridCamera: React.FC<GridCameraProps> = ({
  cells,
  columns,
  backgroundColor,
  cellBorderColor,
  cellHighlightColor,
  mode,
  targetCellIndex = 0,
  completedCells = [],
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  if (mode === "zoom_to_cell" && targetCellIndex >= 0 && targetCellIndex < cells.length) {
    const cellCenter = getCellCenter(targetCellIndex, cells.length, columns);
    const canvasCenterX = 1920 / 2;
    const canvasCenterY = 1080 / 2;
    const targetTranslateX = canvasCenterX - cellCenter.x;
    const targetTranslateY = canvasCenterY - cellCenter.y;
    const targetScale = 3.2;

    // Spring-based zoom starting at frame 10
    const zoomProgress = spring({
      frame: frame - 10,
      fps,
      config: { damping: 14, stiffness: 80, mass: 1.0 },
    });

    scale = interpolate(zoomProgress, [0, 1], [1, targetScale]);
    translateX = interpolate(zoomProgress, [0, 1], [0, targetTranslateX]);
    translateY = interpolate(zoomProgress, [0, 1], [0, targetTranslateY]);
  }

  if (mode === "pull_back" && targetCellIndex >= 0 && targetCellIndex < cells.length) {
    const cellCenter = getCellCenter(targetCellIndex, cells.length, columns);
    const canvasCenterX = 1920 / 2;
    const canvasCenterY = 1080 / 2;
    const zoomedTranslateX = canvasCenterX - cellCenter.x;
    const zoomedTranslateY = canvasCenterY - cellCenter.y;
    const zoomedScale = 3.2;

    // Reverse: start zoomed in, pull back to overview
    const pullProgress = spring({
      frame,
      fps,
      config: { damping: 14, stiffness: 60, mass: 1.2 },
    });

    scale = interpolate(pullProgress, [0, 1], [zoomedScale, 1]);
    translateX = interpolate(pullProgress, [0, 1], [zoomedTranslateX, 0]);
    translateY = interpolate(pullProgress, [0, 1], [zoomedTranslateY, 0]);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1920,
        height: 1080,
        overflow: "hidden",
        backgroundColor,
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `translate(${translateX}px, ${translateY}px) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <MasterGrid
          cells={cells}
          columns={columns}
          backgroundColor={backgroundColor}
          cellBorderColor={cellBorderColor}
          cellHighlightColor={cellHighlightColor}
          completedCells={completedCells}
          highlightedCell={mode === "zoom_to_cell" ? targetCellIndex : undefined}
        />
      </div>
    </div>
  );
};
