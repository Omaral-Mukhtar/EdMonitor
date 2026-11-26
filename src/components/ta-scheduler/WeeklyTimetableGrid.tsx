"use client";

import { useMemo } from "react";
import { CalendarPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addCalendarDays, getZonedParts } from "@/lib/ta-conflicts";
import type { Subject } from "@/types/domain";
import type { TaBooking } from "@/types/ta-schedule";
import { cn } from "cn";

interface WeeklyTimetableGridProps {
  bookings: TaBooking[];
  weekStart: string;
  campusTz: string;
  role: "student" | "ta";
  cancellingId: string | null;
  onCancelBooking: (bookingId: string) => void;
  onQuickCreateSlot: (dateKey: string, startTime: string, endTime: string) => void;
  onOpenNewBooking: () => void;
}

const ROW_HEIGHT_PX = 28;
const GRID_START_MINUTES = 8 * 60; // 08:00
const GRID_END_MINUTES = 20 * 60; // 20:00
const TOTAL_SLOTS = (GRID_END_MINUTES - GRID_START_MINUTES) / 30; // 24 half-hour rows

const SUBJECT_STYLES: Record<
  Subject,
  { card: string; badge: string; dot: string }
> = {
  math: {
    card: "border-blue-200 border-l-blue-600 bg-blue-50/95 text-blue-950",
    badge: "text-blue-700",
    dot: "bg-blue-600",
  },
  physics: {
    card: "border-teal-200 border-l-teal-600 bg-teal-50/95 text-teal-950",
    badge: "text-teal-700",
    dot: "bg-teal-600",
  },
  chemistry: {
    card: "border-violet-200 border-l-violet-600 bg-violet-50/95 text-violet-950",
    badge: "text-violet-700",
    dot: "bg-violet-600",
  },
};

interface PositionedBooking {
  booking: TaBooking;
  startSlot: number;
  spanSlots: number;
  startLabel: string;
  endLabel: string;
  laneIndex: number;
  laneCount: number;
}

function formatHm(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function assignDayLanes(
  items: Array<{
    booking: TaBooking;
    startSlot: number;
    spanSlots: number;
    startLabel: string;
    endLabel: string;
  }>
): PositionedBooking[] {
  const sorted = [...items].sort((a, b) => a.startSlot - b.startSlot);
  const result: PositionedBooking[] = [];

  // Group overlapping intervals into connected clusters so side-by-side cards never collide visually.
  let cluster: typeof sorted = [];
  let clusterEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEndSlots: number[] = [];
    const assigned = cluster.map((item) => {
      let laneIndex = laneEndSlots.findIndex((end) => end <= item.startSlot);
      if (laneIndex === -1) {
        laneIndex = laneEndSlots.length;
        laneEndSlots.push(item.startSlot + item.spanSlots);
      } else {
        laneEndSlots[laneIndex] = item.startSlot + item.spanSlots;
      }
      return { ...item, laneIndex };
    });
    const laneCount = Math.max(1, laneEndSlots.length);
    for (const item of assigned) {
      result.push({ ...item, laneCount });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const item of sorted) {
    const itemEnd = item.startSlot + item.spanSlots;
    if (cluster.length === 0 || item.startSlot < clusterEnd) {
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, itemEnd);
    } else {
      flushCluster();
      cluster.push(item);
      clusterEnd = itemEnd;
    }
  }
  flushCluster();

  return result;
}

export function WeeklyTimetableGrid({
  bookings,
  weekStart,
  campusTz,
  role,
  cancellingId,
  onCancelBooking,
  onQuickCreateSlot,
  onOpenNewBooking,
}: WeeklyTimetableGridProps) {
  const days = useMemo(() => {
    return Array.from({ length: 6 }, (_, index) => {
      const dateKey = addCalendarDays(weekStart, index);
      const [y, m, d] = dateKey.split("-").map(Number);
      const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
      const weekday = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "short",
      }).format(utcNoon);
      const dayLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
      }).format(utcNoon);
      return { dateKey, weekday, dayLabel };
    });
  }, [weekStart]);

  const bookingsByDay = useMemo(() => {
    const buckets = new Map<
      string,
      Array<{
        booking: TaBooking;
        startSlot: number;
        spanSlots: number;
        startLabel: string;
        endLabel: string;
      }>
    >();

    for (const day of days) {
      buckets.set(day.dateKey, []);
    }

    for (const booking of bookings) {
      const startParts = getZonedParts(new Date(booking.startsAt), campusTz);
      const endParts = getZonedParts(new Date(booking.endsAt), campusTz);
      const dayBucket = buckets.get(startParts.dateKey);
      if (!dayBucket) continue;

      const clampedStartMin = Math.max(
        GRID_START_MINUTES,
        startParts.minutesFromMidnight
      );
      const clampedEndMin = Math.min(
        GRID_END_MINUTES,
        endParts.dateKey === startParts.dateKey
          ? endParts.minutesFromMidnight
          : GRID_END_MINUTES
      );
      if (clampedEndMin <= clampedStartMin) continue;

      const startSlot = (clampedStartMin - GRID_START_MINUTES) / 30;
      const spanSlots = Math.max(1, (clampedEndMin - clampedStartMin) / 30);

      dayBucket.push({
        booking,
        startSlot,
        spanSlots,
        startLabel: formatHm(startParts.hour, startParts.minute),
        endLabel: formatHm(endParts.hour, endParts.minute),
      });
    }

    const positioned = new Map<string, PositionedBooking[]>();
    for (const [dateKey, items] of buckets.entries()) {
      positioned.set(dateKey, assignDayLanes(items));
    }
    return positioned;
  }, [bookings, campusTz, days]);

  const timeSlots = useMemo(() => {
    return Array.from({ length: TOTAL_SLOTS }, (_, index) => {
      const mins = GRID_START_MINUTES + index * 30;
      const hour = Math.floor(mins / 60);
      const minute = mins % 60;
      const endMins = Math.min(GRID_END_MINUTES, mins + 60);
      return {
        index,
        label: formatHm(hour, minute),
        isHour: minute === 0,
        defaultEndLabel: formatHm(Math.floor(endMins / 60), endMins % 60),
      };
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="overflow-x-auto">
        <div className="min-w-[820px]">
          {/* Day Headers */}
          <div className="flex border-b border-slate-200 bg-slate-50/80">
            <div className="tabular-mono flex w-16 shrink-0 items-center justify-center border-r border-slate-200 px-2 py-2.5 text-xs font-medium text-slate-500">
              {campusTz}
            </div>
            <div className="grid flex-1 grid-cols-6 divide-x divide-slate-200">
              {days.map((day) => (
                <div
                  key={day.dateKey}
                  className="flex items-baseline justify-between px-3 py-2.5"
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {day.weekday}
                  </span>
                  <span className="tabular-mono text-xs text-slate-500">
                    {day.dayLabel}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Timetable Body */}
          <div className="relative flex">
            {/* Time Axis */}
            <div className="w-16 shrink-0 border-r border-slate-200 bg-slate-50/40">
              {timeSlots.map((slot) => (
                <div
                  key={slot.label}
                  style={{ height: `${ROW_HEIGHT_PX}px` }}
                  className={cn(
                    "tabular-mono flex items-start justify-end pr-2 text-[11px]",
                    slot.isHour
                      ? "border-t border-slate-200 pt-0.5 font-medium text-slate-600"
                      : "text-transparent"
                  )}
                >
                  {slot.isHour ? slot.label : ""}
                </div>
              ))}
            </div>

            {/* 6 Day Columns */}
            <div className="grid flex-1 grid-cols-6 divide-x divide-slate-200">
              {days.map((day) => {
                const dayBookings = bookingsByDay.get(day.dateKey) ?? [];

                return (
                  <div
                    key={day.dateKey}
                    className="relative"
                    style={{ height: `${TOTAL_SLOTS * ROW_HEIGHT_PX}px` }}
                  >
                    {/* Background 30-min grid lines */}
                    {timeSlots.map((slot) => (
                      <button
                        key={slot.label}
                        type="button"
                        disabled={role !== "ta"}
                        onClick={() =>
                          onQuickCreateSlot(
                            day.dateKey,
                            slot.label,
                            slot.defaultEndLabel
                          )
                        }
                        aria-label={
                          role === "ta"
                            ? `Schedule discussion on ${day.weekday} ${day.dayLabel} at ${slot.label}`
                            : undefined
                        }
                        style={{ height: `${ROW_HEIGHT_PX}px` }}
                        className={cn(
                          "block w-full border-t text-left transition-colors",
                          slot.isHour
                            ? "border-slate-200/80"
                            : "border-dashed border-slate-100",
                          role === "ta"
                            ? "cursor-pointer hover:bg-blue-50/50"
                            : "cursor-default"
                        )}
                      />
                    ))}

                    {/* Positioned Booking Blocks */}
                    {dayBookings.map((item) => {
                      const subject = item.booking.subject ?? "math";
                      const style = SUBJECT_STYLES[subject];
                      const widthPct = 100 / item.laneCount;
                      const leftPct = item.laneIndex * widthPct;
                      const isCompact = item.spanSlots <= 1;

                      return (
                        <div
                          key={item.booking.id}
                          style={{
                            top: `${item.startSlot * ROW_HEIGHT_PX + 2}px`,
                            height: `${item.spanSlots * ROW_HEIGHT_PX - 4}px`,
                            left: `calc(${leftPct}% + 3px)`,
                            width: `calc(${widthPct}% - 6px)`,
                          }}
                          className={cn(
                            "absolute z-10 flex flex-col justify-between overflow-hidden rounded-lg border border-l-4 px-2 py-1 shadow-xs",
                            style.card
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span
                                  className={cn(
                                    "size-1.5 shrink-0 rounded-full",
                                    style.dot
                                  )}
                                />
                                <span
                                  className={cn(
                                    "truncate text-xs font-semibold",
                                    style.badge
                                  )}
                                >
                                  {item.booking.courseCode ?? "STEM"} ·{" "}
                                  {item.booking.cohortCode ?? "Cohort"}
                                </span>
                              </div>
                              {!isCompact ? (
                                <p
                                  className="mt-0.5 truncate text-xs font-medium text-slate-900"
                                  title={item.booking.topic}
                                >
                                  {item.booking.topic}
                                </p>
                              ) : null}
                            </div>

                            {role === "ta" ? (
                              <button
                                type="button"
                                disabled={cancellingId === item.booking.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCancelBooking(item.booking.id);
                                }}
                                aria-label={`Cancel ${item.booking.courseCode ?? "TA"} discussion`}
                                title="Cancel discussion"
                                className="shrink-0 rounded p-0.5 text-slate-500 transition-colors hover:bg-red-100 hover:text-red-700 disabled:opacity-50"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            ) : null}
                          </div>

                          {!isCompact ? (
                            <p className="tabular-mono truncate text-[11px] text-slate-600">
                              {item.startLabel}–{item.endLabel} ·{" "}
                              {item.booking.roomCode ?? "Room"} ·{" "}
                              {item.booking.taName ?? "TA"}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Empty State Overlay */}
            {bookings.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-6">
                <div className="pointer-events-auto flex max-w-md flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white/95 px-6 py-5 text-center shadow-sm backdrop-blur-xs">
                  <CalendarPlus className="size-7 text-slate-400" />
                  <div className="flex flex-col gap-1">
                    <p className="text-sm font-semibold text-slate-900">
                      No TA discussions scheduled for this cohort this week.
                    </p>
                    <p className="text-xs text-slate-600">
                      {role === "ta"
                        ? "Schedule a session below or click any 30-minute time slot on the grid."
                        : "Switch to TA View in the header to schedule a discussion session."}
                    </p>
                  </div>
                  {role === "ta" ? (
                    <Button type="button" size="sm" onClick={onOpenNewBooking}>
                      <CalendarPlus data-icon="inline-start" />
                      <span>Schedule First Session</span>
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
