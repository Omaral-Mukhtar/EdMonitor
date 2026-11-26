"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  clampFloorPosition,
  getSeatWorldTransform,
  getSpawnPosition,
} from "@/lib/room-layout";
import { createClient } from "@/lib/supabase/client";
import type {
  CampusLobbyPresenceState,
  FocusHalo,
  RoomPresenceState,
  StudyTechnique,
  TimerPhase,
} from "@/types/domain";

const MOVE_THROTTLE_MS = 250; // <= 4 Hz

interface TrackedRoomPresencePayload extends RoomPresenceState {
  clientId?: string;
}

interface UseRoomPresenceOptions {
  roomSlug: string;
  userId: string;
  displayName: string;
  isGuest: boolean;
  avatarColor: string;
  technique: StudyTechnique;
  timerPhase: TimerPhase;
  syncedWithTable: boolean;
  halo: FocusHalo;
}

export interface RoomPresenceController {
  selfState: RoomPresenceState;
  remoteMembers: RoomPresenceState[];
  members: RoomPresenceState[];
  isConnected: boolean;
  walkTo: (target: [number, number, number]) => void;
  sitAtSeat: (tableId: string, seatIndex: number) => boolean;
  standUp: () => void;
}

function createClientInstanceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `client-${Math.random().toString(36).slice(2, 10)}`;
}

function flattenRemoteMembers(
  presenceState: Record<string, TrackedRoomPresencePayload[]>,
  selfClientId: string
): RoomPresenceState[] {
  const remotes: RoomPresenceState[] = [];
  for (const entries of Object.values(presenceState)) {
    for (const entry of entries) {
      if (entry.clientId && entry.clientId === selfClientId) {
        continue;
      }
      remotes.push({
        userId: entry.userId,
        displayName: entry.displayName,
        isGuest: entry.isGuest,
        avatarColor: entry.avatarColor,
        tableId: entry.tableId,
        seatIndex: entry.seatIndex,
        position: entry.position,
        rotationY: entry.rotationY,
        technique: entry.technique,
        timerPhase: entry.timerPhase,
        syncedWithTable: entry.syncedWithTable,
        halo: entry.halo,
        updatedAt: entry.updatedAt,
      });
    }
  }
  return remotes;
}

/**
 * Manages `room:{roomSlug}` Presence (throttled <= 4 Hz for moves, immediate for
 * discrete seat/technique/halo transitions) and syncs active room + halo to `campus:lobby`.
 */
export function useRoomPresence({
  roomSlug,
  userId,
  displayName,
  isGuest,
  avatarColor,
  technique,
  timerPhase,
  syncedWithTable,
  halo,
}: UseRoomPresenceOptions): RoomPresenceController {
  const [clientId] = useState<string>(() => createClientInstanceId());
  const [locomotion, setLocomotion] = useState<{
    tableId: string | null;
    seatIndex: number | null;
    position: [number, number, number];
    rotationY: number;
  }>(() => ({
    tableId: null,
    seatIndex: null,
    position: getSpawnPosition(clientId),
    rotationY: Math.PI,
  }));

  const [remoteMembers, setRemoteMembers] = useState<RoomPresenceState[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const roomChannelRef = useRef<RealtimeChannel | null>(null);
  const lobbyChannelRef = useRef<RealtimeChannel | null>(null);
  const roomSubscribedRef = useRef(false);
  const lobbySubscribedRef = useRef(false);
  const lastMoveTrackAtRef = useRef(0);
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selfState: RoomPresenceState = useMemo(
    () => ({
      userId,
      displayName,
      isGuest,
      avatarColor,
      tableId: locomotion.tableId,
      seatIndex: locomotion.seatIndex,
      position: locomotion.position,
      rotationY: locomotion.rotationY,
      technique,
      timerPhase,
      syncedWithTable,
      halo,
      updatedAt: new Date().toISOString(),
    }),
    [
      userId,
      displayName,
      isGuest,
      avatarColor,
      locomotion.tableId,
      locomotion.seatIndex,
      locomotion.position,
      locomotion.rotationY,
      technique,
      timerPhase,
      syncedWithTable,
      halo,
    ]
  );

  const latestPayloadRef = useRef<TrackedRoomPresencePayload>({
    ...selfState,
    clientId,
  });

  useEffect(() => {
    latestPayloadRef.current = {
      ...selfState,
      clientId,
    };
  }, [selfState, clientId]);

  const sendRoomPresence = useCallback((immediate: boolean) => {
    const channel = roomChannelRef.current;
    if (!channel || !roomSubscribedRef.current) {
      return;
    }

    const flush = () => {
      if (!roomChannelRef.current || !roomSubscribedRef.current) {
        return;
      }
      lastMoveTrackAtRef.current = Date.now();
      const payload: TrackedRoomPresencePayload = {
        ...latestPayloadRef.current,
        updatedAt: new Date().toISOString(),
      };
      void roomChannelRef.current.track(payload).catch(() => undefined);
    };

    if (immediate) {
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      flush();
      return;
    }

    const now = Date.now();
    const elapsed = now - lastMoveTrackAtRef.current;
    if (elapsed >= MOVE_THROTTLE_MS) {
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      flush();
      return;
    }

    if (!throttleTimeoutRef.current) {
      throttleTimeoutRef.current = setTimeout(() => {
        throttleTimeoutRef.current = null;
        flush();
      }, MOVE_THROTTLE_MS - elapsed);
    }
  }, []);

  useEffect(() => {
    if (!userId || !roomSlug) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();

    const roomChannel = supabase.channel(`room:${roomSlug}`, {
      config: {
        presence: {
          key: userId,
        },
      },
    });
    roomChannelRef.current = roomChannel;

    const lobbyChannel = supabase.channel("campus:lobby", {
      config: {
        presence: {
          key: userId,
        },
      },
    });
    lobbyChannelRef.current = lobbyChannel;

    const syncRoomMembers = () => {
      if (cancelled) {
        return;
      }
      const state = roomChannel.presenceState<TrackedRoomPresencePayload>();
      setRemoteMembers(flattenRemoteMembers(state, clientId));
    };

    roomChannel
      .on("presence", { event: "sync" }, () => {
        syncRoomMembers();
      })
      .subscribe(async (status) => {
        if (cancelled) {
          return;
        }
        if (status === "SUBSCRIBED") {
          roomSubscribedRef.current = true;
          setIsConnected(true);
          await roomChannel
            .track({
              ...latestPayloadRef.current,
              updatedAt: new Date().toISOString(),
            })
            .catch(() => undefined);
          syncRoomMembers();
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          roomSubscribedRef.current = false;
          setIsConnected(false);
        }
      });

    lobbyChannel.subscribe(async (status) => {
      if (cancelled) {
        return;
      }
      if (status === "SUBSCRIBED") {
        lobbySubscribedRef.current = true;
        const lobbyPayload: CampusLobbyPresenceState = {
          userId,
          roomSlug,
          halo: latestPayloadRef.current.halo,
          updatedAt: new Date().toISOString(),
        };
        await lobbyChannel.track(lobbyPayload).catch(() => undefined);
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        lobbySubscribedRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      roomSubscribedRef.current = false;
      lobbySubscribedRef.current = false;
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      void roomChannel.untrack().catch(() => undefined);
      void lobbyChannel.untrack().catch(() => undefined);
      void supabase.removeChannel(roomChannel);
      void supabase.removeChannel(lobbyChannel);
      roomChannelRef.current = null;
      lobbyChannelRef.current = null;
    };
  }, [roomSlug, userId, clientId]);

  // Immediately broadcast discrete state transitions (technique, phase, sync, halo, color)
  useEffect(() => {
    sendRoomPresence(true);
  }, [
    avatarColor,
    technique,
    timerPhase,
    syncedWithTable,
    halo,
    sendRoomPresence,
  ]);

  // Keep `campus:lobby` halo in sync without re-subscribing
  useEffect(() => {
    const channel = lobbyChannelRef.current;
    if (!channel || !lobbySubscribedRef.current) {
      return;
    }
    const lobbyPayload: CampusLobbyPresenceState = {
      userId,
      roomSlug,
      halo,
      updatedAt: new Date().toISOString(),
    };
    void channel.track(lobbyPayload).catch(() => undefined);
  }, [userId, roomSlug, halo]);

  const walkTo = useCallback(
    (target: [number, number, number]) => {
      const nextPos = clampFloorPosition(target[0], target[2]);
      setLocomotion((prev) => {
        const dx = nextPos[0] - prev.position[0];
        const dz = nextPos[2] - prev.position[2];
        const nextRot =
          Math.hypot(dx, dz) > 0.02 ? Math.atan2(dx, dz) : prev.rotationY;

        const next = {
          tableId: null,
          seatIndex: null,
          position: nextPos,
          rotationY: nextRot,
        };
        latestPayloadRef.current = {
          ...latestPayloadRef.current,
          ...next,
        };
        return next;
      });
      sendRoomPresence(false);
    },
    [sendRoomPresence]
  );

  const sitAtSeat = useCallback(
    (tableId: string, seatIndex: number): boolean => {
      const isOccupiedByPeer = remoteMembers.some(
        (member) =>
          member.tableId === tableId && member.seatIndex === seatIndex
      );
      if (isOccupiedByPeer) {
        return false;
      }

      const seatTransform = getSeatWorldTransform(tableId, seatIndex);
      if (!seatTransform) {
        return false;
      }

      const next = {
        tableId,
        seatIndex,
        position: seatTransform.position,
        rotationY: seatTransform.rotationY,
      };
      latestPayloadRef.current = {
        ...latestPayloadRef.current,
        ...next,
      };
      setLocomotion(next);
      sendRoomPresence(true);
      return true;
    },
    [remoteMembers, sendRoomPresence]
  );

  const standUp = useCallback(() => {
    setLocomotion((prev) => {
      const stepBackZ = prev.position[2] + (prev.position[2] >= 0 ? 0.65 : -0.65);
      const next = {
        tableId: null,
        seatIndex: null,
        position: clampFloorPosition(prev.position[0], stepBackZ),
        rotationY: prev.rotationY,
      };
      latestPayloadRef.current = {
        ...latestPayloadRef.current,
        ...next,
      };
      return next;
    });
    sendRoomPresence(true);
  }, [sendRoomPresence]);

  const members = useMemo(
    () => [selfState, ...remoteMembers],
    [selfState, remoteMembers]
  );

  return {
    selfState,
    remoteMembers,
    members,
    isConnected,
    walkTo,
    sitAtSeat,
    standUp,
  };
}
