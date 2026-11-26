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
import { RoomHudDock } from "@/components/room3d/RoomHudDock";
import { StudyRoomScene } from "@/components/room3d/StudyRoomScene";
import { StudyTimer } from "@/components/table/StudyTimer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRoomPresence } from "@/hooks/useRoomPresence";
import { getCampusZoneById, type CampusRoomConfig } from "@/lib/campus-rooms";
import {
  createInitialTimerState,
  getHaloFromTimerState,
  visualStateToTimerPhase,
  type StudyTimerState,
} from "@/lib/study-timer";
import { AVATAR_COLOR_PRESETS, type UserProfile } from "@/types/domain";
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
  const [toastDismissed, setToastDismissed] = useState(false);
  const [roomMenuOpen, setRoomMenuOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const htmlPortalRef = useRef<HTMLDivElement>(null);

  const finishSessionHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const registerFinishHandler = useCallback(
    (handler: (() => Promise<void>) | null) => {
      finishSessionHandlerRef.current = handler;
    },
    []
  );

  const halo = getHaloFromTimerState(timerState.visualState);
  const timerPhase = visualStateToTimerPhase(timerState.visualState);

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

  const effectiveSyncedWithTable =
    Boolean(presence.selfState.tableId) && syncedWithTable;

  const handleFloorWalk = useCallback(
    (point: [number, number, number]) => {
      setSyncedWithTable(false);
      presence.walkTo(point);
    },
    [presence]
  );

  const handleStandUp = useCallback(() => {
    setSyncedWithTable(false);
    presence.standUp();
  }, [presence]);

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

  const activeTableId = presence.selfState.tableId;
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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#EFEAE2]">
      {/* Full-bleed Procedural R3F Room (unmounts cleanly before route transition) */}
      {!isLeaving ? (
        <StudyRoomScene
          subject={room.subject}
          accentHex={accentHex}
          selfState={presence.selfState}
          remoteMembers={presence.remoteMembers}
          htmlPortal={htmlPortalRef}
          onFloorClick={handleFloorWalk}
          onSelectSeat={(tableId, seatIndex) => {
            presence.sitAtSeat(tableId, seatIndex);
          }}
        />
      ) : null}

      {/* Persistent sibling portal target so @react-three/drei <Html> cleans up cleanly */}
      <div
        ref={htmlPortalRef}
        className="pointer-events-none fixed inset-0 z-10 overflow-hidden"
      />

      {/* Non-blocking HUD Overlay Layer */}
      <div className="pointer-events-none fixed inset-0 z-20">
        {/* Top-Left Compact Frosted Pill + Dropdown */}
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
        <div className="pointer-events-none fixed top-4 right-4 z-20">
          <StudyTimer
            roomSlug={room.slug}
            subject={room.subject}
            userId={profile.id}
            tableId={presence.selfState.tableId}
            timerState={timerState}
            syncedWithTable={effectiveSyncedWithTable}
            onStateChange={setTimerState}
            onSyncedWithTableChange={setSyncedWithTable}
            registerFinishHandler={registerFinishHandler}
          />
        </div>

        {/* Bottom-Center HUD Dock */}
        <div className="pointer-events-none fixed bottom-5 left-1/2 z-20 -translate-x-1/2">
          <RoomHudDock
            room={room}
            tableId={presence.selfState.tableId}
            isLeaving={isLeaving}
            onStandUp={handleStandUp}
            onLeaveRoom={() => void handleLeaveRoom()}
          />
        </div>
      </div>
    </div>
  );
}
