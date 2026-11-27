"use client";

import {
  ArrowUpFromLine,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  PenTool,
  Video,
  VideoOff,
  VolumeX,
} from "lucide-react";
import type { LiveKitCallStatus } from "@/components/table/LiveKitTableCall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampusRoomConfig } from "@/lib/campus-rooms";
import { cn } from "cn";

interface RoomHudDockProps {
  room: CampusRoomConfig;
  tableId: string | null;
  isLeaving: boolean;
  isMicOn: boolean;
  isCamOn: boolean;
  isCameraAvailable: boolean;
  isChatOpen: boolean;
  isWhiteboardOpen?: boolean;
  unreadChatCount: number;
  callStatus?: LiveKitCallStatus;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleChat: () => void;
  onToggleWhiteboard?: () => void;
  onStandUp: () => void;
  onLeaveRoom: () => void;
}

export function RoomHudDock({
  room,
  tableId,
  isLeaving,
  isMicOn,
  isCamOn,
  isCameraAvailable,
  isChatOpen,
  isWhiteboardOpen = false,
  unreadChatCount,
  callStatus = "idle",
  onToggleMic,
  onToggleCam,
  onToggleChat,
  onToggleWhiteboard,
  onStandUp,
  onLeaveRoom,
}: RoomHudDockProps) {
  const isSeated = Boolean(tableId);

  const callDotClass =
    callStatus === "connected"
      ? "bg-emerald-500"
      : callStatus === "connecting"
        ? "animate-pulse bg-amber-500"
        : callStatus === "error"
          ? "bg-red-500"
          : "bg-slate-400";

  const callLabel =
    callStatus === "connected"
      ? "Call Live"
      : callStatus === "connecting"
        ? "Connecting"
        : callStatus === "unconfigured"
          ? "Chat Only"
          : callStatus === "error"
            ? "Call Error"
            : "Standby";

  return (
    <div
      data-testid="room-hud-dock"
      className="pointer-events-auto flex h-12 items-center gap-2 rounded-full border border-slate-200/85 bg-white/88 px-3 text-slate-800 shadow-lg backdrop-blur-md"
    >
      {room.allowAudioVideo ? (
        <>
          {isSeated ? (
            <span
              data-testid="dock-call-status"
              className="hidden items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 md:inline-flex"
            >
              <span
                className={cn("size-2 rounded-full", callDotClass)}
                aria-hidden="true"
              />
              <span>{callLabel}</span>
            </span>
          ) : null}

          <Button
            type="button"
            size="sm"
            variant={isMicOn ? "secondary" : "outline"}
            disabled={!isSeated}
            onClick={onToggleMic}
            aria-pressed={isMicOn}
            aria-label={isMicOn ? "Mute microphone" : "Unmute microphone"}
            data-testid="dock-mic-button"
            className={cn(
              "h-8 gap-1.5 rounded-full px-2.5 text-xs",
              isMicOn
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 ring-1 ring-emerald-500/30 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            )}
          >
            {isMicOn ? (
              <span
                className="size-1.5 rounded-full bg-emerald-500"
                aria-hidden="true"
              />
            ) : null}
            {isMicOn ? (
              <Mic className="size-3.5" />
            ) : (
              <MicOff className="size-3.5 text-slate-500" />
            )}
            <span className="hidden sm:inline">
              {isMicOn ? "Mic On" : "Mic"}
            </span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant={isCamOn ? "secondary" : "outline"}
            disabled={!isSeated || !isCameraAvailable}
            onClick={onToggleCam}
            aria-pressed={isCamOn}
            aria-label={isCamOn ? "Turn camera off" : "Turn camera on"}
            data-testid="dock-cam-button"
            className={cn(
              "h-8 gap-1.5 rounded-full px-2.5 text-xs",
              isCamOn
                ? "border-blue-300 bg-blue-50 text-blue-700 ring-1 ring-blue-500/30 hover:bg-blue-100"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            )}
          >
            {isCamOn ? (
              <Video className="size-3.5" />
            ) : (
              <VideoOff className="size-3.5 text-slate-500" />
            )}
            <span className="hidden sm:inline">
              {isCamOn ? "Cam On" : "Cam"}
            </span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant={isChatOpen ? "secondary" : "outline"}
            disabled={!isSeated}
            onClick={onToggleChat}
            aria-pressed={isChatOpen}
            aria-label="Toggle table chat"
            data-testid="dock-chat-button"
            className={cn(
              "relative h-8 gap-1.5 rounded-full px-2.5 text-xs",
              isChatOpen
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            )}
          >
            <MessageSquare className="size-3.5" />
            <span className="hidden sm:inline">Chat</span>
            {unreadChatCount > 0 && !isChatOpen ? (
              <span
                data-testid="dock-chat-unread-badge"
                className="tabular-mono inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white"
              >
                {unreadChatCount > 99 ? "99+" : unreadChatCount}
              </span>
            ) : null}
          </Button>

          <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
        </>
      ) : (
        <>
          <Badge
            variant="outline"
            data-testid="dock-silent-badge"
            className="gap-1.5 rounded-full border-slate-200 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-700"
          >
            <VolumeX className="size-3" />
            <span>{room.modeBadge}</span>
          </Badge>

          <div className="h-5 w-px bg-slate-200" aria-hidden="true" />
        </>
      )}

      <Button
        type="button"
        size="sm"
        variant={isWhiteboardOpen ? "secondary" : "outline"}
        disabled={isLeaving}
        onClick={onToggleWhiteboard}
        aria-pressed={isWhiteboardOpen}
        data-testid="dock-whiteboard-button"
        className={cn(
          "h-8 gap-1.5 rounded-full px-3 text-xs",
          isWhiteboardOpen
            ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"
        )}
      >
        <PenTool className="size-3.5" />
        <span>My Whiteboard &amp; AI</span>
      </Button>

      {isSeated ? (
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
        <span className="hidden whitespace-nowrap px-2 text-xs text-slate-500 sm:inline">
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
