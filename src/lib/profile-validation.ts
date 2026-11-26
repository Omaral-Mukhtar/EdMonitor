import { z } from "zod";
import type { UserProfile } from "@/types/domain";

export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export const profilePatchSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Display name must be at least 1 character.")
    .max(32, "Display name must be 32 characters or fewer."),
  avatarColor: z
    .string()
    .trim()
    .regex(HEX_COLOR_REGEX, "Avatar color must be a 6-digit hex color (e.g. #2563EB).")
    .optional(),
});

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;

export interface ProfileRow {
  id: string;
  display_name: string;
  avatar_color: string;
  is_guest: boolean;
  current_streak_days: number;
  last_study_date: string | null;
  created_at: string;
}

/** Map a Postgres `public.profiles` row to the camelCase API response shape. */
export function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarColor: row.avatar_color,
    isGuest: row.is_guest,
    currentStreakDays: row.current_streak_days,
    lastStudyDate: row.last_study_date,
    createdAt: row.created_at,
  };
}
