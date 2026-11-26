/**
 * Play a soft two-tone Web Audio API chime (440 Hz -> 330 Hz, ~180 ms)
 * when a distraction triggers. Gracefully no-ops if AudioContext is blocked
 * or unavailable (e.g., SSR / headless browsers).
 */
export function playDistractionBeep(): void {
  if (typeof window === "undefined") {
    return;
  }

  const AudioCtx =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;

  if (!AudioCtx) {
    return;
  }

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(440, now);
    oscillator.frequency.exponentialRampToValueAtTime(330, now + 0.16);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(now);
    oscillator.stop(now + 0.19);

    oscillator.onended = () => {
      void ctx.close().catch(() => undefined);
    };
  } catch {
    // Autoplay policy or audio hardware unavailable — non-blocking.
  }
}
