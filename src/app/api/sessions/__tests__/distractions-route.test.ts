import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/sessions/[sessionId]/distractions/route";

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
const distractionId = "33333333-3333-4333-8333-333333333333";

function makeChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

describe("POST /api/sessions/[sessionId]/distractions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 UNAUTHORIZED when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/distractions`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "cell_phone", durationMs: 3200 }),
        }
      ),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid reason or negative durationMs", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badReason = await POST(
      new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/distractions`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "daydreaming", durationMs: 3200 }),
        }
      ),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(badReason.status).toBe(400);

    const negativeDuration = await POST(
      new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/distractions`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "cell_phone", durationMs: -50 }),
        }
      ),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(negativeDuration.status).toBe(400);
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
          distraction_count: 0,
        },
        error: null,
      })
    );

    const res = await POST(
      new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/distractions`,
        {
          method: "POST",
          body: JSON.stringify({ reason: "cell_phone", durationMs: 3400 }),
        }
      ),
      { params: Promise.resolve({ sessionId }) }
    );
    expect(res.status).toBe(403);
  });

  it("logs distraction and returns 201 Created for session owner", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount += 1;
      if (table === "study_sessions" && callCount === 1) {
        return makeChain({
          data: {
            id: sessionId,
            user_id: verifiedUser.id,
            distraction_count: 1,
          },
          error: null,
        });
      }
      if (table === "distraction_logs") {
        return makeChain({
          data: {
            id: distractionId,
            session_id: sessionId,
            user_id: verifiedUser.id,
            reason: "cell_phone",
            duration_ms: 4100,
            triggered_at: "2026-11-26T20:00:00.000Z",
          },
          error: null,
        });
      }
      return makeChain({ data: null, error: null });
    });

    const res = await POST(
      new NextRequest(
        `http://localhost:3000/api/sessions/${sessionId}/distractions`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: "cell_phone",
            durationMs: 4100,
            triggeredAt: "2026-11-26T20:00:00.000Z",
          }),
        }
      ),
      { params: Promise.resolve({ sessionId }) }
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.distractionLog).toEqual({
      id: distractionId,
      sessionId,
      reason: "cell_phone",
      durationMs: 4100,
      triggeredAt: "2026-11-26T20:00:00.000Z",
    });
  });
});
