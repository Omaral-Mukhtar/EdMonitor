import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { deriveProfileDefaults, isVerifiedEmailUser } from "@/lib/auth-user";

function makeUser(overrides: Partial<User>): User {
  return {
    id: "user-1",
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: "2026-11-26T00:00:00.000Z",
    email: "youssef@university.edu",
    email_confirmed_at: "2026-11-26T00:05:00.000Z",
    is_anonymous: false,
    ...overrides,
  };
}

describe("isVerifiedEmailUser", () => {
  it("returns false for null or undefined", () => {
    expect(isVerifiedEmailUser(null)).toBe(false);
    expect(isVerifiedEmailUser(undefined)).toBe(false);
  });

  it("returns false for anonymous users even if email_confirmed_at were set", () => {
    expect(isVerifiedEmailUser(makeUser({ is_anonymous: true }))).toBe(false);
  });

  it("returns false when email is not confirmed", () => {
    expect(
      isVerifiedEmailUser(makeUser({ email_confirmed_at: undefined }))
    ).toBe(false);
  });

  it("returns true for non-anonymous verified email users", () => {
    expect(isVerifiedEmailUser(makeUser({}))).toBe(true);
  });
});

describe("deriveProfileDefaults", () => {
  it("uses valid metadata display_name and avatar_color when provided", () => {
    const user = makeUser({
      user_metadata: { display_name: "  Youssef  ", avatar_color: "#0D9488" },
    });
    expect(deriveProfileDefaults(user)).toEqual({
      displayName: "Youssef",
      avatarColor: "#0D9488",
    });
  });

  it("falls back to email local-part and default cobalt color", () => {
    const user = makeUser({
      email: "sara.stem@uni.edu",
      user_metadata: { avatar_color: "invalid" },
    });
    expect(deriveProfileDefaults(user)).toEqual({
      displayName: "sara.stem",
      avatarColor: "#2563EB",
    });
  });
});
