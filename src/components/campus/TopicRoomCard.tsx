"use client";

import Link from "next/link";
import { ArrowRight, Video, VolumeX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CampusRoomConfig, CampusZoneConfig } from "@/lib/campus-rooms";
import { cn } from "cn";

interface TopicRoomCardProps {
  room: CampusRoomConfig;
  zone: CampusZoneConfig;
  activeCount: number;
}

export function TopicRoomCard({
  room,
  zone,
  activeCount,
}: TopicRoomCardProps) {
  const filledSeats = Math.min(room.capacity, Math.max(0, activeCount));

  return (
    <article
      data-testid={`room-card-${room.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "tabular-mono inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-semibold",
                zone.badgeClass
              )}
            >
              {room.code}
            </span>
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {room.name}
            </h3>
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-slate-500">
            {room.description}
          </p>
        </div>

        <Badge
          variant="outline"
          className={cn(
            "shrink-0 gap-1 px-2 py-0.5 text-[11px] font-medium",
            zone.badgeClass
          )}
        >
          {room.allowAudioVideo ? (
            <Video className="size-3" />
          ) : (
            <VolumeX className="size-3" />
          )}
          <span>{room.modeBadge}</span>
        </Badge>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-1.5"
            aria-label={`${filledSeats} of ${room.capacity} seats occupied`}
          >
            {Array.from({ length: room.tableCount }, (_, tableIdx) => (
              <div
                key={tableIdx}
                className="flex items-center gap-0.5 rounded-md bg-slate-50 px-1 py-0.5 ring-1 ring-slate-200/70"
              >
                {Array.from({ length: room.seatsPerTable }, (_, seatIdx) => {
                  const flatIndex = tableIdx * room.seatsPerTable + seatIdx;
                  const isOccupied = flatIndex < filledSeats;
                  return (
                    <span
                      key={seatIdx}
                      className={cn(
                        "size-1.5 rounded-full transition-colors",
                        isOccupied ? zone.dotActiveClass : "bg-slate-200"
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <span className="tabular-mono text-xs text-slate-600">
            {room.tableCount} tables · {activeCount}/{room.capacity} active
          </span>
        </div>

        <Button
          size="sm"
          variant={room.allowAudioVideo ? "default" : "outline"}
          nativeButton={false}
          render={<Link href={`/campus/${room.slug}`} prefetch={false} />}
          className={cn(
            "h-7 gap-1 px-2.5 text-xs",
            room.allowAudioVideo
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "border-slate-300 text-slate-800 hover:bg-slate-100"
          )}
        >
          <span>Enter Room</span>
          <ArrowRight data-icon="inline-end" className="size-3" />
        </Button>
      </div>
    </article>
  );
}
