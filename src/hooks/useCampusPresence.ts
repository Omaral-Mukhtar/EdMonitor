"use client";

import { useEffect, useState } from "react";
import { CAMPUS_ROOMS, CAMPUS_ZONES } from "@/lib/campus-rooms";
import { createClient } from "@/lib/supabase/client";
import type {
  CampusLobbyPresenceState,
  CampusSubject,
  FocusHalo,
} from "@/types/domain";

export interface CampusPresenceSummary {
  totalActive: number;
  focusedGreenCount: number;
  roomCounts: Record<string, number>;
  zoneCounts: Record<CampusSubject, number>;
  isConnected: boolean;
}

function createEmptyRoomCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const room of CAMPUS_ROOMS) {
    counts[room.slug] = 0;
  }
  return counts;
}

function createEmptyZoneCounts(): Record<CampusSubject, number> {
  const counts = {} as Record<CampusSubject, number>;
  for (const zone of CAMPUS_ZONES) {
    counts[zone.id] = 0;
  }
  return counts;
}

function buildPresenceSummary(
  state: Record<string, CampusLobbyPresenceState[]>,
  isConnected: boolean
): CampusPresenceSummary {
  const roomCounts = createEmptyRoomCounts();
  const zoneCounts = createEmptyZoneCounts();
  let totalActive = 0;
  let focusedGreenCount = 0;

  const roomZoneLookup = new Map<string, CampusSubject>();
  for (const room of CAMPUS_ROOMS) {
    roomZoneLookup.set(room.slug, room.subject);
  }

  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      totalActive += 1;
      if (entry.halo === "green") {
        focusedGreenCount += 1;
      }
      if (entry.roomSlug && roomCounts[entry.roomSlug] !== undefined) {
        roomCounts[entry.roomSlug] += 1;
        const zone = roomZoneLookup.get(entry.roomSlug);
        if (zone) {
          zoneCounts[zone] += 1;
        }
      }
    }
  }

  return {
    totalActive,
    focusedGreenCount,
    roomCounts,
    zoneCounts,
    isConnected,
  };
}

interface UseCampusPresenceOptions {
  userId: string;
  roomSlug?: string | null;
  halo?: FocusHalo;
}

/**
 * Subscribe to the global `campus:lobby` Realtime Presence channel and
 * aggregate live studying counts per room, per zone, and across campus.
 */
export function useCampusPresence({
  userId,
  roomSlug = null,
  halo = "green",
}: UseCampusPresenceOptions): CampusPresenceSummary {
  const [summary, setSummary] = useState<CampusPresenceSummary>(() => ({
    totalActive: 0,
    focusedGreenCount: 0,
    roomCounts: createEmptyRoomCounts(),
    zoneCounts: createEmptyZoneCounts(),
    isConnected: false,
  }));

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    const channel = supabase.channel("campus:lobby", {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    const syncState = (connected: boolean) => {
      if (cancelled) {
        return;
      }
      const presenceState =
        channel.presenceState<CampusLobbyPresenceState>();
      setSummary(buildPresenceSummary(presenceState, connected));
    };

    channel
      .on("presence", { event: "sync" }, () => {
        syncState(true);
      })
      .subscribe(async (status) => {
        if (cancelled) {
          return;
        }
        if (status === "SUBSCRIBED") {
          const payload: CampusLobbyPresenceState = {
            userId,
            roomSlug,
            halo,
            updatedAt: new Date().toISOString(),
          };
          await channel.track(payload);
          syncState(true);
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          syncState(false);
        }
      });

    return () => {
      cancelled = true;
      void channel.untrack().catch(() => undefined);
      void supabase.removeChannel(channel);
    };
  }, [userId, roomSlug, halo]);

  return summary;
}
