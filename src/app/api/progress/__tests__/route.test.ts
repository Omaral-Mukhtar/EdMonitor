import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/progress/route";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const verifiedUser = {
  id: "user-123",
  is_anonymous: false,
  email: "youssef@university.edu",
  email_confirmed_at: "2026-11-26T00:05:00.000Z",
};

function makeChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    returns: vi.fn(async () => result),
  };
  return chain;
}

describe("GET /api/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 UNAUTHORIZED when unauthenticated or unverified", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const unauthRes = await GET(
      new NextRequest("http://localhost:3000/api/progress")
    );
    expect(unauthRes.status).toBe(401);

    mockGetUser.mockResolvedValue({
      data: { user: { id: "anon", is_anonymous: true } },
      error: null,
    });
    const anonRes = await GET(
      new NextRequest("http://localhost:3000/api/progress")
    );
    expect(anonRes.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid days query parameter", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    for (const badDays of ["0", "-2", "91", "abc", "10.5"]) {
      const res = await GET(
        new NextRequest(`http://localhost:3000/api/progress?days=${badDays}`)
      );
      const json = await res.json();
      expect(res.status).toBe(400);
      expect(json.error).toBe("VALIDATION_ERROR");
    }
  });

  it("returns 200 OK with aggregated metrics matching API_CONTRACT.md", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return makeChain({
          data: { current_streak_days: 5 },
          error: null,
        });
      }
      if (table === "study_sessions") {
        return makeChain({
          data: [
            {
              id: "sess-1",
              subject: "math",
              room_slug: "math-calculus",
              technique: "pomodoro",
              focused_seconds: 1500,
              distraction_count: 1,
              focus_score_pct: 94,
              started_at: "2026-11-26T12:00:00.000Z",
              ended_at: "2026-11-26T12:25:00.000Z",
            },
            {
              id: "sess-2",
              subject: "general",
              room_slug: "general-quiet-hall",
              technique: "deep_work",
              focused_seconds: 3000,
              distraction_count: 0,
              focus_score_pct: 100,
              started_at: "2026-11-26T09:00:00.000Z",
              ended_at: "2026-11-26T09:50:00.000Z",
            },
          ],
          error: null,
        });
      }
      if (table === "distraction_logs") {
        return makeChain({
          data: [{ reason: "cell_phone" }, { reason: "look_away" }],
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await GET(
      new NextRequest("http://localhost:3000/api/progress?days=30")
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      currentStreakDays: 5,
      totalFocusedMinutes: 75,
      averageFocusScorePct: 98,
      minutesBySubject: {
        math: 25,
        general: 50,
      },
      distractionBreakdown: {
        cell_phone: 1,
        face_absent: 0,
        look_away: 1,
      },
      recentSessions: [
        {
          id: "sess-1",
          subject: "math",
          roomSlug: "math-calculus",
          technique: "pomodoro",
          focusedSeconds: 1500,
          distractionCount: 1,
          focusScorePct: 94,
          startedAt: "2026-11-26T12:00:00.000Z",
          endedAt: "2026-11-26T12:25:00.000Z",
        },
        {
          id: "sess-2",
          subject: "general",
          roomSlug: "general-quiet-hall",
          technique: "deep_work",
          focusedSeconds: 3000,
          distractionCount: 0,
          focusScorePct: 100,
          startedAt: "2026-11-26T09:00:00.000Z",
          endedAt: "2026-11-26T09:50:00.000Z",
        },
      ],
    });
  });
});
