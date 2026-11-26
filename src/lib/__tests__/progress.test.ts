import { describe, expect, it } from "vitest";
import {
  CAMPUS_ROOMS,
  CAMPUS_ZONES,
  getCampusRoomBySlug,
  getCampusRoomsByZone,
  getSubjectProgressMeta,
} from "@/lib/campus-rooms";
import {
  aggregateProgress,
  DEFAULT_PROGRESS_DAYS,
  MAX_PROGRESS_DAYS,
  parseProgressDaysParam,
} from "@/lib/progress";

describe("campus-rooms catalog", () => {
  it("defines exactly 2 active zones (general & math) and 5 study rooms with zero physics/chemistry", () => {
    expect(CAMPUS_ZONES.map((z) => z.id)).toEqual(["general", "math"]);
    expect(CAMPUS_ROOMS).toHaveLength(5);

    const roomSlugs = CAMPUS_ROOMS.map((r) => r.slug);
    expect(roomSlugs).toEqual([
      "general-quiet-hall",
      "general-deep-focus",
      "math-calculus",
      "math-2-integrals",
      "math-linear-algebra",
    ]);

    expect(
      CAMPUS_ROOMS.some(
        (r) =>
          (r.subject as string) === "physics" ||
          (r.subject as string) === "chemistry" ||
          r.slug.includes("physics") ||
          r.slug.includes("chem")
      )
    ).toBe(false);
  });

  it("enforces allowAudioVideo=false on General rooms and true on Math rooms with expected codes", () => {
    const generalRooms = getCampusRoomsByZone("general");
    const mathRooms = getCampusRoomsByZone("math");

    expect(generalRooms).toHaveLength(2);
    expect(generalRooms.map((r) => r.code)).toEqual(["G-101", "G-102"]);
    for (const room of generalRooms) {
      expect(room.allowAudioVideo).toBe(false);
      expect(room.modeBadge).toBe("Silent · No A/V");
      expect(room.capacity).toBe(12);
    }

    expect(mathRooms).toHaveLength(3);
    expect(mathRooms.map((r) => r.code)).toEqual(["M-101", "M-102", "M-103"]);
    for (const room of mathRooms) {
      expect(room.allowAudioVideo).toBe(true);
      expect(room.modeBadge).toBe("Topic · A/V");
      expect(room.capacity).toBe(12);
    }

    expect(getCampusRoomBySlug("math-2-integrals")?.code).toBe("M-102");
    expect(getCampusRoomBySlug("physics-mechanics")).toBeUndefined();
    expect(getSubjectProgressMeta("math").label).toBe("Math");
    expect(getSubjectProgressMeta("general").label).toBe("General Study");
  });
});

describe("progress helpers", () => {
  it("validates and defaults the days query parameter", () => {
    expect(parseProgressDaysParam(null)).toEqual({
      ok: true,
      days: DEFAULT_PROGRESS_DAYS,
    });
    expect(parseProgressDaysParam("")).toEqual({
      ok: true,
      days: DEFAULT_PROGRESS_DAYS,
    });
    expect(parseProgressDaysParam("7")).toEqual({ ok: true, days: 7 });
    expect(parseProgressDaysParam(String(MAX_PROGRESS_DAYS))).toEqual({
      ok: true,
      days: 90,
    });

    expect(parseProgressDaysParam("0").ok).toBe(false);
    expect(parseProgressDaysParam("-5").ok).toBe(false);
    expect(parseProgressDaysParam("91").ok).toBe(false);
    expect(parseProgressDaysParam("14.5").ok).toBe(false);
    expect(parseProgressDaysParam("abc").ok).toBe(false);
  });

  it("returns initialized zero metrics when user has no sessions or distractions", () => {
    const result = aggregateProgress({
      currentStreakDays: 0,
      sessions: [],
      distractionLogs: [],
    });

    expect(result).toEqual({
      currentStreakDays: 0,
      totalFocusedMinutes: 0,
      averageFocusScorePct: 0,
      minutesBySubject: {
        math: 0,
        general: 0,
      },
      distractionBreakdown: {
        cell_phone: 0,
        face_absent: 0,
        look_away: 0,
      },
      recentSessions: [],
    });
  });

  it("aggregates multi-subject minutes, weighted focus score %, distraction breakdown, and extra subjects extensibly", () => {
    const result = aggregateProgress({
      currentStreakDays: 4,
      sessions: [
        {
          id: "s-1",
          subject: "math",
          room_slug: "math-calculus",
          technique: "pomodoro",
          focused_seconds: 3000, // 50 min
          distraction_count: 1,
          focus_score_pct: 90,
          started_at: "2026-11-26T10:00:00.000Z",
          ended_at: "2026-11-26T10:50:00.000Z",
        },
        {
          id: "s-2",
          subject: "general",
          room_slug: "general-quiet-hall",
          technique: "deep_work",
          focused_seconds: 635, // 10.58 min -> rounds to 11
          distraction_count: 2,
          focus_score_pct: 60,
          started_at: "2026-11-26T08:00:00.000Z",
          ended_at: "2026-11-26T08:15:00.000Z",
        },
        {
          id: "s-3",
          subject: "physics",
          room_slug: "physics-mechanics",
          technique: "flowtime",
          focused_seconds: 1200, // 20 min
          distraction_count: 0,
          focus_score_pct: null, // active session shouldn't dilute average
          started_at: "2026-11-25T16:00:00.000Z",
          ended_at: null,
        },
      ],
      distractionLogs: [
        { reason: "cell_phone" },
        { reason: "cell_phone" },
        { reason: "face_absent" },
        { reason: "look_away" },
        { reason: "look_away" },
        { reason: "look_away" },
      ],
    });

    expect(result.currentStreakDays).toBe(4);
    expect(result.totalFocusedMinutes).toBe(81); // Math.round(4835 / 60)
    expect(result.minutesBySubject).toEqual({
      math: 50,
      general: 11,
      physics: 20,
    });
    // Weighted average across s-1 (3000s @ 90%) and s-2 (635s @ 60%):
    // (3000*90 + 635*60) / 3635 = 308100 / 3635 = 84.76 -> 85
    expect(result.averageFocusScorePct).toBe(85);
    expect(result.distractionBreakdown).toEqual({
      cell_phone: 2,
      face_absent: 1,
      look_away: 3,
    });
    expect(result.recentSessions).toHaveLength(3);
    expect(result.recentSessions[0]).toMatchObject({
      id: "s-1",
      subject: "math",
      roomSlug: "math-calculus",
      focusedSeconds: 3000,
      focusScorePct: 90,
    });
  });
});
