import { describe, expect, it } from "vitest";
import {
  createInitialFocusGraceState,
  stepFocusGrace,
} from "@/lib/focus-grace";

describe("focus-grace state machine", () => {
  it("ignores transient distractions shorter than 3000 ms and resets on focused", () => {
    let state = createInitialFocusGraceState();

    const t0 = stepFocusGrace(state, {
      kind: "distracted",
      reason: "look_away",
      nowMs: 1000,
      timerPhase: "focus",
    });
    state = t0.state;
    expect(t0.isDistracted).toBe(false);
    expect(t0.shouldTriggerAlert).toBe(false);

    // Still < 3000 ms at t = 3999 ms
    const t1 = stepFocusGrace(state, {
      kind: "distracted",
      reason: "look_away",
      nowMs: 3999,
      timerPhase: "focus",
    });
    state = t1.state;
    expect(t1.isDistracted).toBe(false);
    expect(t1.shouldTriggerAlert).toBe(false);

    // User looks back at t = 4000 ms -> resets grace timer
    const focused = stepFocusGrace(state, {
      kind: "focused",
      nowMs: 4000,
      timerPhase: "focus",
    });
    state = focused.state;
    expect(focused.isDistracted).toBe(false);
    expect(focused.shouldTriggerAlert).toBe(false);
    expect(state.status).toBe("focused");
    expect(state.distractionStartedAtMs).toBeNull();

    // New distraction starting at t = 4200 ms needs a fresh 3000 ms
    const newStart = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 4200,
      timerPhase: "focus",
    });
    expect(newStart.shouldTriggerAlert).toBe(false);
    expect(newStart.isDistracted).toBe(false);
  });

  it("triggers once at >= 3000 ms and does not emit duplicate alerts while distracted", () => {
    let state = createInitialFocusGraceState();

    state = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 10_000,
      timerPhase: "focus",
    }).state;

    const trigger = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 13_000,
      timerPhase: "focus",
    });
    state = trigger.state;
    expect(trigger.shouldTriggerAlert).toBe(true);
    expect(trigger.isDistracted).toBe(true);
    expect(trigger.reason).toBe("cell_phone");
    expect(trigger.durationMs).toBe(3000);

    // Subsequent samples during same distraction episode must not re-trigger
    const repeat1 = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 13_500,
      timerPhase: "focus",
    });
    state = repeat1.state;
    expect(repeat1.isDistracted).toBe(true);
    expect(repeat1.shouldTriggerAlert).toBe(false);

    const repeat2 = stepFocusGrace(state, {
      kind: "distracted",
      reason: "face_absent",
      nowMs: 16_000,
      timerPhase: "focus",
    });
    expect(repeat2.isDistracted).toBe(true);
    expect(repeat2.shouldTriggerAlert).toBe(false);
  });

  it("recovers immediately on focused and can trigger again after a fresh 3000 ms", () => {
    let state = createInitialFocusGraceState();

    state = stepFocusGrace(state, {
      kind: "distracted",
      reason: "face_absent",
      nowMs: 1000,
      timerPhase: "focus",
    }).state;

    const firstAlert = stepFocusGrace(state, {
      kind: "distracted",
      reason: "face_absent",
      nowMs: 4200,
      timerPhase: "focus",
    });
    state = firstAlert.state;
    expect(firstAlert.shouldTriggerAlert).toBe(true);

    const recovered = stepFocusGrace(state, {
      kind: "focused",
      nowMs: 5000,
      timerPhase: "focus",
    });
    state = recovered.state;
    expect(recovered.isDistracted).toBe(false);
    expect(recovered.shouldRecover).toBe(true);

    // Second distraction episode
    state = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 6000,
      timerPhase: "focus",
    }).state;

    const secondAlert = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 9100,
      timerPhase: "focus",
    });
    expect(secondAlert.shouldTriggerAlert).toBe(true);
    expect(secondAlert.isDistracted).toBe(true);
    expect(secondAlert.reason).toBe("cell_phone");
  });

  it("suppresses alerts and clears pending distraction during break mode", () => {
    let state = createInitialFocusGraceState();

    state = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 1000,
      timerPhase: "focus",
    }).state;
    expect(state.status).toBe("pending_distraction");

    // Break starts at t = 4500 ms (would otherwise cross 3000 ms)
    const duringBreak = stepFocusGrace(state, {
      kind: "distracted",
      reason: "cell_phone",
      nowMs: 4500,
      timerPhase: "break",
    });
    expect(duringBreak.isDistracted).toBe(false);
    expect(duringBreak.shouldTriggerAlert).toBe(false);
    expect(duringBreak.state.status).toBe("focused");
    expect(duringBreak.state.distractionStartedAtMs).toBeNull();
  });
});
