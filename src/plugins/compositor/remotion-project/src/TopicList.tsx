import React from "react";
import { useCurrentFrame, spring, useVideoConfig, interpolate, Img, staticFile } from "remotion";

interface TopicListProps {
  items: Array<{ name: string; imageSrc: string }>;
  highlightedIndex: number; // -1 = overview (no highlight/zoom), 0+ = zoom into that cell
}

// Grid layout constants (1920x1080 canvas)
const GRID_COLS = 3;
const CELL_WIDTH = 520;
const CELL_HEIGHT = 340;
const CELL_GAP = 30;
const IMAGE_HEIGHT = 260;
const LABEL_HEIGHT = 60;
const BORDER_WIDTH = 4;

// Calculate grid origin (centered on canvas)
function getGridOrigin(itemCount: number): { x: number; y: number } {
  const rows = Math.ceil(itemCount / GRID_COLS);
  const gridWidth = GRID_COLS * CELL_WIDTH + (GRID_COLS - 1) * CELL_GAP;
  const gridHeight = rows * CELL_HEIGHT + (rows - 1) * CELL_GAP;
  return {
    x: (1920 - gridWidth) / 2,
    y: (1080 - gridHeight) / 2,
  };
}

// Get the center position of a specific cell
function getCellCenter(index: number, itemCount: number): { x: number; y: number } {
  const col = index % GRID_COLS;
  const row = Math.floor(index / GRID_COLS);
  const origin = getGridOrigin(itemCount);
  return {
    x: origin.x + col * (CELL_WIDTH + CELL_GAP) + CELL_WIDTH / 2,
    y: origin.y + row * (CELL_HEIGHT + CELL_GAP) + CELL_HEIGHT / 2,
  };
}

export const TopicList: React.FC<TopicListProps> = ({
  items,
  highlightedIndex,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const isOverview = highlightedIndex === -1;

  // Zoom animation for transition scenes
  // Phase 1 (frames 0-45): show grid
  // Phase 2 (frames 45-end): zoom into highlighted cell
  let zoomScale = 1;
  let zoomTranslateX = 0;
  let zoomTranslateY = 0;

  if (!isOverview && highlightedIndex >= 0 && highlightedIndex < items.length) {
    const cellCenter = getCellCenter(highlightedIndex, items.length);
    const canvasCenterX = 1920 / 2;
    const canvasCenterY = 1080 / 2;

    // How much to translate to center the target cell
    const targetTranslateX = canvasCenterX - cellCenter.x;
    const targetTranslateY = canvasCenterY - cellCenter.y;
    const targetScale = 3.2; // zoom enough to fill screen with one cell

    const zoomStart = 50;
    const zoomEnd = Math.min(zoomStart + 40, durationInFrames);

    zoomScale = interpolate(frame, [zoomStart, zoomEnd], [1, targetScale], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    zoomTranslateX = interpolate(frame, [zoomStart, zoomEnd], [0, targetTranslateX * targetScale], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
    zoomTranslateY = interpolate(frame, [zoomStart, zoomEnd], [0, targetTranslateY * targetScale], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  }

  // Exit fade
  const exitStart = durationInFrames - 8;
  const exitOpacity = interpolate(frame, [exitStart, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const origin = getGridOrigin(items.length);
  const rows = Math.ceil(items.length / GRID_COLS);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: 1920,
        height: 1080,
        overflow: "hidden",
        opacity: exitOpacity,
      }}
    >
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: `scale(${zoomScale}) translate(${zoomTranslateX / zoomScale}px, ${zoomTranslateY / zoomScale}px)`,
          transformOrigin: "center center",
        }}
      >
        {items.map((item, i) => {
          const col = i % GRID_COLS;
          const row = Math.floor(i / GRID_COLS);

          // Center the last row if it has fewer than GRID_COLS items
          const itemsInRow = row < rows - 1 ? GRID_COLS : items.length - row * GRID_COLS;
          const rowOffset = row === rows - 1 && itemsInRow < GRID_COLS
            ? ((GRID_COLS - itemsInRow) * (CELL_WIDTH + CELL_GAP)) / 2
            : 0;

          const cellX = origin.x + col * (CELL_WIDTH + CELL_GAP) + rowOffset;
          const cellY = origin.y + row * (CELL_HEIGHT + CELL_GAP);

          // Staggered entrance
          const entranceDelay = 3 + i * 6;
          const cellSpring = spring({
            frame: frame - entranceDelay,
            fps,
            config: { damping: 12, stiffness: 140, mass: 0.8 },
          });

          const isHighlighted = i === highlightedIndex;
          const borderColor = isHighlighted ? "#1565C0" : "#111111";
          const borderSize = isHighlighted ? 6 : BORDER_WIDTH;
          const cellOpacity = (!isOverview && !isHighlighted && highlightedIndex >= 0)
            ? 0.5
            : 1;

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
                opacity: cellSpring * cellOpacity,
                transformOrigin: "center center",
              }}
            >
              {/* Image container */}
              <div
                style={{
                  width: CELL_WIDTH,
                  height: IMAGE_HEIGHT,
                  border: `${borderSize}px solid ${borderColor}`,
                  borderRadius: 4,
                  overflow: "hidden",
                  backgroundColor: "#333",
                }}
              >
                {item.imageSrc ? (
                  <Img
                    src={staticFile(item.imageSrc)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
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
                    {item.name}
                  </div>
                )}
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
                  fontSize: 26,
                  color: isHighlighted ? "#1565C0" : "#1a1a1a",
                  textAlign: "center",
                  letterSpacing: 1,
                  lineHeight: 1.1,
                  padding: "4px 8px",
                }}
              >
                {item.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
