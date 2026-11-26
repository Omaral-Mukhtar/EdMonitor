"use client";

import { useEffect, useRef, useState } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import type { LiveKitCallStatus } from "@/components/table/LiveKitTableCall";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_CHAT_MESSAGE_CHARS } from "@/hooks/useTableBroadcast";
import type { TableChatMessage } from "@/types/domain";

interface TableChatSheetProps {
  open: boolean;
  tableId: string | null;
  currentUserId: string;
  messages: TableChatMessage[];
  callStatus: LiveKitCallStatus;
  callNote: string | null;
  videoStripSlot?: React.ReactNode;
  onSendMessage: (text: string) => boolean;
  onClose: () => void;
}

function formatMessageTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return parsed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Topic-room (`allowAudioVideo === true`) slide-over sheet showing the
 * compact LiveKit table video strip and plain-text table chat (`chat:message`).
 */
export function TableChatSheet({
  open,
  tableId,
  currentUserId,
  messages,
  callStatus,
  callNote,
  videoStripSlot,
  onSendMessage,
  onClose,
}: TableChatSheetProps) {
  const [draft, setDraft] = useState("");
  const scrollEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && typeof scrollEndRef.current?.scrollIntoView === "function") {
      scrollEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, open]);

  if (!open || !tableId) {
    return null;
  }

  const tableLabel = `Table ${tableId.replace("table-", "")}`;
  const callBadgeLabel =
    callStatus === "connected"
      ? "Call Live"
      : callStatus === "connecting"
        ? "Connecting..."
        : callStatus === "unconfigured"
          ? "Chat Only"
          : "Audio/Video";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (onSendMessage(draft)) {
      setDraft("");
    }
  };

  return (
    <aside
      data-testid="table-chat-sheet"
      aria-label={`${tableLabel} collaboration sheet`}
      className="pointer-events-auto fixed inset-y-0 right-0 z-30 flex w-80 flex-col border-l border-slate-200/90 bg-white/95 text-slate-900 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-4 text-blue-600" />
          <span className="text-sm font-semibold text-slate-900">
            {tableLabel} · A/V &amp; Chat
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge
            variant="outline"
            data-testid="livekit-status-badge"
            className="rounded-full border-blue-200 bg-blue-50 px-2 py-0 text-[10px] font-medium text-blue-700"
          >
            {callBadgeLabel}
          </Badge>
          <Button
            type="button"
            size="icon-xs"
            variant="ghost"
            aria-label="Close table chat"
            onClick={onClose}
            data-testid="close-table-chat-button"
            className="size-7 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Compact Peer Video Strip */}
      <div className="shrink-0 border-b border-slate-100 p-3">
        {videoStripSlot}
        {callNote ? (
          <p
            data-testid="livekit-call-note"
            className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600"
          >
            {callNote}
          </p>
        ) : null}
      </div>

      {/* Plain-Text Table Chat Stream */}
      <div
        data-testid="table-chat-messages"
        className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-3"
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            No messages at {tableLabel} yet. Say hello or coordinate a timer
            cycle.
          </p>
        ) : (
          messages.map((msg) => {
            const isSelf = msg.authorId === currentUserId;
            return (
              <div
                key={msg.id}
                data-testid="table-chat-message-item"
                className="flex flex-col gap-0.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: msg.avatarColor }}
                      aria-hidden="true"
                    />
                    <span>{isSelf ? `${msg.displayName} (You)` : msg.displayName}</span>
                  </span>
                  <span className="tabular-mono text-[10px] text-slate-400">
                    {formatMessageTime(msg.sentAt)}
                  </span>
                </div>
                <p className="rounded-xl border border-slate-200/80 bg-slate-50 px-2.5 py-1.5 text-xs leading-relaxed break-words text-slate-800">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
        <div ref={scrollEndRef} />
      </div>

      {/* Message Input */}
      <form
        onSubmit={handleSubmit}
        className="flex shrink-0 items-center gap-2 border-t border-slate-200 p-3"
      >
        <Input
          type="text"
          value={draft}
          maxLength={MAX_CHAT_MESSAGE_CHARS}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${tableLabel}...`}
          aria-label={`Message ${tableLabel}`}
          data-testid="table-chat-input"
          className="h-9 flex-1 rounded-full border-slate-200 bg-slate-50 px-3.5 text-xs text-slate-900 placeholder:text-slate-400"
        />
        <Button
          type="submit"
          size="icon-sm"
          disabled={!draft.trim()}
          aria-label="Send message"
          data-testid="table-chat-send-button"
          className="size-9 shrink-0 rounded-full bg-blue-600 text-white hover:bg-blue-700"
        >
          <Send className="size-3.5" />
        </Button>
      </form>
    </aside>
  );
}
