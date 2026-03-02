import React from "react";
import { useCurrentFrame, useVideoConfig, spring, Img, staticFile } from "remotion";
import type { GridCellRenderData } from "./types";

interface MasterGridProps {
  cells: GridCellRenderData[];
  columns: number;
  backgroundColor: string;
  cellBorderColor: string;
  cellHighlightColor: string;
  completedCells?: number[];
  highlightedCell?: number;
}

// Grid layout constants (1920x1080 canvas)
const CELL_WIDTH = 520;
const CELL_HEIGHT = 340;
const CELL_GAP = 30;
const IMAGE_HEIGHT = 260;
const LABEL_HEIGHT = 60;
const BADGE_SIZE = 48;

/** Calculate grid origin to center it on the canvas. */
export function getGridOrigin(itemCount: number, columns: number): { x: number; y: number } {
  const rows = Math.ceil(itemCount / columns);
  const gridWidth = columns * CELL_WIDTH + (columns - 1) * CELL_GAP;
  const gridHeight = rows * CELL_HEIGHT + (rows - 1) * CELL_GAP;
  return {
    x: (1920 - gridWidth) / 2,
    y: (1080 - gridHeight) / 2,
  };
}

/** Get the center position of a specific cell. */
export function getCellCenter(
  index: number,
  itemCount: number,
  columns: number,
): { x: number; y: number } {
  const col = index % columns;
  const row = Math.floor(index / columns);
  const origin = getGridOrigin(itemCount, columns);
  return {
    x: origin.x + col * (CELL_WIDTH + CELL_GAP) + CELL_WIDTH / 2,
    y: origin.y + row * (CELL_HEIGHT + CELL_GAP) + CELL_HEIGHT / 2,
  };
}

export const MasterGrid: React.FC<MasterGridProps> = ({
  cells,
  columns,
  backgroundColor,
  cellBorderColor,
  cellHighlightColor,
  completedCells = [],
  highlightedCell,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const origin = getGridOrigin(cells.length, columns);
  const rows = Math.ceil(cells.length / columns);
  const completedSet = new Set(completedCells);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1920,
        height: 1080,
        backgroundColor,
      }}
    >
      {cells.map((cell, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);

        // Center the last row if incomplete
        const itemsInRow = row < rows - 1 ? columns : cells.length - row * columns;
        const rowOffset =
          row === rows - 1 && itemsInRow < columns
            ? ((columns - itemsInRow) * (CELL_WIDTH + CELL_GAP)) / 2
            : 0;

        const cellX = origin.x + col * (CELL_WIDTH + CELL_GAP) + rowOffset;
        const cellY = origin.y + row * (CELL_HEIGHT + CELL_GAP);

        // Staggered spring entrance
        const entranceDelay = 3 + i * 6;
        const cellSpring = spring({
          frame: frame - entranceDelay,
          fps,
          config: { damping: 12, stiffness: 140, mass: 0.8 },
        });

        const isCompleted = completedSet.has(i);
        const isHighlighted = i === highlightedCell;
        const borderColor = isHighlighted ? cellHighlightColor : cellBorderColor;
        const borderSize = isHighlighted ? 6 : 4;
        // Countdown number: total - index
        const number = cells.length - i;

        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cellX,
              top: cellY,
              width: CELL_WIDTH,
              height: CELL_HEIGHT,
              transform: `scale(${cellSpring})`,
              opacity: cellSpring,
              transformOrigin: "center center",
            }}
          >
            {/* Image container */}
            <div
              style={{
                width: CELL_WIDTH,
                height: IMAGE_HEIGHT,
                border: `${borderSize}px solid ${borderColor}`,
                borderRadius: 8,
                overflow: "hidden",
                backgroundColor: "#1a1a1a",
                position: "relative",
              }}
            >
              {cell.imageSrc ? (
                <Img
                  src={staticFile(cell.imageSrc)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: isCompleted ? "brightness(0.6) saturate(0.7)" : "none",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#666",
                    fontSize: 20,
                    fontFamily: "Arial, sans-serif",
                  }}
                >
                  {cell.topicName}
                </div>
              )}

              {/* Number badge (top-left) */}
              <div
                style={{
                  position: "absolute",
                  top: 8,
                  left: 8,
                  width: BADGE_SIZE,
                  height: BADGE_SIZE,
                  borderRadius: "50%",
                  backgroundColor: isCompleted ? "#4CAF50" : "rgba(0,0,0,0.7)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Arial Black', Arial, sans-serif",
                  fontWeight: 900,
                  fontSize: isCompleted ? 22 : 24,
                  color: "#FFFFFF",
                  border: `2px solid ${isCompleted ? "#66BB6A" : "rgba(255,255,255,0.3)"}`,
                }}
              >
                {isCompleted ? "✓" : number}
              </div>
            </div>

            {/* Label */}
            <div
              style={{
                width: CELL_WIDTH,
                height: LABEL_HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Arial Black', 'Impact', Arial, sans-serif",
                fontWeight: 900,
                fontSize: 24,
                color: isHighlighted ? cellHighlightColor : "#FFFFFF",
                textAlign: "center",
                letterSpacing: 1,
                lineHeight: 1.1,
                padding: "4px 8px",
                textShadow: "0 2px 4px rgba(0,0,0,0.5)",
              }}
            >
              {cell.topicName}
            </div>
          </div>
        );
      })}
    </div>
  );
};
