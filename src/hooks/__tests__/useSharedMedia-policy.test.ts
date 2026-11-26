import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSharedMedia } from "@/hooks/useSharedMedia";

function createMockTrack(id: string) {
  const track = {
    id,
    kind: "video",
    readyState: "live" as MediaStreamTrackState,
    stop: vi.fn(() => {
      track.readyState = "ended";
    }),
    clone: vi.fn(),
    addEventListener: vi.fn(),
  };
  return track;
}

describe("useSharedMedia Two-Wing, track.clone(), and StrictMode lifecycle policy", () => {
  const originalMediaDevices = navigator.mediaDevices;

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it("never clones baseVideoTrack in General Study silent rooms (allowAudioVideo === false)", async () => {
    const baseTrack = createMockTrack("base-track-1");
    const baseStream = {
      getTracks: () => [baseTrack],
      getVideoTracks: () => [baseTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi.fn(async () => baseStream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    const { result, unmount } = renderHook(() =>
      useSharedMedia({ allowAudioVideo: false, autoStart: true })
    );

    await waitFor(() => expect(result.current.cameraStatus).toBe("active"));
    expect(getUserMedia).toHaveBeenCalledTimes(1);

    let cloned: MediaStreamTrack | null = null;
    act(() => {
      cloned = result.current.cloneVideoTrackForCall();
    });

    expect(cloned).toBeNull();
    expect(baseTrack.clone).not.toHaveBeenCalled();

    unmount();
    expect(baseTrack.stop).toHaveBeenCalledTimes(1);
  });

  it("clones baseVideoTrack in Topic A/V rooms and leaves base track alive on Stand Up", async () => {
    const clonedTrack = createMockTrack("cloned-track-1");
    const baseTrack = createMockTrack("base-track-2");
    baseTrack.clone.mockReturnValue(clonedTrack);

    const baseStream = {
      getTracks: () => [baseTrack],
      getVideoTracks: () => [baseTrack],
    } as unknown as MediaStream;

    const getUserMedia = vi.fn(async () => baseStream);
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    const { result } = renderHook(() =>
      useSharedMedia({ allowAudioVideo: true, autoStart: true })
    );

    await waitFor(() => expect(result.current.cameraStatus).toBe("active"));

    let returnedTrack: MediaStreamTrack | null = null;
    act(() => {
      returnedTrack = result.current.cloneVideoTrackForCall();
    });

    expect(baseTrack.clone).toHaveBeenCalledTimes(1);
    expect(returnedTrack).toBe(clonedTrack);

    // Stand Up stops ONLY the cloned track; base track stays live for CV
    act(() => {
      result.current.releaseClonedVideoTrack();
    });

    expect(clonedTrack.stop).toHaveBeenCalledTimes(1);
    expect(baseTrack.stop).not.toHaveBeenCalled();
    expect(baseTrack.readyState).toBe("live");

    // Leave Room stops the base track so camera LED turns off
    act(() => {
      result.current.stopAllMedia();
    });

    expect(baseTrack.stop).toHaveBeenCalledTimes(1);
    expect(result.current.cameraStatus).toBe("stopped");
  });

  it("stops orphaned MediaStream tracks if getUserMedia resolves after unmount (StrictMode race)", async () => {
    const lateTrack = createMockTrack("late-track-1");
    const lateStream = {
      getTracks: () => [lateTrack],
      getVideoTracks: () => [lateTrack],
    } as unknown as MediaStream;

    let resolveGetUserMedia!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolveGetUserMedia = resolve;
        })
    );

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    const { result, unmount } = renderHook(() =>
      useSharedMedia({ allowAudioVideo: true, autoStart: true })
    );

    expect(result.current.cameraStatus).toBe("requesting");

    // Unmount before getUserMedia resolves
    unmount();

    // Now resolve getUserMedia — hook must immediately stop all tracks on the orphaned stream
    await act(async () => {
      resolveGetUserMedia(lateStream);
      await Promise.resolve();
    });

    expect(lateTrack.stop).toHaveBeenCalledTimes(1);
    expect(lateTrack.readyState).toBe("ended");
  });

  it("surfaces error name/message on denial and recovers cleanly on Enable Camera retry", async () => {
    const recoveredTrack = createMockTrack("recovered-track-1");
    const recoveredStream = {
      getTracks: () => [recoveredTrack],
      getVideoTracks: () => [recoveredTrack],
    } as unknown as MediaStream;

    const deniedErr = new Error("Permission dismissed");
    deniedErr.name = "NotAllowedError";

    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(deniedErr)
      .mockResolvedValueOnce(recoveredStream);

    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia },
      configurable: true,
    });

    const { result, unmount } = renderHook(() =>
      useSharedMedia({ allowAudioVideo: true, autoStart: true })
    );

    await waitFor(() => expect(result.current.cameraStatus).toBe("error"));
    expect(result.current.errorMessage).toContain("NotAllowedError");

    await act(async () => {
      await result.current.requestCamera();
    });

    expect(result.current.cameraStatus).toBe("active");
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.baseStream).toBe(recoveredStream);

    // Also verify pagehide stops active tracks
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(recoveredTrack.stop).toHaveBeenCalledTimes(1);
    expect(result.current.cameraStatus).toBe("stopped");

    unmount();
  });
});
