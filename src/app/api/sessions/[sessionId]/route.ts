import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import {
  isValidTableIdForRoom,
  patchStudySessionSchema,
  type StudySessionRow,
} from "@/lib/study-sessions";
import { computeFocusScorePct, computeStreakUpdate } from "@/lib/study-timer";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidParamSchema = z.string().uuid("Invalid study session ID.");

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !isVerifiedEmailUser(user)) {
    return apiError(
      401,
      "UNAUTHORIZED",
      "Verified email authentication required."
    );
  }

  const { sessionId } = await context.params;
  const parsedId = uuidParamSchema.safeParse(sessionId);
  if (!parsedId.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid study session ID.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON request body.");
  }

  const parsed = patchStudySessionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid session update payload.",
      { fieldErrors: parsed.error.flatten().fieldErrors }
    );
  }

  // Use admin client for existence/ownership lookup when available so non-owners receive 403 instead of RLS-masked 404.
  const lookupClient =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : supabase;

  const { data: existing, error: lookupError } = await lookupClient
    .from("study_sessions")
    .select(
      "id, user_id, subject, room_slug, table_id, technique, synced_with_table, focused_seconds, distraction_count, focus_score_pct, started_at, ended_at"
    )
    .eq("id", parsedId.data)
    .maybeSingle<StudySessionRow>();

  if (lookupError) {
    return apiError(500, "INTERNAL_ERROR", "Failed to load study session.");
  }

  if (!existing) {
    return apiError(404, "NOT_FOUND", "Study session was not found.");
  }

  if (existing.user_id !== user.id) {
    return apiError(
      403,
      "FORBIDDEN",
      "You do not have permission to update this study session."
    );
  }

  if (
    parsed.data.tableId !== undefined &&
    !isValidTableIdForRoom(existing.room_slug, parsed.data.tableId)
  ) {
    return apiError(
      404,
      "NOT_FOUND",
      `Table '${parsed.data.tableId}' was not found in room '${existing.room_slug}'.`
    );
  }

  const nextFocusedSeconds =
    parsed.data.focusedSeconds ?? existing.focused_seconds;
  const nextDistractionCount =
    parsed.data.distractionCount ?? existing.distraction_count;

  const updateFields: Record<string, unknown> = {};
  if (parsed.data.focusedSeconds !== undefined) {
    updateFields.focused_seconds = nextFocusedSeconds;
  }
  if (parsed.data.distractionCount !== undefined) {
    updateFields.distraction_count = nextDistractionCount;
  }
  if (parsed.data.tableId !== undefined) {
    updateFields.table_id = parsed.data.tableId;
  }
  if (parsed.data.technique !== undefined) {
    updateFields.technique = parsed.data.technique;
  }
  if (parsed.data.syncedWithTable !== undefined) {
    updateFields.synced_with_table = parsed.data.syncedWithTable;
  }

  const isEnding = parsed.data.endSession === true;
  if (isEnding) {
    updateFields.focus_score_pct = computeFocusScorePct(
      nextFocusedSeconds,
      nextDistractionCount
    );
    updateFields.ended_at = existing.ended_at ?? new Date().toISOString();
  }

  let updatedSession: StudySessionRow = existing;
  if (Object.keys(updateFields).length > 0) {
    const { data: updated, error: updateError } = await supabase
      .from("study_sessions")
      .update(updateFields)
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .select(
        "id, user_id, subject, room_slug, table_id, technique, synced_with_table, focused_seconds, distraction_count, focus_score_pct, started_at, ended_at"
      )
      .single<StudySessionRow>();

    if (updateError || !updated) {
      return apiError(500, "INTERNAL_ERROR", "Failed to update study session.");
    }
    updatedSession = updated;
  }

  const { data: profileRow, error: profileError } = await supabase
    .from("profiles")
    .select("current_streak_days, last_study_date")
    .eq("id", user.id)
    .maybeSingle<{
      current_streak_days: number;
      last_study_date: string | null;
    }>();

  if (profileError) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Failed to load user streak profile."
    );
  }

  let streak = {
    currentStreakDays: profileRow?.current_streak_days ?? 0,
    lastStudyDate: profileRow?.last_study_date ?? null,
  };

  if (isEnding) {
    const nextStreak = computeStreakUpdate({
      currentStreakDays: streak.currentStreakDays,
      lastStudyDate: streak.lastStudyDate,
      focusedSeconds: updatedSession.focused_seconds,
    });

    if (
      nextStreak.currentStreakDays !== streak.currentStreakDays ||
      nextStreak.lastStudyDate !== streak.lastStudyDate
    ) {
      const { error: streakUpdateError } = await supabase
        .from("profiles")
        .update({
          current_streak_days: nextStreak.currentStreakDays,
          last_study_date: nextStreak.lastStudyDate,
        })
        .eq("id", user.id);

      if (streakUpdateError) {
        return apiError(
          500,
          "INTERNAL_ERROR",
          "Failed to update daily study streak."
        );
      }
    }

    streak = nextStreak;
  }

  return NextResponse.json(
    {
      session: {
        id: updatedSession.id,
        focusedSeconds: updatedSession.focused_seconds,
        distractionCount: updatedSession.distraction_count,
        focusScorePct: updatedSession.focus_score_pct,
        endedAt: updatedSession.ended_at,
      },
      streak,
    },
    { status: 200 }
  );
}
