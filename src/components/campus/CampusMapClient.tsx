"use client";

import { useState } from "react";
import { ProgressSheet } from "@/components/campus/ProgressSheet";
import { SubjectZoneCard } from "@/components/campus/SubjectZoneCard";
import { TopNav } from "@/components/layout/TopNav";
import { useCampusPresence } from "@/hooks/useCampusPresence";
import {
  CAMPUS_ROOMS,
  CAMPUS_ZONES,
  getCampusRoomsByZone,
} from "@/lib/campus-rooms";
import type { UserProfile } from "@/types/domain";

interface CampusMapClientProps {
  profile: UserProfile;
}

export function CampusMapClient({ profile }: CampusMapClientProps) {
  const [progressOpen, setProgressOpen] = useState(false);

  const presence = useCampusPresence({
    userId: profile.id,
    roomSlug: null,
    halo: "green",
  });

  return (
    <div className="drafting-grid flex min-h-screen flex-col">
      <TopNav
        profile={profile}
        onOpenProgress={() => setProgressOpen(true)}
        progressOpen={progressOpen}
      />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-6 sm:px-6 lg:py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              Choose a study room
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">
              Join a silent hall for distraction-free blocks or a math room for
              table voice, video, and AI plotting.
            </p>
          </div>

          <div
            data-testid="campus-live-summary"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs"
          >
            <span
              className="size-2 rounded-full bg-emerald-600"
              aria-hidden="true"
            />
            <span className="tabular-mono">
              Live across campus: {presence.totalActive} studying ·{" "}
              {presence.focusedGreenCount} focused (green)
            </span>
          </div>
        </div>

        <section
          aria-label="2-Wing Architectural Blueprint Map"
          className="relative flex flex-col items-center"
        >
          {/* Central Campus Quad summary badge */}
          <div
            data-testid="campus-quad-badge"
            className="relative z-10 inline-flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-xs"
          >
            <span
              className="size-2 rounded-full bg-emerald-600"
              aria-hidden="true"
            />
            <span className="font-semibold text-slate-900">Campus Quad</span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="tabular-mono">
              {CAMPUS_ZONES.length} Active Zones
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="tabular-mono">{CAMPUS_ROOMS.length} Rooms</span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="tabular-mono font-semibold text-slate-900">
              {presence.totalActive} Studying
            </span>
          </div>

          {/* Non-interactive architectural blueprint walkways connecting Quad to the 2 Wings */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1000 56"
            preserveAspectRatio="none"
            className="pointer-events-none hidden h-11 w-full lg:block"
          >
            <path
              d="M 500 0 L 500 22 L 245 22 L 245 56"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <path
              d="M 500 22 L 755 22 L 755 56"
              fill="none"
              stroke="#94A3B8"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
            <circle cx="500" cy="22" r="3.5" fill="#475569" />
            <circle cx="245" cy="52" r="3.5" fill="#475569" />
            <circle cx="755" cy="52" r="3.5" fill="#2563EB" />
          </svg>

          {/* 2-Wing DOM Grid (extensible for future subject wings) */}
          <div className="mt-4 grid w-full grid-cols-1 gap-6 lg:mt-0 lg:grid-cols-2">
            {CAMPUS_ZONES.map((zone) => (
              <SubjectZoneCard
                key={zone.id}
                zone={zone}
                rooms={getCampusRoomsByZone(zone.id)}
                roomCounts={presence.roomCounts}
                zoneActiveCount={presence.zoneCounts[zone.id] ?? 0}
              />
            ))}
          </div>
        </section>
      </main>

      <ProgressSheet
        open={progressOpen}
        onOpenChange={setProgressOpen}
        fallbackStreakDays={profile.currentStreakDays}
      />
    </div>
  );
}
