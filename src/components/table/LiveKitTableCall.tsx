"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  isTrackReference,
  RoomAudioRenderer,
  RoomContext,
  VideoTrack,
  useTracks,
} from "@livekit/components-react";
import {
  ConnectionState,
  LocalVideoTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { MicOff, VideoOff } from "lucide-react";

export type LiveKitCallStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "unconfigured"
  | "error";

interface LiveKitTokenResponse {
  token: string;
  serverUrl: string;
  roomName: string;
  participantIdentity: string;
}

interface LiveKitTableCallProps {
  roomSlug: string;
  tableId: string;
  allowAudioVideo: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  cloneVideoTrackForCall: () => MediaStreamTrack | null;
  releaseClonedVideoTrack: () => void;
  onStatusChange?: (status: LiveKitCallStatus, note?: string | null) => void;
  onMicForceOff?: () => void;
  onCamForceOff?: () => void;
  children?: (videoStrip: React.ReactNode) => React.ReactNode;
}

function TablePeerVideoStrip() {
  const rawTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: false }],
    { onlySubscribed: false }
  );
  const cameraTracks = rawTracks.filter(isTrackReference);

  if (cameraTracks.length === 0) {
    return (
      <div
        data-testid="livekit-empty-strip"
        className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500"
      >
        <VideoOff className="mr-1.5 size-3.5 text-slate-400" />
        <span>No table cameras active yet</span>
      </div>
    );
  }

  return (
    <div
      data-testid="livekit-video-strip"
      className="grid grid-cols-2 gap-2"
    >
      {cameraTracks.map((trackRef) => {
        const identity = trackRef.participant.identity;
        const name =
          trackRef.participant.name ||
          (trackRef.participant.isLocal ? "You" : "Peer");
        const isMuted = !trackRef.participant.isMicrophoneEnabled;

        return (
          <div
            key={`${identity}-${trackRef.source}`}
            className="relative aspect-video overflow-hidden rounded-lg border border-slate-200 bg-slate-900"
          >
            <VideoTrack
              trackRef={trackRef}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded bg-slate-900/75 px-1.5 py-0.5 text-[10px] text-white backdrop-blur-xs">
              <span className="truncate font-medium">
                {trackRef.participant.isLocal ? `${name} (You)` : name}
              </span>
              {isMuted ? (
                <MicOff className="size-2.5 shrink-0 text-slate-300" />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Manages the table-scoped LiveKit Cloud WebRTC connection strictly inside
 * Topic A/V rooms (`allowAudioVideo === true`) while seated at a table.
 *
 * Uses `cloneVideoTrackForCall()` (`baseVideoTrack.clone()`) so disconnecting on
 * `Stand Up` stops only the cloned track and never interrupts the base CV stream.
 */
export function LiveKitTableCall({
  roomSlug,
  tableId,
  allowAudioVideo,
  isMicOn,
  isCamOn,
  cloneVideoTrackForCall,
  releaseClonedVideoTrack,
  onStatusChange,
  onMicForceOff,
  onCamForceOff,
  children,
}: LiveKitTableCallProps) {
  const [room] = useState<Room>(
    () =>
      new Room({
        adaptiveStream: true,
        dynacast: true,
      })
  );
  const [connected, setConnected] = useState(false);

  const publishedVideoTrackRef = useRef<LocalVideoTrack | null>(null);
  const cloneFnRef = useRef(cloneVideoTrackForCall);
  const releaseFnRef = useRef(releaseClonedVideoTrack);
  const onStatusRef = useRef(onStatusChange);
  const onMicForceOffRef = useRef(onMicForceOff);
  const onCamForceOffRef = useRef(onCamForceOff);

  useEffect(() => {
    cloneFnRef.current = cloneVideoTrackForCall;
    releaseFnRef.current = releaseClonedVideoTrack;
    onStatusRef.current = onStatusChange;
    onMicForceOffRef.current = onMicForceOff;
    onCamForceOffRef.current = onCamForceOff;
  }, [
    cloneVideoTrackForCall,
    releaseClonedVideoTrack,
    onStatusChange,
    onMicForceOff,
    onCamForceOff,
  ]);

  // Connect to LiveKit room `${roomSlug}:${tableId}` only when allowAudioVideo === true
  useEffect(() => {
    if (!allowAudioVideo || !tableId) {
      return;
    }

    let cancelled = false;
    onStatusRef.current?.("connecting", null);

    const handleDisconnected = () => {
      if (!cancelled) {
        setConnected(false);
        onStatusRef.current?.("idle", null);
      }
    };

    const handleConnected = () => {
      if (!cancelled) {
        setConnected(true);
        onStatusRef.current?.("connected", null);
      }
    };

    room.on(RoomEvent.Connected, handleConnected);
    room.on(RoomEvent.Disconnected, handleDisconnected);

    const connectToTable = async () => {
      try {
        const response = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomSlug, tableId }),
        });

        if (!response.ok) {
          const errJson = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          if (!cancelled) {
            const msg = errJson?.message ?? "LiveKit unavailable";
            const isUnconfigured =
              response.status === 500 &&
              msg.toLowerCase().includes("not configured");
            onStatusRef.current?.(
              isUnconfigured ? "unconfigured" : "error",
              isUnconfigured
                ? "LiveKit keys not configured — Table Chat & timers remain active."
                : msg
            );
          }
          return;
        }

        const data = (await response.json()) as LiveKitTokenResponse;
        if (cancelled) {
          return;
        }

        await room.connect(data.serverUrl, data.token);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        setConnected(room.state === ConnectionState.Connected);
        onStatusRef.current?.("connected", null);
      } catch (err) {
        if (!cancelled) {
          onStatusRef.current?.(
            "error",
            err instanceof Error
              ? err.message
              : "Could not connect to LiveKit call."
          );
        }
      }
    };

    void connectToTable();

    return () => {
      cancelled = true;
      room.off(RoomEvent.Connected, handleConnected);
      room.off(RoomEvent.Disconnected, handleDisconnected);

      const activeLocalVideo = publishedVideoTrackRef.current;
      if (activeLocalVideo) {
        try {
          void room.localParticipant.unpublishTrack(activeLocalVideo);
        } catch {
          // Ignore if already disconnected
        }
        try {
          activeLocalVideo.stop();
        } catch {
          // Ignore
        }
        publishedVideoTrackRef.current = null;
      }

      // Release ONLY the cloned track so the base CV stream keeps running.
      releaseFnRef.current();
      setConnected(false);
      void room.disconnect();
    };
  }, [allowAudioVideo, room, roomSlug, tableId]);

  // Publish / unpublish cloned camera track when `isCamOn` toggles
  useEffect(() => {
    if (!allowAudioVideo || !connected) {
      return;
    }

    let cancelled = false;

    const syncCamera = async () => {
      if (isCamOn) {
        if (publishedVideoTrackRef.current) {
          return;
        }
        const clonedTrack = cloneFnRef.current();
        if (!clonedTrack) {
          if (!cancelled) {
            onCamForceOffRef.current?.();
          }
          return;
        }

        try {
          const localTrack = new LocalVideoTrack(clonedTrack, undefined, false);
          if (cancelled) {
            localTrack.stop();
            releaseFnRef.current();
            return;
          }
          publishedVideoTrackRef.current = localTrack;
          await room.localParticipant.publishTrack(localTrack, {
            source: Track.Source.Camera,
          });
        } catch {
          if (!cancelled) {
            onCamForceOffRef.current?.();
          }
        }
      } else {
        const existing = publishedVideoTrackRef.current;
        if (existing) {
          publishedVideoTrackRef.current = null;
          try {
            await room.localParticipant.unpublishTrack(existing);
          } catch {
            // Ignore
          }
          try {
            existing.stop();
          } catch {
            // Ignore
          }
        }
        releaseFnRef.current();
      }
    };

    void syncCamera();

    return () => {
      cancelled = true;
    };
  }, [allowAudioVideo, connected, isCamOn, room]);

  // Enable / disable microphone independently of the CV video stream
  useEffect(() => {
    if (!allowAudioVideo || !connected) {
      return;
    }

    let cancelled = false;
    void room.localParticipant
      .setMicrophoneEnabled(isMicOn)
      .catch(() => {
        if (!cancelled && isMicOn) {
          onMicForceOffRef.current?.();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [allowAudioVideo, connected, isMicOn, room]);

  const contextValue = useMemo(() => room, [room]);

  if (!allowAudioVideo) {
    return null;
  }

  return (
    <RoomContext.Provider value={contextValue}>
      <RoomAudioRenderer />
      {children ? children(<TablePeerVideoStrip />) : null}
    </RoomContext.Provider>
  );
}
