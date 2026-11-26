"use client";

import { ArrowUpFromLine, LogOut, Video, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampusRoomConfig } from "@/lib/campus-rooms";
import { cn } from "cn";

interface RoomHudDockProps {
  room: CampusRoomConfig;
  tableId: string | null;
  isLeaving: boolean;
  onStandUp: () => void;
  onLeaveRoom: () => void;
}

export function RoomHudDock({
  room,
  tableId,
  isLeaving,
  onStandUp,
  onLeaveRoom,
}: RoomHudDockProps) {
  return (
    <div
      data-testid="room-hud-dock"
      className="pointer-events-auto flex h-12 items-center gap-2 rounded-full border border-slate-200/85 bg-white/88 px-3 text-slate-800 shadow-lg backdrop-blur-md"
    >
      <Badge
        variant="outline"
        className={cn(
          "gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
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

      <div className="h-5 w-px bg-slate-200" aria-hidden="true" />

      {tableId ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onStandUp}
          data-testid="stand-up-button"
          className="h-8 gap-1.5 rounded-full border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 hover:bg-slate-100"
        >
          <ArrowUpFromLine className="size-3.5" />
          <span>Stand Up</span>
        </Button>
      ) : (
        <span className="px-2 text-xs text-slate-500">
          Click a chair to sit
        </span>
      )}

      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={isLeaving}
        onClick={onLeaveRoom}
        data-testid="leave-room-button"
        className="h-8 gap-1.5 rounded-full px-3 text-xs"
      >
        <LogOut className="size-3.5" />
        <span>{isLeaving ? "Saving..." : "Leave Room"}</span>
      </Button>
    </div>
  );
}
