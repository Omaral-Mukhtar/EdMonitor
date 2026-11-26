// @vitest-environment node
import { NextRequest } from "next/server";
import { TokenVerifier } from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/livekit/token/route";

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

function makeProfileChain(displayName: string | null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({
      data: displayName ? { display_name: displayName } : null,
      error: null,
    })),
  };
  return chain;
}

describe("POST /api/livekit/token", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.LIVEKIT_API_KEY = "devkey_test_123456";
    process.env.LIVEKIT_API_SECRET = "secret_key_for_unit_tests_at_least_32_chars";
    process.env.NEXT_PUBLIC_LIVEKIT_URL = "wss://edmonitor-test.livekit.cloud";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 UNAUTHORIZED when user is unauthenticated or anonymous", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({ roomSlug: "math-calculus", tableId: "table-1" }),
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR on invalid payload", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({ roomSlug: "math-calculus", tableId: "" }),
      })
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 NOT_FOUND for unknown roomSlug or invalid tableId", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badRoom = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({ roomSlug: "physics-mechanics", tableId: "table-1" }),
      })
    );
    expect(badRoom.status).toBe(404);

    const badTable = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({ roomSlug: "math-calculus", tableId: "table-99" }),
      })
    );
    expect(badTable.status).toBe(404);
  });

  it("returns 403 FORBIDDEN for General Study silent rooms (allowAudioVideo === false)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const res1 = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({
          roomSlug: "general-quiet-hall",
          tableId: "table-1",
        }),
      })
    );
    expect(res1.status).toBe(403);
    const json1 = await res1.json();
    expect(json1.error).toBe("FORBIDDEN");

    const res2 = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({
          roomSlug: "general-deep-focus",
          tableId: "table-2",
        }),
      })
    );
    expect(res2.status).toBe(403);
  });

  it("mints a valid table-scoped LiveKit JWT for Topic A/V rooms (200 OK)", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });
    mockFrom.mockImplementationOnce(() => makeProfileChain("QA Tester"));

    const res = await POST(
      new NextRequest("http://localhost:3000/api/livekit/token", {
        method: "POST",
        body: JSON.stringify({
          roomSlug: "math-calculus",
          tableId: "table-1",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.roomName).toBe("math-calculus:table-1");
    expect(json.serverUrl).toBe("wss://edmonitor-test.livekit.cloud");
    expect(json.participantIdentity).toBe(verifiedUser.id);
    expect(typeof json.token).toBe("string");

    const verifier = new TokenVerifier(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!
    );
    const claims = await verifier.verify(json.token);
    expect(claims.sub).toBe(verifiedUser.id);
    expect(claims.name).toBe("QA Tester");
    expect(claims.video?.room).toBe("math-calculus:table-1");
    expect(claims.video?.roomJoin).toBe(true);
  });
});
