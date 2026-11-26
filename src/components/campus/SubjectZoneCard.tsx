"use client";

import { Video, VolumeX } from "lucide-react";
import { TopicRoomCard } from "@/components/campus/TopicRoomCard";
import { Badge } from "@/components/ui/badge";
import type { CampusRoomConfig, CampusZoneConfig } from "@/lib/campus-rooms";
import { cn } from "cn";

interface SubjectZoneCardProps {
  zone: CampusZoneConfig;
  rooms: CampusRoomConfig[];
  roomCounts: Record<string, number>;
  zoneActiveCount: number;
}

export function SubjectZoneCard({
  zone,
  rooms,
  roomCounts,
  zoneActiveCount,
}: SubjectZoneCardProps) {
  return (
    <section
      data-testid={`zone-card-${zone.id}`}
      className="relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xs"
    >
      <div className={cn("h-1.5 w-full", zone.barClass)} aria-hidden="true" />

      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <span
                className={cn("h-5 w-1 shrink-0 rounded-full", zone.barClass)}
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                {zone.title}
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-600">{zone.description}</p>
          </div>

          <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:flex-col sm:items-end sm:gap-1">
            <Badge
              variant="outline"
              className={cn("gap-1 px-2.5 py-0.5 text-xs", zone.badgeClass)}
            >
              {zone.allowAudioVideo ? (
                <Video className="size-3" />
              ) : (
                <VolumeX className="size-3" />
              )}
              <span>{zone.modeBadge}</span>
            </Badge>
            <span className="tabular-mono text-xs text-slate-500">
              {zone.subtitle} · {zoneActiveCount} in rooms
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {rooms.map((room) => (
            <TopicRoomCard
              key={room.slug}
              room={room}
              zone={zone}
              activeCount={roomCounts[room.slug] ?? 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
