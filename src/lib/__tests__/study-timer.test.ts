import { describe, expect, it } from "vitest";
import {
  applyTableTimerSync,
  buildTimerSyncPayload,
  computeFocusScorePct,
  computeStreakUpdate,
  createInitialTimerState,
  formatTimerClock,
  getHaloFromTimerState,
  pauseFocusDistraction,
  pauseFocusManual,
  resetTimer,
  selectTimerTechnique,
  startBreakBlock,
  startFocusBlock,
  STUDY_TECHNIQUES,
  tickTimer,
} from "@/lib/study-timer";

describe("study-timer state machine", () => {
  it("supports countdown (Pomodoro 25/5, Deep Work 50/10) and count-up (Feynman, Flowtime) techniques", () => {
    const pomo = createInitialTimerState("pomodoro");
    expect(pomo.displayMs).toBe(25 * 60 * 1000);
    expect(pomo.visualState).toBe("idle");
    expect(getHaloFromTimerState(pomo.visualState)).toBe("green");

    const deep = selectTimerTechnique(pomo, "deep_work");
    expect(deep.displayMs).toBe(50 * 60 * 1000);
    expect(STUDY_TECHNIQUES.deep_work.breakSeconds).toBe(600);

    const feynman = selectTimerTechnique(deep, "feynman");
    expect(feynman.displayMs).toBe(0);
    expect(STUDY_TECHNIQUES.feynman.mode).toBe("countup");

    const flow = selectTimerTechnique(feynman, "flowtime");
    expect(flow.displayMs).toBe(0);
    expect(STUDY_TECHNIQUES.flowtime.mode).toBe("countup");
  });

  it("transitions idle -> focus -> paused_manual (yellow) -> focus -> break (yellow) -> idle", () => {
    const now = Date.UTC(2026, 10, 26, 12, 0, 0);
    let state = createInitialTimerState("pomodoro");

    state = startFocusBlock(state, now);
    expect(state.visualState).toBe("focus");
    expect(getHaloFromTimerState(state.visualState)).toBe("green");
    expect(state.phaseEndsAt).toBe(new Date(now + 25 * 60 * 1000).toISOString());

    const tick1 = tickTimer(state, 5000, now + 5000);
    state = tick1.state;
    expect(state.focusedSeconds).toBe(5);
    expect(state.displayMs).toBe(25 * 60 * 1000 - 5000);

    state = pauseFocusManual(state);
    expect(state.visualState).toBe("paused_manual");
    expect(getHaloFromTimerState(state.visualState)).toBe("yellow");
    expect(state.phaseEndsAt).toBeNull();

    // Resuming preserves remaining displayMs and accumulated focusedSeconds
    state = startFocusBlock(state, now + 10000);
    expect(state.visualState).toBe("focus");
    expect(state.focusedSeconds).toBe(5);
    expect(state.displayMs).toBe(25 * 60 * 1000 - 5000);

    // Exhausting focus countdown auto-transitions to break (yellow)
    const finishFocus = tickTimer(
      state,
      state.displayMs,
      now + 25 * 60 * 1000
    );
    expect(finishFocus.completedFocusBlock).toBe(true);
    expect(finishFocus.state.visualState).toBe("break");
    expect(getHaloFromTimerState(finishFocus.state.visualState)).toBe("yellow");
    expect(finishFocus.state.displayMs).toBe(5 * 60 * 1000);

    // Exhausting break transitions back to idle
    const finishBreak = tickTimer(
      finishFocus.state,
      5 * 60 * 1000,
      now + 30 * 60 * 1000
    );
    expect(finishBreak.completedBreakBlock).toBe(true);
    expect(finishBreak.state.visualState).toBe("idle");
    expect(finishBreak.state.displayMs).toBe(25 * 60 * 1000);
  });

  it("handles distraction pause (red halo), count-up ticking, break start, reset, and table timer sync", () => {
    const now = Date.UTC(2026, 10, 26, 15, 0, 0);
    let flow = startFocusBlock(createInitialTimerState("flowtime"), now);
    flow = tickTimer(flow, 125_000, now + 125_000).state;
    expect(flow.displayMs).toBe(125_000);
    expect(flow.focusedSeconds).toBe(125);
    expect(formatTimerClock(flow.displayMs)).toBe("02:05");

    flow = pauseFocusDistraction(flow);
    expect(flow.visualState).toBe("paused_distraction");
    expect(getHaloFromTimerState(flow.visualState)).toBe("red");

    const onBreak = startBreakBlock(flow, now + 130_000);
    expect(onBreak.visualState).toBe("break");
    expect(getHaloFromTimerState(onBreak.visualState)).toBe("yellow");

    const syncPayload = buildTimerSyncPayload("host-1", onBreak);
    expect(syncPayload).not.toBeNull();

    const peerSynced = applyTableTimerSync(
      createInitialTimerState("pomodoro"),
      syncPayload!,
      now + 140_000
    );
    expect(peerSynced.technique).toBe("flowtime");
    expect(peerSynced.visualState).toBe("break");
    expect(peerSynced.displayMs).toBe(5 * 60 * 1000 - 10_000);

    const reset = resetTimer(peerSynced);
    expect(reset.visualState).toBe("idle");
    expect(reset.focusedSeconds).toBe(0);
    expect(reset.displayMs).toBe(0);
  });
});

describe("focus_score_pct and UTC streak helpers", () => {
  it("clamps focus_score_pct strictly to 0..100", () => {
    expect(computeFocusScorePct(0, 0)).toBe(0);
    expect(computeFocusScorePct(-10, 0)).toBe(0);
    expect(computeFocusScorePct(1500, 0)).toBe(100);
    expect(computeFocusScorePct(1500, 1)).toBeGreaterThanOrEqual(90);
    expect(computeFocusScorePct(1500, 1)).toBeLessThanOrEqual(100);
    expect(computeFocusScorePct(10, 500)).toBeGreaterThanOrEqual(0);
    expect(computeFocusScorePct(10, 500)).toBeLessThan(5);
  });

  it("handles streak start, consecutive-day increment, same-day idempotency, zero-focus no-op, and gap reset", () => {
    const day26 = new Date("2026-11-26T18:00:00.000Z");

    // Zero focused seconds does not modify streak
    expect(
      computeStreakUpdate({
        currentStreakDays: 3,
        lastStudyDate: "2026-11-25",
        focusedSeconds: 0,
        now: day26,
      })
    ).toEqual({
      currentStreakDays: 3,
      lastStudyDate: "2026-11-25",
    });

    // First-ever session sets streak to 1
    expect(
      computeStreakUpdate({
        currentStreakDays: 0,
        lastStudyDate: null,
        focusedSeconds: 600,
        now: day26,
      })
    ).toEqual({
      currentStreakDays: 1,
      lastStudyDate: "2026-11-26",
    });

    // Consecutive UTC day increments streak
    expect(
      computeStreakUpdate({
        currentStreakDays: 4,
        lastStudyDate: "2026-11-25",
        focusedSeconds: 900,
        now: day26,
      })
    ).toEqual({
      currentStreakDays: 5,
      lastStudyDate: "2026-11-26",
    });

    // Same UTC day is idempotent
    expect(
      computeStreakUpdate({
        currentStreakDays: 5,
        lastStudyDate: "2026-11-26",
        focusedSeconds: 300,
        now: day26,
      })
    ).toEqual({
      currentStreakDays: 5,
      lastStudyDate: "2026-11-26",
    });

    // Missed day resets streak to 1
    expect(
      computeStreakUpdate({
        currentStreakDays: 9,
        lastStudyDate: "2026-11-24",
        focusedSeconds: 450,
        now: day26,
      })
    ).toEqual({
      currentStreakDays: 1,
      lastStudyDate: "2026-11-26",
    });
  });
});
