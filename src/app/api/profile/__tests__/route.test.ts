import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "@/app/api/profile/route";

const mockGetUser = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockSelectAfterFrom = vi.fn(() => ({ eq: mockEq }));
const mockSelectAfterUpsert = vi.fn(() => ({ single: mockSingle }));
const mockUpsert = vi.fn(() => ({ select: mockSelectAfterUpsert }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      select: mockSelectAfterFrom,
      upsert: mockUpsert,
    })),
  })),
}));

const verifiedUser = {
  id: "user-123",
  is_anonymous: false,
  email: "youssef@university.edu",
  email_confirmed_at: "2026-11-26T00:05:00.000Z",
};

describe("/api/profile route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 UNAUTHORIZED when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({
      error: "UNAUTHORIZED",
      message: "Verified email authentication required.",
    });
  });

  it("GET returns 401 UNAUTHORIZED for anonymous or unverified email users", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: "anon-1", is_anonymous: true } },
      error: null,
    });
    const anonRes = await GET();
    expect(anonRes.status).toBe(401);

    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "unverified-1",
          is_anonymous: false,
          email_confirmed_at: null,
        },
      },
      error: null,
    });
    const unverifiedRes = await GET();
    expect(unverifiedRes.status).toBe(401);
  });

  it("GET returns 200 OK with mapped profile when verified email user is authenticated", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });
    mockMaybeSingle.mockResolvedValue({
      data: {
        id: "user-123",
        display_name: "Youssef",
        avatar_color: "#2563EB",
        is_guest: false,
        current_streak_days: 4,
        last_study_date: "2026-11-25",
        created_at: "2026-11-25T18:00:00.000Z",
      },
      error: null,
    });

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      profile: {
        id: "user-123",
        displayName: "Youssef",
        avatarColor: "#2563EB",
        isGuest: false,
        currentStreakDays: 4,
        lastStudyDate: "2026-11-25",
        createdAt: "2026-11-25T18:00:00.000Z",
      },
    });
  });

  it("PATCH returns 401 UNAUTHORIZED when unauthenticated or unverified", async () => {
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: "unverified-1",
          is_anonymous: false,
          email_confirmed_at: null,
        },
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Youssef" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(req);
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json.error).toBe("UNAUTHORIZED");
  });

  it("PATCH returns 400 VALIDATION_ERROR for empty displayName or invalid hex", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badNameReq = new NextRequest("http://localhost:3000/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "   " }),
      headers: { "Content-Type": "application/json" },
    });

    const badNameRes = await PATCH(badNameReq);
    const badNameJson = await badNameRes.json();
    expect(badNameRes.status).toBe(400);
    expect(badNameJson.error).toBe("VALIDATION_ERROR");

    const badColorReq = new NextRequest("http://localhost:3000/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Youssef", avatarColor: "not-hex" }),
      headers: { "Content-Type": "application/json" },
    });

    const badColorRes = await PATCH(badColorReq);
    const badColorJson = await badColorRes.json();
    expect(badColorRes.status).toBe(400);
    expect(badColorJson.error).toBe("VALIDATION_ERROR");
  });

  it("PATCH returns 200 OK and upserts non-guest profile for verified email user", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });
    mockSingle.mockResolvedValue({
      data: {
        id: "user-123",
        display_name: "Youssef",
        avatar_color: "#0D9488",
        is_guest: false,
        current_streak_days: 0,
        last_study_date: null,
        created_at: "2026-11-26T00:00:00.000Z",
      },
      error: null,
    });

    const req = new NextRequest("http://localhost:3000/api/profile", {
      method: "PATCH",
      body: JSON.stringify({
        displayName: "  Youssef  ",
        avatarColor: "#0D9488",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await PATCH(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledWith(
      {
        id: "user-123",
        display_name: "Youssef",
        avatar_color: "#0D9488",
        is_guest: false,
      },
      { onConflict: "id" }
    );
    expect(json.profile.displayName).toBe("Youssef");
    expect(json.profile.avatarColor).toBe("#0D9488");
    expect(json.profile.isGuest).toBe(false);
  });
});
