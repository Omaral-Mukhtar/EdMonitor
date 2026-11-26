import type { DistractionReason, TimerPhase } from "@/types/domain";

export const DEFAULT_DISTRACTION_THRESHOLD_MS = 3000;

export type FocusSampleKind = "focused" | "distracted";

export interface FocusSample {
  kind: FocusSampleKind;
  reason?: DistractionReason;
  nowMs: number;
  timerPhase: TimerPhase;
}

export interface FocusGraceState {
  status: "focused" | "pending_distraction" | "distracted";
  pendingReason: DistractionReason | null;
  distractionStartedAtMs: number | null;
  alertedAtMs: number | null;
  lastAlertedAtMs: number | null;
}

export interface FocusGraceTransition {
  state: FocusGraceState;
  isDistracted: boolean;
  shouldTriggerAlert: boolean;
  shouldRecover: boolean;
  reason: DistractionReason | null;
  durationMs: number;
}

export interface FocusGraceOptions {
  thresholdMs?: number;
  reAlertCooldownMs?: number;
}

export function createInitialFocusGraceState(): FocusGraceState {
  return {
    status: "focused",
    pendingReason: null,
    distractionStartedAtMs: null,
    alertedAtMs: null,
    lastAlertedAtMs: null,
  };
}

/**
 * Pure 3-second continuous distraction grace state machine.
 * - Ignores transient distractions (< 3000 ms).
 * - Fires `shouldTriggerAlert: true` once when continuous distraction >= 3000 ms.
 * - Never emits duplicate alerts while already in `distracted` state.
 * - Resets cleanly on `focused` sample or during `break` / `paused` exemption.
 */
export function stepFocusGrace(
  prev: FocusGraceState,
  sample: FocusSample,
  options: FocusGraceOptions = {}
): FocusGraceTransition {
  const thresholdMs = options.thresholdMs ?? DEFAULT_DISTRACTION_THRESHOLD_MS;
  const reAlertCooldownMs = options.reAlertCooldownMs ?? 0;

  // Scheduled break (yellow halo) suppresses all distraction detection and clears pending timers.
  if (sample.timerPhase === "break") {
    const wasDistracted = prev.status === "distracted";
    return {
      state: {
        status: "focused",
        pendingReason: null,
        distractionStartedAtMs: null,
        alertedAtMs: null,
        lastAlertedAtMs: prev.lastAlertedAtMs,
      },
      isDistracted: false,
      shouldTriggerAlert: false,
      shouldRecover: wasDistracted,
      reason: null,
      durationMs: 0,
    };
  }

  if (sample.kind === "focused") {
    const wasDistracted = prev.status === "distracted";
    if (
      prev.status === "focused" &&
      prev.distractionStartedAtMs === null &&
      prev.pendingReason === null
    ) {
      return {
        state: prev,
        isDistracted: false,
        shouldTriggerAlert: false,
        shouldRecover: false,
        reason: null,
        durationMs: 0,
      };
    }

    return {
      state: {
        status: "focused",
        pendingReason: null,
        distractionStartedAtMs: null,
        alertedAtMs: null,
        lastAlertedAtMs: prev.lastAlertedAtMs,
      },
      isDistracted: false,
      shouldTriggerAlert: false,
      shouldRecover: wasDistracted,
      reason: null,
      durationMs: 0,
    };
  }

  const activeReason: DistractionReason = sample.reason ?? "look_away";

  // Already alerted for this continuous distraction episode — do not fire duplicates.
  if (prev.status === "distracted") {
    const startedAt = prev.distractionStartedAtMs ?? sample.nowMs;
    return {
      state: {
        ...prev,
        pendingReason: activeReason,
      },
      isDistracted: true,
      shouldTriggerAlert: false,
      shouldRecover: false,
      reason: activeReason,
      durationMs: Math.max(0, Math.round(sample.nowMs - startedAt)),
    };
  }

  const startedAt =
    prev.status === "pending_distraction" && prev.distractionStartedAtMs !== null
      ? prev.distractionStartedAtMs
      : sample.nowMs;

  const elapsedMs = Math.max(0, Math.round(sample.nowMs - startedAt));

  if (elapsedMs >= thresholdMs) {
    const inCooldown =
      reAlertCooldownMs > 0 &&
      prev.lastAlertedAtMs !== null &&
      sample.nowMs - prev.lastAlertedAtMs < reAlertCooldownMs;

    if (inCooldown) {
      return {
        state: {
          status: "pending_distraction",
          pendingReason: activeReason,
          distractionStartedAtMs: startedAt,
          alertedAtMs: null,
          lastAlertedAtMs: prev.lastAlertedAtMs,
        },
        isDistracted: false,
        shouldTriggerAlert: false,
        shouldRecover: false,
        reason: activeReason,
        durationMs: elapsedMs,
      };
    }

    return {
      state: {
        status: "distracted",
        pendingReason: activeReason,
        distractionStartedAtMs: startedAt,
        alertedAtMs: sample.nowMs,
        lastAlertedAtMs: sample.nowMs,
      },
      isDistracted: true,
      shouldTriggerAlert: true,
      shouldRecover: false,
      reason: activeReason,
      durationMs: elapsedMs,
    };
  }

  return {
    state: {
      status: "pending_distraction",
      pendingReason: activeReason,
      distractionStartedAtMs: startedAt,
      alertedAtMs: null,
      lastAlertedAtMs: prev.lastAlertedAtMs,
    },
    isDistracted: false,
    shouldTriggerAlert: false,
    shouldRecover: false,
    reason: activeReason,
    durationMs: elapsedMs,
  };
}
