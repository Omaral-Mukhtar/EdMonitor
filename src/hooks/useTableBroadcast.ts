"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { TableChatMessage, TimerSyncPayload } from "@/types/domain";

export const MAX_CHAT_MESSAGE_CHARS = 1000;
const MAX_CHAT_HISTORY = 100;

interface UseTableBroadcastOptions {
  roomSlug: string;
  tableId: string | null;
  allowAudioVideo: boolean;
  enableTimerSync: boolean;
  userId: string;
  displayName: string;
  avatarColor: string;
  onTimerSync?: (payload: TimerSyncPayload) => void;
}

export interface TableBroadcastController {
  isConnected: boolean;
  messages: TableChatMessage[];
  sendTimerSync: (payload: TimerSyncPayload) => void;
  sendChatMessage: (rawText: string) => boolean;
  clearMessages: () => void;
}

function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeChatMessage(raw: unknown): TableChatMessage | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.id !== "string" ||
    typeof obj.authorId !== "string" ||
    typeof obj.displayName !== "string" ||
    typeof obj.text !== "string" ||
    typeof obj.sentAt !== "string"
  ) {
    return null;
  }
  const trimmed = obj.text.trim().slice(0, MAX_CHAT_MESSAGE_CHARS);
  if (!trimmed) {
    return null;
  }
  return {
    id: obj.id,
    authorId: obj.authorId,
    displayName: obj.displayName,
    avatarColor:
      typeof obj.avatarColor === "string" ? obj.avatarColor : "#2563EB",
    text: trimmed,
    sentAt: obj.sentAt,
  };
}

/**
 * Consolidates `table:{roomSlug}:{tableId}` Supabase Realtime Broadcast into
 * ONE channel instance shared by `timer:sync` and topic-room `chat:message`.
 */
export function useTableBroadcast({
  roomSlug,
  tableId,
  allowAudioVideo,
  enableTimerSync,
  userId,
  displayName,
  avatarColor,
  onTimerSync,
}: UseTableBroadcastOptions): TableBroadcastController {
  const activeTopic = tableId ? `table:${roomSlug}:${tableId}` : null;
  const [connectedTopic, setConnectedTopic] = useState<string | null>(null);
  const [messageStore, setMessageStore] = useState<{
    topic: string;
    items: TableChatMessage[];
  }>({ topic: "", items: [] });

  const channelRef = useRef<RealtimeChannel | null>(null);
  const subscribedRef = useRef(false);
  const pendingTimerSyncRef = useRef<TimerSyncPayload | null>(null);
  const onTimerSyncRef = useRef(onTimerSync);
  const enableTimerSyncRef = useRef(enableTimerSync);
  const allowAudioVideoRef = useRef(allowAudioVideo);

  useEffect(() => {
    onTimerSyncRef.current = onTimerSync;
    enableTimerSyncRef.current = enableTimerSync;
    allowAudioVideoRef.current = allowAudioVideo;
  }, [allowAudioVideo, enableTimerSync, onTimerSync]);

  const shouldSubscribe = Boolean(
    activeTopic && (allowAudioVideo || enableTimerSync)
  );

  useEffect(() => {
    if (!shouldSubscribe || !activeTopic) {
      subscribedRef.current = false;
      channelRef.current = null;
      pendingTimerSyncRef.current = null;
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel(activeTopic, {
      config: {
        broadcast: {
          self: false,
          ack: false,
        },
      },
    });
    channelRef.current = channel;

    channel.on(
      "broadcast",
      { event: "timer:sync" },
      ({ payload }: { payload: TimerSyncPayload }) => {
        if (!enableTimerSyncRef.current || !payload) {
          return;
        }
        onTimerSyncRef.current?.(payload);
      }
    );

    if (allowAudioVideo) {
      channel.on(
        "broadcast",
        { event: "chat:message" },
        ({ payload }: { payload: unknown }) => {
          const normalized = normalizeChatMessage(payload);
          if (!normalized) {
            return;
          }
          setMessageStore((prev) => {
            const currentItems =
              prev.topic === activeTopic ? prev.items : [];
            if (currentItems.some((m) => m.id === normalized.id)) {
              return prev;
            }
            return {
              topic: activeTopic,
              items: [
                ...currentItems.slice(-(MAX_CHAT_HISTORY - 1)),
                normalized,
              ],
            };
          });
        }
      );
    }

    channel.subscribe((status) => {
      if (cancelled) {
        return;
      }
      const ready = status === "SUBSCRIBED";
      subscribedRef.current = ready;
      setConnectedTopic(ready ? activeTopic : null);

      if (ready && pendingTimerSyncRef.current && enableTimerSyncRef.current) {
        const queued = pendingTimerSyncRef.current;
        pendingTimerSyncRef.current = null;
        void channel
          .send({
            type: "broadcast",
            event: "timer:sync",
            payload: queued,
          })
          .catch(() => undefined);
      }
    });

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      channelRef.current = null;
      pendingTimerSyncRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [activeTopic, allowAudioVideo, shouldSubscribe]);

  const sendTimerSync = useCallback(
    (payload: TimerSyncPayload) => {
      if (!activeTopic || !enableTimerSyncRef.current) {
        return;
      }
      const channel = channelRef.current;
      if (!channel || !subscribedRef.current) {
        pendingTimerSyncRef.current = payload;
        return;
      }
      void channel
        .send({
          type: "broadcast",
          event: "timer:sync",
          payload,
        })
        .catch(() => undefined);
    },
    [activeTopic]
  );

  const sendChatMessage = useCallback(
    (rawText: string): boolean => {
      if (!allowAudioVideoRef.current || !activeTopic) {
        return false;
      }
      const trimmed = rawText.trim().slice(0, MAX_CHAT_MESSAGE_CHARS);
      if (!trimmed) {
        return false;
      }
      const message: TableChatMessage = {
        id: createMessageId(),
        authorId: userId,
        displayName,
        avatarColor,
        text: trimmed,
        sentAt: new Date().toISOString(),
      };

      setMessageStore((prev) => {
        const currentItems = prev.topic === activeTopic ? prev.items : [];
        return {
          topic: activeTopic,
          items: [...currentItems.slice(-(MAX_CHAT_HISTORY - 1)), message],
        };
      });

      const channel = channelRef.current;
      if (channel && subscribedRef.current) {
        void channel
          .send({
            type: "broadcast",
            event: "chat:message",
            payload: message,
          })
          .catch(() => undefined);
      }
      return true;
    },
    [activeTopic, avatarColor, displayName, userId]
  );

  const clearMessages = useCallback(() => {
    setMessageStore({ topic: "", items: [] });
  }, []);

  const messages =
    activeTopic && messageStore.topic === activeTopic ? messageStore.items : [];
  const isConnected = Boolean(
    shouldSubscribe && activeTopic && connectedTopic === activeTopic
  );

  return {
    isConnected,
    messages,
    sendTimerSync,
    sendChatMessage,
    clearMessages,
  };
}
