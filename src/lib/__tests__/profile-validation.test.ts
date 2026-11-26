import { describe, expect, it } from "vitest";
import { buildApiErrorPayload } from "@/lib/api-errors";
import {
  mapProfileRow,
  profilePatchSchema,
  type ProfileRow,
} from "@/lib/profile-validation";

describe("profilePatchSchema", () => {
  it("accepts a valid trimmed displayName and hex avatarColor", () => {
    const parsed = profilePatchSchema.safeParse({
      displayName: "  Youssef  ",
      avatarColor: "#2563EB",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.displayName).toBe("Youssef");
      expect(parsed.data.avatarColor).toBe("#2563EB");
    }
  });

  it("accepts displayName without avatarColor", () => {
    const parsed = profilePatchSchema.safeParse({
      displayName: "Sara",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects empty or whitespace-only displayName", () => {
    const empty = profilePatchSchema.safeParse({ displayName: "" });
    const spaces = profilePatchSchema.safeParse({ displayName: "   " });

    expect(empty.success).toBe(false);
    expect(spaces.success).toBe(false);
  });

  it("rejects displayName exceeding 32 characters", () => {
    const tooLong = profilePatchSchema.safeParse({
      displayName: "A".repeat(33),
    });

    expect(tooLong.success).toBe(false);
  });

  it("rejects invalid hex avatarColor strings", () => {
    const invalidNamed = profilePatchSchema.safeParse({
      displayName: "Youssef",
      avatarColor: "blue",
    });
    const invalidShortHex = profilePatchSchema.safeParse({
      displayName: "Youssef",
      avatarColor: "#256",
    });

    expect(invalidNamed.success).toBe(false);
    expect(invalidShortHex.success).toBe(false);
  });
});

describe("mapProfileRow", () => {
  it("maps snake_case database fields to camelCase UserProfile", () => {
    const row: ProfileRow = {
      id: "11111111-1111-1111-1111-111111111111",
      display_name: "Youssef",
      avatar_color: "#2563EB",
      is_guest: true,
      current_streak_days: 4,
      last_study_date: "2026-11-25",
      created_at: "2026-11-25T18:00:00.000Z",
    };

    expect(mapProfileRow(row)).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      displayName: "Youssef",
      avatarColor: "#2563EB",
      isGuest: true,
      currentStreakDays: 4,
      lastStudyDate: "2026-11-25",
      createdAt: "2026-11-25T18:00:00.000Z",
    });
  });
});

describe("buildApiErrorPayload", () => {
  it("serializes standard error payloads without details", () => {
    expect(
      buildApiErrorPayload("UNAUTHORIZED", "Authentication required.")
    ).toEqual({
      error: "UNAUTHORIZED",
      message: "Authentication required.",
    });
  });

  it("serializes validation error payloads with structured details", () => {
    expect(
      buildApiErrorPayload("VALIDATION_ERROR", "Invalid profile input.", {
        field: "displayName",
      })
    ).toEqual({
      error: "VALIDATION_ERROR",
      message: "Invalid profile input.",
      details: { field: "displayName" },
    });
  });
});
