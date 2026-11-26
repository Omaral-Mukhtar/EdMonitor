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

export interface TrackedRoomPresencePayload extends Partial<RoomPresenceState> {
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

/**
 * Builds a Supabase Realtime Presence key WITHOUT colons (`:`), because Supabase
 * Realtime Presence silently drops remote presence sync diffs when keys contain `:`.
 */
export function buildRoomPresenceKey(userId: string, clientId: string): string {
  const safeUser = userId.replaceAll(":", "_");
  const safeClient = clientId.replaceAll(":", "_");
  return `${safeUser}_${safeClient}`;
}

function normalizePosition(pos: unknown): [number, number, number] {
  if (
    Array.isArray(pos) &&
    pos.length >= 3 &&
    typeof pos[0] === "number" &&
    typeof pos[1] === "number" &&
    typeof pos[2] === "number"
  ) {
    return [pos[0], pos[1], pos[2]];
  }
  return [0, 0, 4.6];
}

function normalizeHalo(halo: unknown): FocusHalo {
  return halo === "red" || halo === "yellow" || halo === "green"
    ? halo
    : "green";
}

function normalizeTechnique(technique: unknown): StudyTechnique {
  return technique === "pomodoro" ||
    technique === "deep_work" ||
    technique === "feynman" ||
    technique === "flowtime"
    ? technique
    : "pomodoro";
}

function normalizeTimerPhase(phase: unknown): TimerPhase {
  return phase === "focus" ||
    phase === "break" ||
    phase === "paused" ||
    phase === "idle"
    ? phase
    : "idle";
}

/**
 * Parses `channel.presenceState()` metas into `RoomPresenceState[]`, applying safe
 * defaults for any missing optional fields so remote peers are never silently dropped.
 */
export function parseRemoteRoomPresenceMembers(
  presenceState: Record<string, TrackedRoomPresencePayload[]>,
  selfClientId: string,
  selfUserId?: string
): RoomPresenceState[] {
  const remotes: RoomPresenceState[] = [];
  for (const [presenceKey, entries] of Object.entries(presenceState)) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      if (entry.clientId && entry.clientId === selfClientId) {
        continue;
      }
      if (
        !entry.clientId &&
        selfUserId &&
        entry.userId === selfUserId
      ) {
        continue;
      }

      const resolvedUserId =
        typeof entry.userId === "string" && entry.userId.length > 0
          ? entry.userId
          : presenceKey.split("_")[0] || presenceKey;

      remotes.push({
        clientId:
          typeof entry.clientId === "string" ? entry.clientId : presenceKey,
        userId: resolvedUserId,
        displayName:
          typeof entry.displayName === "string" && entry.displayName.trim()
            ? entry.displayName
            : "Student",
        isGuest: Boolean(entry.isGuest),
        avatarColor:
          typeof entry.avatarColor === "string" && entry.avatarColor
            ? entry.avatarColor
            : "#2563EB",
        tableId: typeof entry.tableId === "string" ? entry.tableId : null,
        seatIndex:
          typeof entry.seatIndex === "number" ? entry.seatIndex : null,
        position: normalizePosition(entry.position),
        rotationY:
          typeof entry.rotationY === "number" ? entry.rotationY : Math.PI,
        technique: normalizeTechnique(entry.technique),
        timerPhase: normalizeTimerPhase(entry.timerPhase),
        syncedWithTable: Boolean(entry.syncedWithTable),
        halo: normalizeHalo(entry.halo),
        updatedAt:
          typeof entry.updatedAt === "string"
            ? entry.updatedAt
            : new Date().toISOString(),
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
      clientId,
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
      syncedWithTable: Boolean(locomotion.tableId) && syncedWithTable,
      halo,
      updatedAt: new Date().toISOString(),
    }),
    [
      clientId,
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
    const presenceKey = buildRoomPresenceKey(userId, clientId);

    const roomChannel = supabase.channel(`room:${roomSlug}`, {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });
    roomChannelRef.current = roomChannel;

    const lobbyChannel = supabase.channel("campus:lobby", {
      config: {
        presence: {
          key: presenceKey,
        },
      },
    });
    lobbyChannelRef.current = lobbyChannel;

    const syncRoomMembers = () => {
      if (cancelled) {
        return;
      }
      const state = roomChannel.presenceState<TrackedRoomPresencePayload>();
      setRemoteMembers(
        parseRemoteRoomPresenceMembers(state, clientId, userId)
      );
    };

    roomChannel
      .on("presence", { event: "sync" }, syncRoomMembers)
      .on("presence", { event: "join" }, syncRoomMembers)
      .on("presence", { event: "leave" }, syncRoomMembers)
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
          halo: normalizeHalo(latestPayloadRef.current.halo),
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

  return useMemo(
    () => ({
      selfState,
      remoteMembers,
      members,
      isConnected,
      walkTo,
      sitAtSeat,
      standUp,
    }),
    [
      selfState,
      remoteMembers,
      members,
      isConnected,
      walkTo,
      sitAtSeat,
      standUp,
    ]
  );
}
