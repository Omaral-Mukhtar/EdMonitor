import type {
  FocusHalo,
  StudyTechnique,
  StudyTimerVisualState,
  TimerPhase,
  TimerSyncPayload,
} from "@/types/domain";

export type TimerCountingMode = "countdown" | "countup";

export interface StudyTechniqueDefinition {
  id: StudyTechnique;
  label: string;
  shortLabel: string;
  badge: string;
  mode: TimerCountingMode;
  focusSeconds: number;
  breakSeconds: number;
  description: string;
}

export const STUDY_TECHNIQUES: Record<
  StudyTechnique,
  StudyTechniqueDefinition
> = {
  pomodoro: {
    id: "pomodoro",
    label: "Pomodoro",
    shortLabel: "Pomodoro",
    badge: "25/5",
    mode: "countdown",
    focusSeconds: 25 * 60,
    breakSeconds: 5 * 60,
    description: "25m focus · 5m break",
  },
  deep_work: {
    id: "deep_work",
    label: "Deep Work",
    shortLabel: "Deep Work",
    badge: "50/10",
    mode: "countdown",
    focusSeconds: 50 * 60,
    breakSeconds: 10 * 60,
    description: "50m focus · 10m break",
  },
  feynman: {
    id: "feynman",
    label: "Feynman",
    shortLabel: "Feynman",
    badge: "Count-up",
    mode: "countup",
    focusSeconds: 0,
    breakSeconds: 5 * 60,
    description: "Count-up concept mastery block",
  },
  flowtime: {
    id: "flowtime",
    label: "Flowtime",
    shortLabel: "Flowtime",
    badge: "Count-up",
    mode: "countup",
    focusSeconds: 0,
    breakSeconds: 5 * 60,
    description: "Uninterrupted flow count-up",
  },
};

export const STUDY_TECHNIQUE_LIST: readonly StudyTechniqueDefinition[] = [
  STUDY_TECHNIQUES.pomodoro,
  STUDY_TECHNIQUES.deep_work,
  STUDY_TECHNIQUES.feynman,
  STUDY_TECHNIQUES.flowtime,
] as const;

export interface StudyTimerState {
  technique: StudyTechnique;
  visualState: StudyTimerVisualState;
  displayMs: number;
  focusedMs: number;
  focusedSeconds: number;
  phaseEndsAt: string | null;
}

export function getInitialDisplayMs(technique: StudyTechnique): number {
  const def = STUDY_TECHNIQUES[technique];
  return def.mode === "countdown" ? def.focusSeconds * 1000 : 0;
}

export function createInitialTimerState(
  technique: StudyTechnique = "pomodoro"
): StudyTimerState {
  return {
    technique,
    visualState: "idle",
    displayMs: getInitialDisplayMs(technique),
    focusedMs: 0,
    focusedSeconds: 0,
    phaseEndsAt: null,
  };
}

export function visualStateToTimerPhase(
  visualState: StudyTimerVisualState
): TimerPhase {
  switch (visualState) {
    case "focus":
      return "focus";
    case "break":
      return "break";
    case "paused_distraction":
    case "paused_manual":
      return "paused";
    case "idle":
    default:
      return "idle";
  }
}

export function getHaloFromTimerState(
  visualState: StudyTimerVisualState
): FocusHalo {
  switch (visualState) {
    case "paused_distraction":
      return "red";
    case "paused_manual":
    case "break":
      return "yellow";
    case "idle":
    case "focus":
    default:
      return "green";
  }
}

export function selectTimerTechnique(
  state: StudyTimerState,
  technique: StudyTechnique
): StudyTimerState {
  if (state.technique === technique && state.visualState === "idle") {
    return state;
  }
  return createInitialTimerState(technique);
}

export function startFocusBlock(
  state: StudyTimerState,
  nowMs: number = Date.now()
): StudyTimerState {
  const def = STUDY_TECHNIQUES[state.technique];
  const isResuming =
    state.visualState === "paused_manual" ||
    state.visualState === "paused_distraction";

  const nextDisplayMs = isResuming
    ? state.displayMs
    : getInitialDisplayMs(state.technique);

  const nextFocusedMs = isResuming ? state.focusedMs : 0;
  const nextPhaseEndsAt =
    def.mode === "countdown"
      ? new Date(nowMs + Math.max(0, nextDisplayMs)).toISOString()
      : null;

  return {
    technique: state.technique,
    visualState: "focus",
    displayMs: nextDisplayMs,
    focusedMs: nextFocusedMs,
    focusedSeconds: Math.floor(nextFocusedMs / 1000),
    phaseEndsAt: nextPhaseEndsAt,
  };
}

export function pauseFocusManual(state: StudyTimerState): StudyTimerState {
  if (state.visualState !== "focus") {
    return state;
  }
  return {
    ...state,
    visualState: "paused_manual",
    phaseEndsAt: null,
  };
}

export function pauseFocusDistraction(
  state: StudyTimerState
): StudyTimerState {
  if (state.visualState !== "focus") {
    return state;
  }
  return {
    ...state,
    visualState: "paused_distraction",
    phaseEndsAt: null,
  };
}

export function startBreakBlock(
  state: StudyTimerState,
  nowMs: number = Date.now()
): StudyTimerState {
  const breakMs = STUDY_TECHNIQUES[state.technique].breakSeconds * 1000;
  return {
    ...state,
    visualState: "break",
    displayMs: breakMs,
    phaseEndsAt: new Date(nowMs + breakMs).toISOString(),
  };
}

export function resetTimer(state: StudyTimerState): StudyTimerState {
  return createInitialTimerState(state.technique);
}

export interface TimerTickResult {
  state: StudyTimerState;
  completedFocusBlock: boolean;
  completedBreakBlock: boolean;
}

export function tickTimer(
  state: StudyTimerState,
  elapsedDeltaMs: number,
  nowMs: number = Date.now()
): TimerTickResult {
  const delta = Math.max(0, elapsedDeltaMs);
  if (delta === 0) {
    return {
      state,
      completedFocusBlock: false,
      completedBreakBlock: false,
    };
  }

  const def = STUDY_TECHNIQUES[state.technique];

  if (state.visualState === "focus") {
    const nextFocusedMs = state.focusedMs + delta;
    const nextFocusedSeconds = Math.floor(nextFocusedMs / 1000);

    if (def.mode === "countdown") {
      const nextDisplayMs = Math.max(0, state.displayMs - delta);
      if (nextDisplayMs === 0) {
        const breakState = startBreakBlock(
          {
            ...state,
            focusedMs: nextFocusedMs,
            focusedSeconds: nextFocusedSeconds,
          },
          nowMs
        );
        return {
          state: breakState,
          completedFocusBlock: true,
          completedBreakBlock: false,
        };
      }
      return {
        state: {
          ...state,
          displayMs: nextDisplayMs,
          focusedMs: nextFocusedMs,
          focusedSeconds: nextFocusedSeconds,
        },
        completedFocusBlock: false,
        completedBreakBlock: false,
      };
    }

    return {
      state: {
        ...state,
        displayMs: state.displayMs + delta,
        focusedMs: nextFocusedMs,
        focusedSeconds: nextFocusedSeconds,
      },
      completedFocusBlock: false,
      completedBreakBlock: false,
    };
  }

  if (state.visualState === "break") {
    const nextDisplayMs = Math.max(0, state.displayMs - delta);
    if (nextDisplayMs === 0) {
      return {
        state: {
          ...state,
          visualState: "idle",
          displayMs: getInitialDisplayMs(state.technique),
          phaseEndsAt: null,
        },
        completedFocusBlock: false,
        completedBreakBlock: true,
      };
    }
    return {
      state: {
        ...state,
        displayMs: nextDisplayMs,
      },
      completedFocusBlock: false,
      completedBreakBlock: false,
    };
  }

  return {
    state,
    completedFocusBlock: false,
    completedBreakBlock: false,
  };
}

export function buildTimerSyncPayload(
  hostId: string,
  state: StudyTimerState
): TimerSyncPayload | null {
  if (state.visualState === "idle") {
    return null;
  }

  const phase: TimerSyncPayload["phase"] =
    state.visualState === "focus"
      ? "focus"
      : state.visualState === "break"
        ? "break"
        : "paused";

  return {
    hostId,
    technique: state.technique,
    phase,
    phaseEndsAt: state.phaseEndsAt,
    remainingMs: Math.max(0, Math.round(state.displayMs)),
  };
}

export function applyTableTimerSync(
  state: StudyTimerState,
  payload: TimerSyncPayload,
  nowMs: number = Date.now()
): StudyTimerState {
  const def = STUDY_TECHNIQUES[payload.technique];
  let resolvedDisplayMs = Math.max(0, payload.remainingMs);

  if (
    payload.phaseEndsAt &&
    (payload.phase === "break" ||
      (payload.phase === "focus" && def.mode === "countdown"))
  ) {
    const endMs = Date.parse(payload.phaseEndsAt);
    if (Number.isFinite(endMs)) {
      resolvedDisplayMs = Math.max(0, endMs - nowMs);
    }
  }

  const nextVisualState: StudyTimerVisualState =
    payload.phase === "focus"
      ? "focus"
      : payload.phase === "break"
        ? "break"
        : "paused_manual";

  const techniqueChanged = state.technique !== payload.technique;

  return {
    technique: payload.technique,
    visualState: nextVisualState,
    displayMs: resolvedDisplayMs,
    focusedMs: techniqueChanged ? 0 : state.focusedMs,
    focusedSeconds: techniqueChanged ? 0 : state.focusedSeconds,
    phaseEndsAt: payload.phase === "paused" ? null : payload.phaseEndsAt,
  };
}

export function formatTimerClock(ms: number): string {
  const safeTotalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(safeTotalSeconds / 60);
  const seconds = safeTotalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

const DISTRACTION_PENALTY_SECONDS = 60;

/**
 * Compute bounded [0..100] focus score percentage from focused seconds and distraction count.
 */
export function computeFocusScorePct(
  focusedSeconds: number,
  distractionCount: number
): number {
  const safeFocused = Math.max(0, Math.floor(focusedSeconds));
  if (safeFocused === 0) {
    return 0;
  }
  const safeDistractions = Math.max(0, Math.floor(distractionCount));
  if (safeDistractions === 0) {
    return 100;
  }

  const ratio =
    safeFocused /
    (safeFocused + safeDistractions * DISTRACTION_PENALTY_SECONDS);
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}

export function getUtcDateString(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getPreviousUtcDateString(utcDate: string): string | null {
  const parsed = Date.parse(`${utcDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Update daily UTC study streak when ending a session:
 * - No focused time: preserves existing streak & date.
 * - Same UTC day: idempotent (keeps existing streak, minimum 1).
 * - Yesterday UTC: increments streak by 1.
 * - Null or gap > 1 day: resets streak to 1.
 */
export function computeStreakUpdate(input: {
  currentStreakDays: number;
  lastStudyDate: string | null;
  focusedSeconds: number;
  now?: Date;
}): {
  currentStreakDays: number;
  lastStudyDate: string | null;
} {
  const safeStreak = Math.max(0, Math.floor(input.currentStreakDays || 0));
  const safeFocused = Math.max(0, Math.floor(input.focusedSeconds || 0));

  if (safeFocused <= 0) {
    return {
      currentStreakDays: safeStreak,
      lastStudyDate: input.lastStudyDate,
    };
  }

  const todayUtc = getUtcDateString(input.now);
  if (input.lastStudyDate === todayUtc) {
    return {
      currentStreakDays: Math.max(1, safeStreak),
      lastStudyDate: todayUtc,
    };
  }

  const yesterdayUtc = getPreviousUtcDateString(todayUtc);
  if (yesterdayUtc && input.lastStudyDate === yesterdayUtc) {
    return {
      currentStreakDays: safeStreak + 1,
      lastStudyDate: todayUtc,
    };
  }

  return {
    currentStreakDays: 1,
    lastStudyDate: todayUtc,
  };
}
