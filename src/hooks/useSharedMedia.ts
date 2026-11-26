"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type SharedCameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "error"
  | "stopped";

interface UseSharedMediaOptions {
  allowAudioVideo: boolean;
  autoStart?: boolean;
}

export interface SharedMediaController {
  cameraStatus: SharedCameraStatus;
  errorMessage: string | null;
  baseStream: MediaStream | null;
  registerVideoElement: (el: HTMLVideoElement | null) => void;
  getVideoElement: () => HTMLVideoElement | null;
  requestCamera: () => Promise<MediaStream | null>;
  cloneVideoTrackForCall: () => MediaStreamTrack | null;
  releaseClonedVideoTrack: () => void;
  stopAllMedia: () => void;
}

function stopMediaStreamTracks(stream: MediaStream | null | undefined): void {
  if (!stream) {
    return;
  }
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // Ignore already-stopped tracks
    }
  }
}

function formatCameraError(err: unknown): string {
  if (err instanceof Error) {
    const name = err.name?.trim();
    const message = err.message?.trim();
    if (name && message) {
      return `${name}: ${message}`;
    }
    if (name) {
      return name;
    }
    if (message) {
      return message;
    }
  }
  return "CameraError: Unable to access camera.";
}

/**
 * Acquires a single base webcam MediaStream (`video: true, audio: false`) per room entry
 * for the client-side CV Focus Guard, and clones ONLY the video track (`baseVideoTrack.clone()`)
 * for LiveKit when `allowAudioVideo === true` and seated at a table.
 *
 * Guarantees:
 * - Tracks all acquired streams & cloned tracks in refs so cleanup never reads stale state.
 * - Guards against StrictMode / unmount / superseded-request races using `mountedRef` + `requestIdRef`.
 * - Stops all base + cloned tracks on `Leave Room`, `<- Campus`, unmount, `pagehide`, and `beforeunload`.
 */
export function useSharedMedia({
  allowAudioVideo,
  autoStart = true,
}: UseSharedMediaOptions): SharedMediaController {
  const [cameraStatus, setCameraStatus] = useState<SharedCameraStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [baseStream, setBaseStream] = useState<MediaStream | null>(null);

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const baseStreamRef = useRef<MediaStream | null>(null);
  const allAcquiredStreamsRef = useRef<Set<MediaStream>>(new Set());
  const clonedVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const allClonedTracksRef = useRef<Set<MediaStreamTrack>>(new Set());
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const attachStreamToHiddenVideo = useCallback((stream: MediaStream | null) => {
    const videoEl = videoElRef.current;
    if (!videoEl) {
      return;
    }
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.autoplay = true;

    if (videoEl.srcObject !== stream) {
      videoEl.srcObject = stream;
    }
    if (stream) {
      void videoEl.play().catch(() => undefined);
    }
  }, []);

  const registerVideoElement = useCallback(
    (el: HTMLVideoElement | null) => {
      videoElRef.current = el;
      if (el && baseStreamRef.current) {
        attachStreamToHiddenVideo(baseStreamRef.current);
      }
    },
    [attachStreamToHiddenVideo]
  );

  const getVideoElement = useCallback(() => videoElRef.current, []);

  const releaseClonedVideoTrack = useCallback(() => {
    const currentClone = clonedVideoTrackRef.current;
    if (currentClone) {
      allClonedTracksRef.current.add(currentClone);
      clonedVideoTrackRef.current = null;
    }
    for (const track of allClonedTracksRef.current) {
      try {
        track.stop();
      } catch {
        // Ignore already-stopped tracks
      }
    }
    allClonedTracksRef.current.clear();
  }, []);

  const stopAllMedia = useCallback(() => {
    // Invalidate any in-flight getUserMedia request so orphaned streams stop immediately on resolve.
    requestIdRef.current += 1;

    releaseClonedVideoTrack();

    if (baseStreamRef.current) {
      allAcquiredStreamsRef.current.add(baseStreamRef.current);
      baseStreamRef.current = null;
    }

    for (const stream of allAcquiredStreamsRef.current) {
      stopMediaStreamTracks(stream);
    }
    allAcquiredStreamsRef.current.clear();

    attachStreamToHiddenVideo(null);
    if (mountedRef.current) {
      setBaseStream(null);
      setCameraStatus("stopped");
    }
  }, [attachStreamToHiddenVideo, releaseClonedVideoTrack]);

  const requestCamera = useCallback(async (): Promise<MediaStream | null> => {
    const existing = baseStreamRef.current;
    if (
      existing &&
      existing.getVideoTracks().some((track) => track.readyState === "live")
    ) {
      attachStreamToHiddenVideo(existing);
      if (mountedRef.current) {
        setBaseStream(existing);
        setCameraStatus("active");
        setErrorMessage(null);
      }
      return existing;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      if (mountedRef.current) {
        setCameraStatus("error");
        setErrorMessage(
          "NotSupportedError: Camera API is unavailable in this browser."
        );
      }
      return null;
    }

    const requestId = ++requestIdRef.current;
    if (mountedRef.current) {
      setCameraStatus("requesting");
      setErrorMessage(null);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });

      // Race guard: component unmounted or superseded by newer request/stopAllMedia().
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stopMediaStreamTracks(stream);
        return null;
      }

      if (baseStreamRef.current && baseStreamRef.current !== stream) {
        stopMediaStreamTracks(baseStreamRef.current);
      }

      allAcquiredStreamsRef.current.add(stream);
      baseStreamRef.current = stream;
      attachStreamToHiddenVideo(stream);

      const primaryVideoTrack = stream.getVideoTracks()[0];
      if (primaryVideoTrack && typeof primaryVideoTrack.addEventListener === "function") {
        primaryVideoTrack.addEventListener(
          "ended",
          () => {
            if (mountedRef.current && baseStreamRef.current === stream) {
              setCameraStatus("error");
              setErrorMessage("TrackEnded: Camera stream ended unexpectedly.");
              setBaseStream(null);
              baseStreamRef.current = null;
            }
          },
          { once: true }
        );
      }

      setBaseStream(stream);
      setErrorMessage(null);
      setCameraStatus("active");
      return stream;
    } catch (err: unknown) {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return null;
      }
      setCameraStatus("error");
      setErrorMessage(formatCameraError(err));
      return null;
    }
  }, [attachStreamToHiddenVideo]);

  const cloneVideoTrackForCall = useCallback((): MediaStreamTrack | null => {
    // Enforce Two-Wing policy: never clone base video track in General Study silent rooms.
    if (!allowAudioVideo) {
      return null;
    }

    const existingClone = clonedVideoTrackRef.current;
    if (existingClone && existingClone.readyState === "live") {
      return existingClone;
    }

    const stream = baseStreamRef.current;
    const baseVideoTrack = stream?.getVideoTracks()[0];
    if (!baseVideoTrack || baseVideoTrack.readyState !== "live") {
      return null;
    }

    const cloned = baseVideoTrack.clone();
    clonedVideoTrackRef.current = cloned;
    allClonedTracksRef.current.add(cloned);
    return cloned;
  }, [allowAudioVideo]);

  // Keep hidden <video> synced if element mounts after baseStream resolves
  useEffect(() => {
    if (baseStream) {
      attachStreamToHiddenVideo(baseStream);
    }
  }, [attachStreamToHiddenVideo, baseStream]);

  useEffect(() => {
    mountedRef.current = true;
    if (autoStart) {
      void requestCamera();
    }

    const handlePageExit = () => {
      stopAllMedia();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", handlePageExit);
      window.addEventListener("beforeunload", handlePageExit);
    }

    return () => {
      mountedRef.current = false;
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", handlePageExit);
        window.removeEventListener("beforeunload", handlePageExit);
      }
      stopAllMedia();
    };
  }, [autoStart, requestCamera, stopAllMedia]);

  return useMemo(
    () => ({
      cameraStatus,
      errorMessage,
      baseStream,
      registerVideoElement,
      getVideoElement,
      requestCamera,
      cloneVideoTrackForCall,
      releaseClonedVideoTrack,
      stopAllMedia,
    }),
    [
      cameraStatus,
      errorMessage,
      baseStream,
      registerVideoElement,
      getVideoElement,
      requestCamera,
      cloneVideoTrackForCall,
      releaseClonedVideoTrack,
      stopAllMedia,
    ]
  );
}
