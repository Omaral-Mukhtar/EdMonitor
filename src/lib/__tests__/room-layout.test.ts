import { describe, expect, it } from "vitest";
import {
  getSeatWorldTransform,
  SEAT_LOCAL_OFFSETS,
  SEATED_FORWARD_OFFSET,
  STUDY_TABLES,
} from "@/lib/room-layout";

describe("room-layout seated transforms", () => {
  it("offsets seated avatars forward along each chair facing vector so they clear the backrest", () => {
    const table1 = STUDY_TABLES[0];

    // North seat (rotationY = 0, faces +Z toward table)
    const north = getSeatWorldTransform(table1.id, 0);
    expect(north).not.toBeNull();
    expect(north!.position[0]).toBeCloseTo(
      table1.position[0] + SEAT_LOCAL_OFFSETS[0].localPosition[0],
      3
    );
    expect(north!.position[2]).toBeCloseTo(
      table1.position[2] +
        SEAT_LOCAL_OFFSETS[0].localPosition[2] +
        SEATED_FORWARD_OFFSET,
      3
    );

    // East seat (rotationY = -PI/2, faces -X toward table)
    const east = getSeatWorldTransform(table1.id, 1);
    expect(east).not.toBeNull();
    expect(east!.position[0]).toBeCloseTo(
      table1.position[0] +
        SEAT_LOCAL_OFFSETS[1].localPosition[0] -
        SEATED_FORWARD_OFFSET,
      3
    );
    expect(east!.position[2]).toBeCloseTo(
      table1.position[2] + SEAT_LOCAL_OFFSETS[1].localPosition[2],
      3
    );
  });
});
