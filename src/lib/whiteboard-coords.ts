import type { VirtualPoint } from "@/types/whiteboard";

export const WHITEBOARD_WIDTH = 1200;
export const WHITEBOARD_HEIGHT = 800;

export interface ElementRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Clamps a virtual whiteboard coordinate to `[0, 1200] x [0, 800]`.
 */
export function clampVirtualPoint(point: VirtualPoint): VirtualPoint {
  return {
    x: Math.max(0, Math.min(WHITEBOARD_WIDTH, point.x)),
    y: Math.max(0, Math.min(WHITEBOARD_HEIGHT, point.y)),
  };
}

/**
 * Maps a DOM pointer `(clientX, clientY)` inside a rendered whiteboard element
 * into the fixed `1200 x 800` virtual coordinate space.
 */
export function clientPointToVirtual(
  clientX: number,
  clientY: number,
  rect: ElementRectLike
): VirtualPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  return clampVirtualPoint({
    x: Math.round(nx * WHITEBOARD_WIDTH * 100) / 100,
    y: Math.round(ny * WHITEBOARD_HEIGHT * 100) / 100,
  });
}

/**
 * Inverse mapping from `1200 x 800` virtual coordinates back to CSS percentages
 * (or pixel coordinates inside a given `rect`).
 */
export function virtualPointToClient(
  point: VirtualPoint,
  rect: ElementRectLike
): { clientX: number; clientY: number } {
  const clamped = clampVirtualPoint(point);
  return {
    clientX: rect.left + (clamped.x / WHITEBOARD_WIDTH) * rect.width,
    clientY: rect.top + (clamped.y / WHITEBOARD_HEIGHT) * rect.height,
  };
}
