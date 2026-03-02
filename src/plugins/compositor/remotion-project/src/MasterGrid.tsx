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

// Grid layout constants (1920x1080 canvas) — whiteboard style
const CELL_WIDTH = 500;
const CELL_HEIGHT = 330;
const CELL_GAP = 36;
const IMAGE_HEIGHT = 250;
const LABEL_HEIGHT = 60;
const BADGE_SIZE = 44;

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
        backgroundColor, // white from config
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
        const borderSize = isHighlighted ? 5 : 3;
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
            {/* Card shadow + image container */}
            <div
              style={{
                width: CELL_WIDTH,
                height: IMAGE_HEIGHT,
                border: `${borderSize}px solid ${borderColor}`,
                borderRadius: 14,
                overflow: "hidden",
                backgroundColor: "#f8f8f8",
                position: "relative",
                boxShadow: isHighlighted
                  ? `0 6px 20px rgba(0,0,0,0.15)`
                  : `0 3px 12px rgba(0,0,0,0.08)`,
              }}
            >
              {cell.imageSrc ? (
                <Img
                  src={staticFile(cell.imageSrc)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    filter: isCompleted ? "brightness(0.7) saturate(0.5)" : "none",
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
                    color: "#999",
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
                  top: 10,
                  left: 10,
                  width: BADGE_SIZE,
                  height: BADGE_SIZE,
                  borderRadius: "50%",
                  backgroundColor: isCompleted ? "#4CAF50" : "#FFFFFF",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "'Arial Black', Arial, sans-serif",
                  fontWeight: 900,
                  fontSize: 20,
                  color: isCompleted ? "#FFFFFF" : "#333333",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                  border: isCompleted ? "none" : "2px solid #e0e0e0",
                }}
              >
                {isCompleted ? "✓" : number}
              </div>
            </div>

            {/* Label — dark text on white canvas */}
            <div
              style={{
                width: CELL_WIDTH,
                height: LABEL_HEIGHT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Arial Black', 'Impact', Arial, sans-serif",
                fontWeight: 900,
                fontSize: 22,
                color: isHighlighted ? cellHighlightColor : "#222222",
                textAlign: "center",
                letterSpacing: 0.5,
                lineHeight: 1.1,
                padding: "4px 8px",
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
