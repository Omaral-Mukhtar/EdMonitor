"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BookingDialog } from "@/components/ta-scheduler/BookingDialog";
import { WeeklyTimetableGrid } from "@/components/ta-scheduler/WeeklyTimetableGrid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addCalendarDays } from "@/lib/ta-conflicts";
import type { Subject } from "@/types/domain";
import type {
  TaBooking,
  TaScheduleMetadataResponse,
} from "@/types/ta-schedule";
import { cn } from "cn";

interface TaSchedulerShellProps {
  metadata: TaScheduleMetadataResponse;
  initialBookings: TaBooking[];
  initialWeekStart: string;
  campusTz: string;
}

const SUBJECT_LABELS: Record<Subject, string> = {
  math: "Math",
  physics: "Physics",
  chemistry: "Chemistry",
};

function formatWeekRangeLabel(weekStart: string): string {
  const weekEnd = addCalendarDays(weekStart, 5); // Mon..Sat
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);

  const startDate = new Date(Date.UTC(sy, sm - 1, sd, 12, 0, 0));
  const endDate = new Date(Date.UTC(ey, em - 1, ed, 12, 0, 0));

  const startText = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(startDate);

  const endText = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(endDate);

  return `${startText} – ${endText}`;
}

export function TaSchedulerShell({
  metadata,
  initialBookings,
  initialWeekStart,
  campusTz,
}: TaSchedulerShellProps) {
  const [role, setRole] = useState<"student" | "ta">("student");
  const [bookings, setBookings] = useState<TaBooking[]>(initialBookings);
  const [weekStart, setWeekStart] = useState(initialWeekStart);
  const [cohortFilter, setCohortFilter] = useState<string>("all");
  const [roomFilter, setRoomFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<"all" | Subject>("all");
  const [isLoadingBookings, setIsLoadingBookings] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogOpenKey, setDialogOpenKey] = useState(0);
  const [dialogDate, setDialogDate] = useState(initialWeekStart);
  const [dialogStartTime, setDialogStartTime] = useState("14:00");
  const [dialogEndTime, setDialogEndTime] = useState("15:00");

  const fetchWeekBookings = useCallback(async (targetWeekStart: string) => {
    setIsLoadingBookings(true);
    setActionError(null);
    try {
      const params = new URLSearchParams({
        weekStart: targetWeekStart,
        status: "scheduled",
      });
      const response = await fetch(`/api/ta-schedule?${params.toString()}`);
      if (!response.ok) {
        const errPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          errPayload?.message ?? "Failed to refresh TA timetable."
        );
      }
      const data = (await response.json()) as { bookings: TaBooking[] };
      setBookings(data.bookings);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not load timetable."
      );
    } finally {
      setIsLoadingBookings(false);
    }
  }, []);

  async function handleChangeWeek(nextWeekStart: string) {
    setWeekStart(nextWeekStart);
    await fetchWeekBookings(nextWeekStart);
  }

  async function handleCancelBooking(bookingId: string) {
    setCancellingId(bookingId);
    setActionError(null);
    try {
      const response = await fetch(`/api/ta-schedule/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!response.ok) {
        const errPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(errPayload?.message ?? "Could not cancel booking.");
      }

      await fetchWeekBookings(weekStart);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Could not cancel booking."
      );
    } finally {
      setCancellingId(null);
    }
  }

  function handleOpenNewBooking() {
    setDialogDate(weekStart);
    setDialogStartTime("14:00");
    setDialogEndTime("15:00");
    setDialogOpenKey((prev) => prev + 1);
    setIsDialogOpen(true);
  }

  function handleQuickCreateSlot(
    dateKey: string,
    startTime: string,
    endTime: string
  ) {
    if (role !== "ta") return;
    setDialogDate(dateKey);
    setDialogStartTime(startTime);
    setDialogEndTime(endTime);
    setDialogOpenKey((prev) => prev + 1);
    setIsDialogOpen(true);
  }

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (cohortFilter !== "all" && b.cohortId !== cohortFilter) return false;
      if (roomFilter !== "all" && b.roomId !== roomFilter) return false;
      if (subjectFilter !== "all" && b.subject !== subjectFilter) return false;
      return true;
    });
  }, [bookings, cohortFilter, roomFilter, subjectFilter]);

  const selectedCohortObj = metadata.cohorts.find((c) => c.id === cohortFilter);
  const selectedRoomObj = metadata.rooms.find((r) => r.id === roomFilter);

  return (
    <div className="flex flex-col gap-5">
      {/* Top Header & 1-Click Role Switch */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="xs"
              nativeButton={false}
              render={<Link href="/campus" />}
              className="-ml-2 text-slate-600"
            >
              <ArrowLeft data-icon="inline-start" />
              <span>Campus Map</span>
            </Button>
            <Badge
              variant="outline"
              className="gap-1 border-slate-200 bg-white text-slate-600"
            >
              <ShieldCheck className="size-3 text-teal-600" />
              <span>3-way conflict guard</span>
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            TA Discussion Scheduler
          </h1>
          <p className="text-sm text-slate-600">
            Weekly STEM discussion timetable with hard-blocked cohort, TA, and
            room overlap protection ({campusTz}).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            role="group"
            aria-label="Scheduler role view"
            className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-xs"
          >
            <button
              type="button"
              aria-pressed={role === "student"}
              onClick={() => setRole("student")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                role === "student"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Users className="size-3.5" />
              <span>Student View</span>
            </button>
            <button
              type="button"
              aria-pressed={role === "ta"}
              onClick={() => setRole("ta")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                role === "ta"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <GraduationCap className="size-3.5" />
              <span>TA View</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters, Week Navigation & TA Primary CTA */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <Select
            value={cohortFilter}
            onValueChange={(val) => {
              if (val) setCohortFilter(val);
            }}
          >
            <SelectTrigger
              aria-label="Filter by cohort"
              className="w-44 bg-white"
            >
              <SelectValue>
                {selectedCohortObj
                  ? `${selectedCohortObj.code}`
                  : "All Cohorts"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cohorts</SelectItem>
              {metadata.cohorts.map((cohort) => (
                <SelectItem key={cohort.id} value={cohort.id}>
                  {cohort.code} · {cohort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={roomFilter}
            onValueChange={(val) => {
              if (val) setRoomFilter(val);
            }}
          >
            <SelectTrigger
              aria-label="Filter by room"
              className="w-40 bg-white"
            >
              <SelectValue>
                {selectedRoomObj ? selectedRoomObj.code : "All Rooms"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Rooms</SelectItem>
              {metadata.rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.code} · {room.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={subjectFilter}
            onValueChange={(val) => {
              if (val) setSubjectFilter(val as "all" | Subject);
            }}
          >
            <SelectTrigger
              aria-label="Filter by subject"
              className="w-36 bg-white"
            >
              <SelectValue>
                {subjectFilter === "all"
                  ? "All Subjects"
                  : SUBJECT_LABELS[subjectFilter]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              <SelectItem value="math">Math</SelectItem>
              <SelectItem value="physics">Physics</SelectItem>
              <SelectItem value="chemistry">Chemistry</SelectItem>
            </SelectContent>
          </Select>

          {/* Subject color legend */}
          <div className="hidden items-center gap-3 pl-2 text-xs text-slate-600 xl:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-blue-600" />
              Math
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-teal-600" />
              Physics
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-violet-600" />
              Chemistry
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isLoadingBookings}
              onClick={() => handleChangeWeek(addCalendarDays(weekStart, -7))}
              aria-label="Previous week"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isLoadingBookings}
              onClick={() => handleChangeWeek(initialWeekStart)}
              className="tabular-mono px-2 text-xs font-medium text-slate-700"
            >
              {formatWeekRangeLabel(weekStart)}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={isLoadingBookings}
              onClick={() => handleChangeWeek(addCalendarDays(weekStart, 7))}
              aria-label="Next week"
            >
              <ChevronRight />
            </Button>
          </div>

          {role === "ta" ? (
            <Button type="button" size="default" onClick={handleOpenNewBooking}>
              <Plus data-icon="inline-start" />
              <span>Schedule Discussion</span>
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
        >
          {actionError}
        </p>
      ) : null}

      <WeeklyTimetableGrid
        bookings={filteredBookings}
        weekStart={weekStart}
        campusTz={campusTz}
        role={role}
        cancellingId={cancellingId}
        onCancelBooking={handleCancelBooking}
        onQuickCreateSlot={handleQuickCreateSlot}
        onOpenNewBooking={handleOpenNewBooking}
      />

      <BookingDialog
        open={isDialogOpen}
        openKey={dialogOpenKey}
        onOpenChange={setIsDialogOpen}
        metadata={metadata}
        campusTz={campusTz}
        initialDate={dialogDate}
        initialStartTime={dialogStartTime}
        initialEndTime={dialogEndTime}
        initialCohortId={cohortFilter !== "all" ? cohortFilter : undefined}
        onCreated={() => fetchWeekBookings(weekStart)}
      />
    </div>
  );
}
