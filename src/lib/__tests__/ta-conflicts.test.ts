import { describe, expect, it } from "vitest";
import {
  buildConflictBreakdown,
  findAvailableSlotSuggestions,
  rangesOverlap,
  validateStudyHoursRange,
  type ScheduledBookingSlot,
} from "@/lib/ta-conflicts";
import type { TaRoom } from "@/types/ta-schedule";

const ROOMS: TaRoom[] = [
  { id: "room-1", code: "DISC-104", label: "Discussion Room 104", capacity: 45 },
  { id: "room-2", code: "LAB-B201", label: "STEM Studio B201", capacity: 45 },
  { id: "room-3", code: "SEM-302", label: "Seminar Room 302", capacity: 42 },
];

describe("rangesOverlap (half-open [))", () => {
  it("treats back-to-back [10:00, 11:00) and [11:00, 12:00) as non-overlapping", () => {
    const aStart = Date.parse("2026-11-26T10:00:00.000Z");
    const aEnd = Date.parse("2026-11-26T11:00:00.000Z");
    const bStart = Date.parse("2026-11-26T11:00:00.000Z");
    const bEnd = Date.parse("2026-11-26T12:00:00.000Z");

    expect(rangesOverlap(aStart, aEnd, bStart, bEnd)).toBe(false);
    expect(rangesOverlap(bStart, bEnd, aStart, aEnd)).toBe(false);
  });

  it("detects overlapping intervals [14:00, 15:00) and [14:30, 15:30)", () => {
    const aStart = Date.parse("2026-11-26T14:00:00.000Z");
    const aEnd = Date.parse("2026-11-26T15:00:00.000Z");
    const bStart = Date.parse("2026-11-26T14:30:00.000Z");
    const bEnd = Date.parse("2026-11-26T15:30:00.000Z");

    expect(rangesOverlap(aStart, aEnd, bStart, bEnd)).toBe(true);
  });
});

describe("validateStudyHoursRange (CAMPUS_TZ 08:00–20:00)", () => {
  it("rejects endsAt <= startsAt", () => {
    const res = validateStudyHoursRange(
      "2026-11-26T14:00:00.000Z",
      "2026-11-26T14:00:00.000Z",
      "UTC"
    );
    expect(res.ok).toBe(false);
  });

  it("enforces 08:00–20:00 in UTC", () => {
    expect(
      validateStudyHoursRange(
        "2026-11-26T07:30:00.000Z",
        "2026-11-26T08:30:00.000Z",
        "UTC"
      ).ok
    ).toBe(false);

    expect(
      validateStudyHoursRange(
        "2026-11-26T19:00:00.000Z",
        "2026-11-26T20:00:00.000Z",
        "UTC"
      ).ok
    ).toBe(true);

    expect(
      validateStudyHoursRange(
        "2026-11-26T19:30:00.000Z",
        "2026-11-26T20:30:00.000Z",
        "UTC"
      ).ok
    ).toBe(false);
  });

  it("enforces 08:00–20:00 in non-UTC CAMPUS_TZ (Africa/Cairo UTC+2)", () => {
    // 06:00Z..07:00Z = 08:00..09:00 Africa/Cairo -> valid
    expect(
      validateStudyHoursRange(
        "2026-11-26T06:00:00.000Z",
        "2026-11-26T07:00:00.000Z",
        "Africa/Cairo"
      ).ok
    ).toBe(true);

    // 05:30Z..06:30Z = 07:30..08:30 Africa/Cairo -> invalid (starts before 08:00 local)
    expect(
      validateStudyHoursRange(
        "2026-11-26T05:30:00.000Z",
        "2026-11-26T06:30:00.000Z",
        "Africa/Cairo"
      ).ok
    ).toBe(false);

    // 17:00Z..18:00Z = 19:00..20:00 Africa/Cairo -> valid
    expect(
      validateStudyHoursRange(
        "2026-11-26T17:00:00.000Z",
        "2026-11-26T18:00:00.000Z",
        "Africa/Cairo"
      ).ok
    ).toBe(true);

    // 18:00Z..19:00Z = 20:00..21:00 Africa/Cairo -> invalid (ends after 20:00 local)
    expect(
      validateStudyHoursRange(
        "2026-11-26T18:00:00.000Z",
        "2026-11-26T19:00:00.000Z",
        "Africa/Cairo"
      ).ok
    ).toBe(false);
  });
});

describe("buildConflictBreakdown", () => {
  it("reports cohort, ta, and room conflicts including multi-dimension overlaps", () => {
    const existing: ScheduledBookingSlot[] = [
      {
        id: "b-1",
        courseCode: "MATH101",
        cohortId: "cohort-a",
        taId: "ta-ali",
        roomId: "room-1",
        topic: "Linear Transformations",
        startsAt: "2026-11-26T14:00:00.000Z",
        endsAt: "2026-11-26T15:30:00.000Z",
      },
      {
        id: "b-2",
        courseCode: "PHYS101",
        cohortId: "cohort-b",
        taId: "ta-mai",
        roomId: "room-2",
        topic: "Kinematics",
        startsAt: "2026-11-26T14:30:00.000Z",
        endsAt: "2026-11-26T15:30:00.000Z",
      },
    ];

    const conflicts = buildConflictBreakdown({
      cohortId: "cohort-a",
      taId: "ta-mai",
      roomId: "room-1",
      startsAt: "2026-11-26T14:30:00.000Z",
      endsAt: "2026-11-26T15:30:00.000Z",
      overlappingBookings: existing,
    });

    expect(conflicts).toHaveLength(3);
    expect(conflicts.map((c) => c.dimension)).toEqual([
      "cohort",
      "room",
      "ta",
    ]);
    expect(conflicts[0]?.bookingId).toBe("b-1");
    expect(conflicts[1]?.bookingId).toBe("b-1");
    expect(conflicts[2]?.bookingId).toBe("b-2");
  });
});

describe("findAvailableSlotSuggestions", () => {
  it("prefers the requested room in 30m steps when cohort conflicts and wraps across 20:00 boundary", () => {
    const existing: ScheduledBookingSlot[] = [
      {
        id: "b-1",
        courseCode: "MATH101",
        cohortId: "cohort-a",
        taId: "ta-ali",
        roomId: "room-1",
        topic: "Derivatives",
        startsAt: "2026-11-26T18:00:00.000Z",
        endsAt: "2026-11-26T19:30:00.000Z",
      },
    ];

    // Request 18:30-19:30 (60m) in room-1; remaining window on 2026-11-26 is 19:30-20:00 (only 30m),
    // so 60m suggestions wrap to 2026-11-27 08:00, 08:30, 09:00 in room-1.
    const suggestions = findAvailableSlotSuggestions({
      requestedStartsAt: "2026-11-26T18:30:00.000Z",
      requestedEndsAt: "2026-11-26T19:30:00.000Z",
      requestedRoomId: "room-1",
      cohortId: "cohort-a",
      taId: "ta-mai",
      rooms: ROOMS,
      existingBookings: existing,
      conflictDimensions: ["cohort", "room"],
      timeZone: "UTC",
      maxSuggestions: 3,
    });

    expect(suggestions).toEqual([
      {
        startsAt: "2026-11-27T08:00:00.000Z",
        endsAt: "2026-11-27T09:00:00.000Z",
        roomId: "room-1",
        roomCode: "DISC-104",
      },
      {
        startsAt: "2026-11-27T08:30:00.000Z",
        endsAt: "2026-11-27T09:30:00.000Z",
        roomId: "room-1",
        roomCode: "DISC-104",
      },
      {
        startsAt: "2026-11-27T09:00:00.000Z",
        endsAt: "2026-11-27T10:00:00.000Z",
        roomId: "room-1",
        roomCode: "DISC-104",
      },
    ]);
  });

  it("suggests an alternate free room at the exact requested time first when only room conflicted", () => {
    const existing: ScheduledBookingSlot[] = [
      {
        id: "b-1",
        courseCode: "CHEM101",
        cohortId: "cohort-b",
        taId: "ta-nour",
        roomId: "room-1",
        topic: "Organic Mechanisms",
        startsAt: "2026-11-26T14:00:00.000Z",
        endsAt: "2026-11-26T15:00:00.000Z",
      },
    ];

    const suggestions = findAvailableSlotSuggestions({
      requestedStartsAt: "2026-11-26T14:00:00.000Z",
      requestedEndsAt: "2026-11-26T15:00:00.000Z",
      requestedRoomId: "room-1",
      cohortId: "cohort-a",
      taId: "ta-mai",
      rooms: ROOMS,
      existingBookings: existing,
      conflictDimensions: ["room"],
      timeZone: "UTC",
      maxSuggestions: 3,
    });

    expect(suggestions).toEqual([
      {
        startsAt: "2026-11-26T14:00:00.000Z",
        endsAt: "2026-11-26T15:00:00.000Z",
        roomId: "room-2",
        roomCode: "LAB-B201",
      },
      {
        startsAt: "2026-11-26T15:00:00.000Z",
        endsAt: "2026-11-26T16:00:00.000Z",
        roomId: "room-1",
        roomCode: "DISC-104",
      },
      {
        startsAt: "2026-11-26T15:30:00.000Z",
        endsAt: "2026-11-26T16:30:00.000Z",
        roomId: "room-1",
        roomCode: "DISC-104",
      },
    ]);
  });
});
