import { describe, expect, it } from "vitest";
import {
  WHITEBOARD_HEIGHT,
  WHITEBOARD_WIDTH,
  clientPointToVirtual,
  virtualPointToClient,
} from "@/lib/whiteboard-coords";

describe("whiteboard-coords 1200x800 mapping", () => {
  it("round-trips pointer coordinates accurately across scaled viewports", () => {
    const rect = { left: 120, top: 80, width: 900, height: 600 };
    const virtual = clientPointToVirtual(570, 380, rect);
    expect(virtual).toEqual({ x: 600, y: 400 });

    const back = virtualPointToClient(virtual, rect);
    expect(back).toEqual({ clientX: 570, clientY: 380 });
  });

  it("clamps out-of-bounds pointer coordinates to [0, 1200] x [0, 800]", () => {
    const rect = { left: 50, top: 40, width: 600, height: 400 };
    expect(clientPointToVirtual(10, 10, rect)).toEqual({ x: 0, y: 0 });
    expect(clientPointToVirtual(999, 999, rect)).toEqual({
      x: WHITEBOARD_WIDTH,
      y: WHITEBOARD_HEIGHT,
    });
  });
});
