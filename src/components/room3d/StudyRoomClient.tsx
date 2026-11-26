"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MoreHorizontal,
  Users,
  Video,
  VolumeX,
  X,
} from "lucide-react";
import { DistractionAlertBanner } from "@/components/room3d/DistractionAlertBanner";
import { FocusStatusPill } from "@/components/room3d/FocusStatusPill";
import { RoomHudDock } from "@/components/room3d/RoomHudDock";
import { StudyRoomScene } from "@/components/room3d/StudyRoomScene";
import {
  LiveKitTableCall,
  type LiveKitCallStatus,
} from "@/components/table/LiveKitTableCall";
import { StudyTimer } from "@/components/table/StudyTimer";
import { TableChatSheet } from "@/components/table/TableChatSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFocusGuard } from "@/hooks/useFocusGuard";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { useSharedMedia } from "@/hooks/useSharedMedia";
import { useTableBroadcast } from "@/hooks/useTableBroadcast";
import { getCampusZoneById, type CampusRoomConfig } from "@/lib/campus-rooms";
import {
  createInitialTimerState,
  getHaloFromTimerState,
  pauseFocusDistraction,
  visualStateToTimerPhase,
  type StudyTimerState,
} from "@/lib/study-timer";
import {
  AVATAR_COLOR_PRESETS,
  type DistractionReason,
  type TimerSyncPayload,
  type UserProfile,
} from "@/types/domain";
import { cn } from "cn";

interface StudyRoomClientProps {
  room: CampusRoomConfig;
  profile: UserProfile;
}

export function StudyRoomClient({ room, profile }: StudyRoomClientProps) {
  const router = useRouter();
  const zone = getCampusZoneById(room.subject);
  const accentHex = zone?.accentHex ?? "#2563EB";

  const [avatarColor, setAvatarColor] = useState(profile.avatarColor);
  const [timerState, setTimerState] = useState<StudyTimerState>(() =>
    createInitialTimerState("pomodoro")
  );
  const [syncedWithTable, setSyncedWithTable] = useState(false);
  const [distractionCount, setDistractionCount] = useState(0);
  const [distractionBanner, setDistractionBanner] = useState<{
    visible: boolean;
    reason: DistractionReason | null;
  }>({ visible: false, reason: null });

  const [toastDismissed, setToastDismissed] = useState(false);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  // Topic A/V table call & chat state (strictly unused in General Study silent rooms)
  const [isMicOn, setIsMicOn] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [seenMessageCount, setSeenMessageCount] = useState(0);
  const [callStatus, setCallStatus] = useState<LiveKitCallStatus>("idle");
  const [callNote, setCallNote] = useState<string | null>(null);

  const htmlPortalRef = useRef<HTMLDivElement>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const finishSessionHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const resumeTimerHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const timerSyncListenerRef = useRef<
    ((payload: TimerSyncPayload) => void) | null
  >(null);

  const registerFinishHandler = useCallback(
    (handler: (() => Promise<void>) | null) => {
      finishSessionHandlerRef.current = handler;
    },
    []
  );

  const registerResumeHandler = useCallback(
    (handler: (() => Promise<void>) | null) => {
      resumeTimerHandlerRef.current = handler;
    },
    []
  );

  const registerTimerSyncListener = useCallback(
    (listener: ((payload: TimerSyncPayload) => void) | null) => {
      timerSyncListenerRef.current = listener;
    },
    []
  );

  const handleActiveSessionChange = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
  }, []);

  const handleResetDistractionCount = useCallback(() => {
    setDistractionCount(0);
  }, []);

  const timerPhase = visualStateToTimerPhase(timerState.visualState);
  const baseHalo = getHaloFromTimerState(timerState.visualState);

  // Single shared webcam stream for CV Focus Guard + conditional LiveKit clone()
  const {
    cameraStatus,
    errorMessage: cameraErrorMessage,
    registerVideoElement,
    getVideoElement,
    requestCamera,
    cloneVideoTrackForCall,
    releaseClonedVideoTrack,
    stopAllMedia,
  } = useSharedMedia({
    allowAudioVideo: room.allowAudioVideo,
    autoStart: true,
  });

  const handleDistractionTriggered = useCallback(
    (reason: DistractionReason, durationMs: number) => {
      setTimerState((prev) => pauseFocusDistraction(prev));
      setDistractionCount((prev) => prev + 1);
      setDistractionBanner({ visible: true, reason });

      const sessionId = activeSessionIdRef.current;
      if (sessionId) {
        void fetch(`/api/sessions/${sessionId}/distractions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason,
            durationMs,
            triggeredAt: new Date().toISOString(),
          }),
        }).catch(() => undefined);
      }
    },
    []
  );

  const focusGuard = useFocusGuard({
    cameraStatus,
    getVideoElement,
    timerPhase,
    enabled: !isLeaving,
    onDistractionTriggered: handleDistractionTriggered,
  });

  const halo =
    timerState.visualState === "paused_distraction" ||
    (timerState.visualState === "idle" && focusGuard.isCvDistracted)
      ? "red"
      : baseHalo;

  const presence = useRoomPresence({
    roomSlug: room.slug,
    userId: profile.id,
    displayName: profile.displayName,
    isGuest: profile.isGuest,
    avatarColor,
    technique: timerState.technique,
    timerPhase,
    syncedWithTable,
    halo,
  });

  const activeTableId = presence.selfState.tableId;
  const effectiveSyncedWithTable = Boolean(activeTableId) && syncedWithTable;

  // Consolidated single `table:{roomSlug}:{tableId}` channel for timer:sync + Topic chat:message
  const tableBroadcast = useTableBroadcast({
    roomSlug: room.slug,
    tableId: activeTableId,
    allowAudioVideo: room.allowAudioVideo,
    enableTimerSync: effectiveSyncedWithTable,
    userId: profile.id,
    displayName: profile.displayName,
    avatarColor,
    onTimerSync: useCallback((payload: TimerSyncPayload) => {
      timerSyncListenerRef.current?.(payload);
    }, []),
  });

  const resetTableCallState = useCallback(() => {
    setIsMicOn(false);
    setIsCamOn(false);
    setIsChatOpen(false);
    setSeenMessageCount(0);
    setCallStatus("idle");
    setCallNote(null);
    releaseClonedVideoTrack();
  }, [releaseClonedVideoTrack]);

  const handleFloorWalk = useCallback(
    (point: [number, number, number]) => {
      setSyncedWithTable(false);
      resetTableCallState();
      presence.walkTo(point);
    },
    [presence, resetTableCallState]
  );

  const handleStandUp = useCallback(() => {
    setSyncedWithTable(false);
    resetTableCallState();
    presence.standUp();
  }, [presence, resetTableCallState]);

  const handleSelectSeat = useCallback(
    (tableId: string, seatIndex: number) => {
      if (activeTableId && activeTableId !== tableId) {
        setSyncedWithTable(false);
        resetTableCallState();
      }
      presence.sitAtSeat(tableId, seatIndex);
    },
    [activeTableId, presence, resetTableCallState]
  );

  const handleSelectAvatarColor = async (color: string) => {
    setAvatarColor(color);
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: profile.displayName,
          avatarColor: color,
        }),
      });
    } catch {
      // Keep local color optimistic; profile persistence failure is non-blocking.
    }
  };

  const handleLeaveRoom = async () => {
    if (isLeaving) {
      return;
    }
    setIsLeaving(true);
    stopAllMedia();
    try {
      if (finishSessionHandlerRef.current) {
        await finishSessionHandlerRef.current();
      }
      // Allow R3F Canvas and <Html> portals to unmount cleanly before route navigation
      await new Promise((resolve) => setTimeout(resolve, 60));
    } finally {
      router.push("/campus");
    }
  };

  const seatedAtActiveTable = activeTableId
    ? presence.members.filter((m) => m.tableId === activeTableId).length
    : 0;
  const tableLabel = activeTableId
    ? `Table ${activeTableId.replace("table-", "")} · ${seatedAtActiveTable}/${room.seatsPerTable} seated`
    : "Standing · Pick any seat";

  const showFirstVisitorToast =
    presence.isConnected &&
    presence.remoteMembers.length === 0 &&
    !toastDismissed;

  const haloDotClass =
    halo === "green"
      ? "bg-[#16A34A]"
      : halo === "red"
        ? "bg-[#DC2626]"
        : "bg-[#CA8A04]";
  const haloLabel =
    halo === "green"
      ? "Halo: Focused"
      : halo === "red"
        ? "Halo: Distracted"
        : "Halo: Break / Paused";

  const unreadChatCount =
    room.allowAudioVideo && activeTableId && !isChatOpen
      ? Math.max(0, tableBroadcast.messages.length - seenMessageCount)
      : 0;

  const isTopicTableCallActive =
    room.allowAudioVideo && Boolean(activeTableId) && !isLeaving;

  const showDistractionBanner =
    distractionBanner.visible && timerState.visualState === "paused_distraction";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#EFEAE2]">
      {/* Hidden <video> element fed by single shared base MediaStream for CV */}
      <video
        ref={registerVideoElement}
        width={640}
        height={480}
        muted
        playsInline
        autoPlay
        aria-hidden="true"
        data-testid="cv-hidden-video"
        className="pointer-events-none fixed right-0 bottom-0 -z-10 h-12 w-16 opacity-0"
      />

      {/* Full-bleed Procedural R3F Room (unmounts cleanly before route transition) */}
      {!isLeaving ? (
        <StudyRoomScene
          subject={room.subject}
          accentHex={accentHex}
          selfState={presence.selfState}
          remoteMembers={presence.remoteMembers}
          htmlPortal={htmlPortalRef}
          onFloorClick={handleFloorWalk}
          onSelectSeat={handleSelectSeat}
        />
      ) : null}

      {/* Persistent sibling portal target so @react-three/drei <Html> cleans up cleanly */}
      <div
        ref={htmlPortalRef}
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      />

      {/* Non-blocking HUD Overlay Layer */}
      <div className="pointer-events-none fixed inset-0 z-20">
        {/* Top-Left Compact Frosted Pill + Dropdown + CV Status Pill */}
        <div className="pointer-events-none fixed top-4 left-4 z-20 flex flex-col items-start">
          <div className="pointer-events-auto flex h-11 items-center gap-2 rounded-full border border-slate-200/85 bg-white/88 px-3 text-slate-800 shadow-lg backdrop-blur-md">
            <Link
              href="/campus"
              onClick={(event) => {
                event.preventDefault();
                void handleLeaveRoom();
              }}
              className="inline-flex items-center gap-1 rounded-full px-1.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="size-3.5" />
              <span>Campus</span>
            </Link>

            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>

            <span className="tabular-mono text-xs font-semibold text-slate-600">
              {room.code}
            </span>
            <span className="max-w-36 truncate text-xs font-semibold text-slate-900 sm:max-w-48">
              {room.name}
            </span>

            <Badge
              variant="outline"
              data-testid="room-mode-badge"
              className={cn(
                "hidden gap-1 rounded-full px-2 py-0 text-[11px] font-medium sm:inline-flex",
                room.allowAudioVideo
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              )}
            >
              {room.allowAudioVideo ? (
                <Video className="size-3" />
              ) : (
                <VolumeX className="size-3" />
              )}
              <span>{room.modeBadge}</span>
            </Badge>

            <span className="tabular-mono rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              {presence.members.length}/{room.capacity}
            </span>

            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Room and avatar options"
              aria-expanded={roomMenuOpen}
              onClick={() => setRoomMenuOpen((prev) => !prev)}
              data-testid="room-options-trigger"
              className="size-7 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </div>

          <FocusStatusPill
            cvStatus={focusGuard.cvStatus}
            halo={halo}
            isBreakMode={timerState.visualState === "break"}
            distractionReason={
              distractionBanner.visible
                ? distractionBanner.reason
                : focusGuard.lastReason
            }
            cameraError={cameraErrorMessage}
            cvError={focusGuard.cvErrorMessage}
            onRetryCamera={() => {
              void requestCamera();
            }}
          />

          {roomMenuOpen ? (
            <div
              data-testid="room-options-popover"
              className="pointer-events-auto mt-2 flex w-64 flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 text-xs text-slate-800 shadow-xl backdrop-blur-md"
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  data-testid="room-table-badge"
                  className="flex items-center gap-1.5 font-medium text-slate-700"
                >
                  <Users className="size-3.5 text-slate-400" />
                  <span>{tableLabel}</span>
                </div>
                <span className="tabular-mono text-[11px] text-slate-500">
                  {presence.members.length}/{room.capacity} in room
                </span>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="font-medium text-slate-600">Focus status</span>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-700">
                  <span className={cn("size-2 rounded-full", haloDotClass)} />
                  <span>{haloLabel}</span>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="font-medium text-slate-600">Avatar color</span>
                <div className="flex items-center gap-1.5">
                  {AVATAR_COLOR_PRESETS.map((preset) => {
                    const selected =
                      avatarColor.toUpperCase() === preset.toUpperCase();
                    return (
                      <button
                        key={preset}
                        type="button"
                        aria-label={`Select avatar color ${preset}`}
                        onClick={() => void handleSelectAvatarColor(preset)}
                        className={cn(
                          "size-4 rounded-full border transition-transform hover:scale-110",
                          selected
                            ? "scale-110 border-slate-900 ring-2 ring-slate-900/20"
                            : "border-slate-300"
                        )}
                        style={{ backgroundColor: preset }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Top-Center Transient Distraction Alert Banner */}
        <div className="pointer-events-none fixed top-4 left-1/2 z-30 -translate-x-1/2">
          <DistractionAlertBanner
            reason={distractionBanner.reason}
            visible={showDistractionBanner}
            onResumeFocus={() => {
              setDistractionBanner({ visible: false, reason: null });
              void resumeTimerHandlerRef.current?.();
            }}
            onDismiss={() =>
              setDistractionBanner((prev) => ({ ...prev, visible: false }))
            }
          />
        </div>

        {/* First-Visitor Empty Room Toast (cleanly above bottom dock) */}
        {showFirstVisitorToast ? (
          <div
            data-testid="empty-room-toast"
            role="status"
            className="pointer-events-auto fixed bottom-20 left-1/2 z-30 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200/90 bg-white/92 px-4 py-2 text-xs text-slate-700 shadow-lg backdrop-blur-md"
          >
            <span>
              You&apos;re the first one here — pick any table to start a focus
              block or share the room link.
            </span>
            <button
              type="button"
              aria-label="Dismiss message"
              onClick={() => setToastDismissed(true)}
              className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}

        {/* Top-Right Minimal Timer Pill + Popover */}
        <div
          className={cn(
            "pointer-events-none fixed top-4 z-20 transition-all duration-200",
            isTopicTableCallActive && isChatOpen ? "right-[21rem]" : "right-4"
          )}
        >
          <StudyTimer
            roomSlug={room.slug}
            subject={room.subject}
            userId={profile.id}
            tableId={activeTableId}
            timerState={timerState}
            syncedWithTable={effectiveSyncedWithTable}
            distractionCount={distractionCount}
            onResetDistractionCount={handleResetDistractionCount}
            onActiveSessionChange={handleActiveSessionChange}
            onSendTimerSync={tableBroadcast.sendTimerSync}
            registerTimerSyncListener={registerTimerSyncListener}
            registerResumeHandler={registerResumeHandler}
            onStateChange={setTimerState}
            onSyncedWithTableChange={setSyncedWithTable}
            registerFinishHandler={registerFinishHandler}
          />
        </div>

        {/* Topic A/V LiveKit Table Call + Slide-Over Chat Sheet (hidden in Silent rooms) */}
        {isTopicTableCallActive && activeTableId ? (
          <LiveKitTableCall
            roomSlug={room.slug}
            tableId={activeTableId}
            allowAudioVideo={room.allowAudioVideo}
            isMicOn={isMicOn}
            isCamOn={isCamOn}
            cloneVideoTrackForCall={cloneVideoTrackForCall}
            releaseClonedVideoTrack={releaseClonedVideoTrack}
            onStatusChange={(status, note) => {
              setCallStatus(status);
              setCallNote(note ?? null);
            }}
            onMicForceOff={() => setIsMicOn(false)}
            onCamForceOff={() => setIsCamOn(false)}
          >
            {(videoStripSlot) => (
              <TableChatSheet
                open={isChatOpen}
                tableId={activeTableId}
                currentUserId={profile.id}
                messages={tableBroadcast.messages}
                callStatus={callStatus}
                callNote={callNote}
                videoStripSlot={videoStripSlot}
                onSendMessage={tableBroadcast.sendChatMessage}
                onClose={() => {
                  setSeenMessageCount(tableBroadcast.messages.length);
                  setIsChatOpen(false);
                }}
              />
            )}
          </LiveKitTableCall>
        ) : null}

        {/* Bottom-Center HUD Dock */}
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-20 -translate-x-1/2">
          <RoomHudDock
            room={room}
            tableId={activeTableId}
            isLeaving={isLeaving}
            isMicOn={isMicOn}
            isCamOn={isCamOn}
            isCameraAvailable={cameraStatus === "active"}
            isChatOpen={isChatOpen}
            unreadChatCount={unreadChatCount}
            callStatus={callStatus}
            onToggleMic={() => setIsMicOn((prev) => !prev)}
            onToggleCam={() => setIsCamOn((prev) => !prev)}
            onToggleChat={() => {
              setSeenMessageCount(tableBroadcast.messages.length);
              setIsChatOpen((prev) => !prev);
            }}
            onStandUp={handleStandUp}
            onLeaveRoom={() => void handleLeaveRoom()}
          />
        </div>
      </div>
    </div>
  );
}
