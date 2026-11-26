import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import {
  aggregateProgress,
  getProgressWindowStartIso,
  parseProgressDaysParam,
  type DistractionLogReasonRow,
  type StudySessionProgressRow,
} from "@/lib/progress";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
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

  const parsedDays = parseProgressDaysParam(
    request.nextUrl.searchParams.get("days")
  );
  if (!parsedDays.ok) {
    return apiError(400, "VALIDATION_ERROR", parsedDays.message);
  }

  const sinceIso = getProgressWindowStartIso(parsedDays.days);

  const [profileRes, sessionsRes, distractionsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("current_streak_days")
      .eq("id", user.id)
      .maybeSingle<{ current_streak_days: number }>(),
    supabase
      .from("study_sessions")
      .select(
        "id, subject, room_slug, technique, focused_seconds, distraction_count, focus_score_pct, started_at, ended_at"
      )
      .eq("user_id", user.id)
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: false })
      .returns<StudySessionProgressRow[]>(),
    supabase
      .from("distraction_logs")
      .select("reason")
      .eq("user_id", user.id)
      .gte("triggered_at", sinceIso)
      .returns<DistractionLogReasonRow[]>(),
  ]);

  if (profileRes.error || sessionsRes.error || distractionsRes.error) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Failed to load study progress metrics."
    );
  }

  const payload = aggregateProgress({
    currentStreakDays: profileRes.data?.current_streak_days ?? 0,
    sessions: sessionsRes.data ?? [],
    distractionLogs: distractionsRes.data ?? [],
  });

  return NextResponse.json(payload, { status: 200 });
}
