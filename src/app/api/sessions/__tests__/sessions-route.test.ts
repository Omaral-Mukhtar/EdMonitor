import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/sessions/route";
import { PATCH } from "@/app/api/sessions/[sessionId]/route";

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

const verifiedUser = {
  id: "user-1111-1111-1111-111111111111",
  is_anonymous: false,
  email: "qa-ta@edmonitor.test",
  email_confirmed_at: "2026-11-26T00:05:00.000Z",
};

const sessionId = "22222222-2222-4222-8222-222222222222";

function makeChain(result: { data: unknown; error: unknown }) {
  const chain = {
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

describe("POST /api/sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 UNAUTHORIZED for unauthenticated or anonymous users", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR for invalid subject (e.g. physics) or mismatched room subject", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badSubject = await POST(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: "physics",
          roomSlug: "math-calculus",
          tableId: "table-1",
          technique: "pomodoro",
          syncedWithTable: false,
        }),
      })
    );
    expect(badSubject.status).toBe(400);

    const mismatch = await POST(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: "general",
          roomSlug: "math-calculus",
          tableId: "table-1",
          technique: "pomodoro",
          syncedWithTable: false,
        }),
      })
    );
    expect(mismatch.status).toBe(400);
  });

  it("returns 404 NOT_FOUND for unknown roomSlug", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: "math",
          roomSlug: "nonexistent-room",
          tableId: "table-1",
          technique: "pomodoro",
          syncedWithTable: false,
        }),
      })
    );
    expect(res.status).toBe(404);
  });

  it("creates sessions for both math and general subjects (201 Created)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockFrom.mockImplementationOnce(() =>
      makeChain({
        data: {
          id: sessionId,
          user_id: verifiedUser.id,
          subject: "math",
          room_slug: "math-calculus",
          table_id: "table-2",
          technique: "pomodoro",
          synced_with_table: true,
          focused_seconds: 0,
          distraction_count: 0,
          focus_score_pct: null,
          started_at: "2026-11-26T18:10:00.000Z",
          ended_at: null,
        },
        error: null,
      })
    );

    const mathRes = await POST(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: "math",
          roomSlug: "math-calculus",
          tableId: "table-2",
          technique: "pomodoro",
          syncedWithTable: true,
        }),
      })
    );
    expect(mathRes.status).toBe(201);
    const mathJson = await mathRes.json();
    expect(mathJson.session.subject).toBe("math");
    expect(mathJson.session.syncedWithTable).toBe(true);

    mockFrom.mockImplementationOnce(() =>
      makeChain({
        data: {
          id: sessionId,
          user_id: verifiedUser.id,
          subject: "general",
          room_slug: "general-quiet-hall",
          table_id: "table-1",
          technique: "deep_work",
          synced_with_table: false,
          focused_seconds: 0,
          distraction_count: 0,
          focus_score_pct: null,
          started_at: "2026-11-26T18:20:00.000Z",
          ended_at: null,
        },
        error: null,
      })
    );

    const generalRes = await POST(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: "general",
          roomSlug: "general-quiet-hall",
          tableId: "table-1",
          technique: "deep_work",
          syncedWithTable: false,
        }),
      })
    );
    expect(generalRes.status).toBe(201);
    const generalJson = await generalRes.json();
    expect(generalJson.session.subject).toBe("general");
  });
});

describe("PATCH /api/sessions/[sessionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 on invalid session UUID and 404 when session is missing", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badIdRes = await PATCH(
      new NextRequest("http://localhost:3000/api/sessions/not-a-uuid", {
        method: "PATCH",
        body: JSON.stringify({ focusedSeconds: 100 }),
      }),
      { params: Promise.resolve({ sessionId: "not-a-uuid" }) }
    );
    expect(badIdRes.status).toBe(400);

    mockFrom.mockImplementationOnce(() =>
      makeChain({ data: null, error: null })
    );

    const missingRes = await PATCH(
      new NextRequest(`http://localhost:3000/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ focusedSeconds: 100 }),
      }),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(missingRes.status).toBe(404);
  });

  it("returns 403 FORBIDDEN when session belongs to another user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockFrom.mockImplementationOnce(() =>
      makeChain({
        data: {
          id: sessionId,
          user_id: "other-user-9999",
          subject: "math",
          room_slug: "math-calculus",
          table_id: "table-1",
          technique: "pomodoro",
          synced_with_table: false,
          focused_seconds: 120,
          distraction_count: 0,
          focus_score_pct: null,
          started_at: "2026-11-26T18:00:00.000Z",
          ended_at: null,
        },
        error: null,
      })
    );

    const res = await PATCH(
      new NextRequest(`http://localhost:3000/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({ endSession: true, focusedSeconds: 300 }),
      }),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(res.status).toBe(403);
  });

  it("ends session, computes focusScorePct, and updates streak on endSession=true", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    let sessionCall = 0;
    let profileCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "study_sessions") {
        sessionCall += 1;
        if (sessionCall === 1) {
          return makeChain({
            data: {
              id: sessionId,
              user_id: verifiedUser.id,
              subject: "general",
              room_slug: "general-quiet-hall",
              table_id: "table-1",
              technique: "flowtime",
              synced_with_table: false,
              focused_seconds: 0,
              distraction_count: 0,
              focus_score_pct: null,
              started_at: "2026-11-26T18:00:00.000Z",
              ended_at: null,
            },
            error: null,
          });
        }
        return makeChain({
          data: {
            id: sessionId,
            user_id: verifiedUser.id,
            subject: "general",
            room_slug: "general-quiet-hall",
            table_id: "table-1",
            technique: "flowtime",
            synced_with_table: false,
            focused_seconds: 1500,
            distraction_count: 1,
            focus_score_pct: 96,
            started_at: "2026-11-26T18:00:00.000Z",
            ended_at: "2026-11-26T18:25:00.000Z",
          },
          error: null,
        });
      }

      if (table === "profiles") {
        profileCall += 1;
        if (profileCall === 1) {
          return makeChain({
            data: {
              current_streak_days: 3,
              last_study_date: yesterday,
            },
            error: null,
          });
        }
        return makeChain({ data: null, error: null });
      }

      return makeChain({ data: null, error: null });
    });

    const res = await PATCH(
      new NextRequest(`http://localhost:3000/api/sessions/${sessionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          focusedSeconds: 1500,
          distractionCount: 1,
          endSession: true,
        }),
      }),
      { params: Promise.resolve({ sessionId }) }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.session.focusScorePct).toBe(96);
    expect(json.session.endedAt).toBe("2026-11-26T18:25:00.000Z");
    expect(json.streak.currentStreakDays).toBe(4);
    expect(json.streak.lastStudyDate).toBe(
      new Date().toISOString().slice(0, 10)
    );
  });
});
