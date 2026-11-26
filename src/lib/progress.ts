import type {
  DistractionReason,
  ProgressDistractionBreakdown,
  ProgressRecentSession,
  ProgressResponse,
  StudyTechnique,
} from "@/types/domain";

export const DEFAULT_PROGRESS_DAYS = 30;
export const MAX_PROGRESS_DAYS = 90;
export const RECENT_SESSIONS_LIMIT = 15;

export interface StudySessionProgressRow {
  id: string;
  subject: string;
  room_slug: string;
  technique: StudyTechnique;
  focused_seconds: number;
  distraction_count: number;
  focus_score_pct: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface DistractionLogReasonRow {
  reason: DistractionReason | string;
}

export type DaysValidationResult =
  | { ok: true; days: number }
  | { ok: false; message: string };

/**
 * Validate the optional `days` query parameter on GET /api/progress.
 * Defaults to 30 and accepts integers from 1 to 90 inclusive.
 */
export function parseProgressDaysParam(
  rawDays: string | null
): DaysValidationResult {
  if (rawDays === null || rawDays.trim() === "") {
    return { ok: true, days: DEFAULT_PROGRESS_DAYS };
  }

  const trimmed = rawDays.trim();
  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      message: `Query parameter 'days' must be an integer between 1 and ${MAX_PROGRESS_DAYS}.`,
    };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (parsed < 1 || parsed > MAX_PROGRESS_DAYS) {
    return {
      ok: false,
      message: `Query parameter 'days' must be between 1 and ${MAX_PROGRESS_DAYS}.`,
    };
  }

  return { ok: true, days: parsed };
}

/**
 * Compute the UTC ISO lower-bound timestamp for a rolling N-day window.
 */
export function getProgressWindowStartIso(
  days: number,
  now: Date = new Date()
): string {
  const windowMs = days * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - windowMs).toISOString();
}

/**
 * Aggregate study session metrics, subject breakdown, distraction counts,
 * and recent sessions into the API_CONTRACT.md §3 GET /api/progress shape.
 */
export function aggregateProgress(input: {
  currentStreakDays: number;
  sessions: StudySessionProgressRow[];
  distractionLogs: DistractionLogReasonRow[];
}): ProgressResponse {
  const secondsBySubject: Record<string, number> = {
    math: 0,
    general: 0,
  };

  let totalFocusedSeconds = 0;
  let scoredWeightSum = 0;
  let scoredWeightTotal = 0;
  let unweightedScoreSum = 0;
  let scoredCount = 0;

  for (const session of input.sessions) {
    const safeSeconds = Math.max(0, Math.floor(session.focused_seconds || 0));
    totalFocusedSeconds += safeSeconds;

    const subjectKey = session.subject.trim().toLowerCase() || "general";
    secondsBySubject[subjectKey] =
      (secondsBySubject[subjectKey] ?? 0) + safeSeconds;

    if (
      session.focus_score_pct !== null &&
      session.focus_score_pct !== undefined &&
      Number.isFinite(session.focus_score_pct)
    ) {
      const clampedScore = Math.max(0, Math.min(100, session.focus_score_pct));
      scoredCount += 1;
      unweightedScoreSum += clampedScore;
      if (safeSeconds > 0) {
        scoredWeightSum += clampedScore * safeSeconds;
        scoredWeightTotal += safeSeconds;
      }
    }
  }

  const minutesBySubject: Record<string, number> = {};
  for (const [subjectKey, seconds] of Object.entries(secondsBySubject)) {
    minutesBySubject[subjectKey] = Math.round(seconds / 60);
  }

  const totalFocusedMinutes = Math.round(totalFocusedSeconds / 60);

  let averageFocusScorePct = 0;
  if (scoredCount > 0) {
    averageFocusScorePct =
      scoredWeightTotal > 0
        ? Math.round(scoredWeightSum / scoredWeightTotal)
        : Math.round(unweightedScoreSum / scoredCount);
  }

  const distractionBreakdown: ProgressDistractionBreakdown = {
    cell_phone: 0,
    face_absent: 0,
    look_away: 0,
  };

  for (const log of input.distractionLogs) {
    if (
      log.reason === "cell_phone" ||
      log.reason === "face_absent" ||
      log.reason === "look_away"
    ) {
      distractionBreakdown[log.reason] += 1;
    }
  }

  const recentSessions: ProgressRecentSession[] = input.sessions
    .slice(0, RECENT_SESSIONS_LIMIT)
    .map((session) => ({
      id: session.id,
      subject: session.subject,
      roomSlug: session.room_slug,
      technique: session.technique,
      focusedSeconds: Math.max(0, Math.floor(session.focused_seconds || 0)),
      distractionCount: Math.max(0, Math.floor(session.distraction_count || 0)),
      focusScorePct: session.focus_score_pct ?? null,
      startedAt: session.started_at,
      endedAt: session.ended_at,
    }));

  return {
    currentStreakDays: Math.max(0, Math.floor(input.currentStreakDays || 0)),
    totalFocusedMinutes,
    averageFocusScorePct,
    minutesBySubject,
    distractionBreakdown,
    recentSessions,
  };
}
