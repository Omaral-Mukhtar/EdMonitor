"use client";

import { AlertTriangle, CalendarCheck2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getZonedParts } from "@/lib/ta-conflicts";
import type {
  ConflictDimension,
  TaBookingConflictResponse,
  TaSlotSuggestion,
} from "@/types/ta-schedule";

interface ConflictResolutionBannerProps {
  conflict: TaBookingConflictResponse;
  campusTz: string;
  onApplySuggestion: (suggestion: TaSlotSuggestion) => void;
}

const DIMENSION_LABELS: Record<ConflictDimension, string> = {
  cohort: "Cohort conflict",
  ta: "TA conflict",
  room: "Room conflict",
};

function formatTimeRange(
  startsAtIso: string,
  endsAtIso: string,
  campusTz: string
): string {
  const start = getZonedParts(new Date(startsAtIso), campusTz);
  const end = getZonedParts(new Date(endsAtIso), campusTz);
  const startHm = `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`;
  const endHm = `${String(end.hour).padStart(2, "0")}:${String(end.minute).padStart(2, "0")}`;
  return `${startHm}–${endHm}`;
}

function formatSuggestionChip(
  suggestion: TaSlotSuggestion,
  campusTz: string
): string {
  const startDate = new Date(suggestion.startsAt);
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: campusTz,
    weekday: "short",
  }).format(startDate);
  const timeRange = formatTimeRange(
    suggestion.startsAt,
    suggestion.endsAt,
    campusTz
  );
  return `${weekday} ${timeRange} · ${suggestion.roomCode}`;
}

export function ConflictResolutionBanner({
  conflict,
  campusTz,
  onApplySuggestion,
}: ConflictResolutionBannerProps) {
  const count = conflict.conflicts.length;

  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50/90 p-3.5 text-sm text-red-950"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" />
        <div className="flex flex-1 flex-col gap-1">
          <p className="font-semibold text-red-900">
            Slot Blocked ({count} {count === 1 ? "Conflict" : "Conflicts"} Found)
          </p>
          <ul className="flex flex-col gap-1.5 text-xs text-red-900">
            {conflict.conflicts.map((item, idx) => (
              <li
                key={`${item.dimension}-${item.bookingId}-${idx}`}
                className="flex flex-wrap items-center gap-1.5"
              >
                <Badge
                  variant="destructive"
                  className="h-5 px-1.5 text-[11px] font-medium"
                >
                  {DIMENSION_LABELS[item.dimension]}
                </Badge>
                <span className="font-medium">{item.courseCode}</span>
                <span className="text-red-800">({item.topic})</span>
                <span className="tabular-mono text-red-700">
                  {formatTimeRange(item.startsAt, item.endsAt, campusTz)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {conflict.suggestions.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-red-200/80 pt-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
            <CalendarCheck2 className="size-3.5 text-teal-700" />
            <span>Next conflict-free slots (click to apply):</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {conflict.suggestions.map((suggestion) => (
              <Button
                key={`${suggestion.startsAt}-${suggestion.roomId}`}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onApplySuggestion(suggestion)}
                className="tabular-mono h-7 border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-900"
              >
                {formatSuggestionChip(suggestion, campusTz)}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <p className="border-t border-red-200/80 pt-2 text-xs text-red-800">
          No open 30-minute slots found in the next 7 days for this duration.
        </p>
      )}
    </div>
  );
}
