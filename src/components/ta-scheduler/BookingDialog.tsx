"use client";

import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, Plus } from "lucide-react";
import { ConflictResolutionBanner } from "@/components/ta-scheduler/ConflictResolutionBanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getZonedParts, zonedDateTimeToUtc } from "@/lib/ta-conflicts";
import type {
  TaBookingConflictResponse,
  TaScheduleMetadataResponse,
  TaSlotSuggestion,
} from "@/types/ta-schedule";

interface BookingDialogProps {
  open: boolean;
  openKey: number;
  onOpenChange: (open: boolean) => void;
  metadata: TaScheduleMetadataResponse;
  campusTz: string;
  initialDate: string;
  initialStartTime: string;
  initialEndTime: string;
  initialCohortId?: string;
  onCreated: () => Promise<void> | void;
}

function buildTimeSlots(startHour: number, endHour: number, includeEnd: boolean) {
  const slots: string[] = [];
  for (let mins = startHour * 60; mins <= endHour * 60; mins += 30) {
    if (!includeEnd && mins === endHour * 60) {
      continue;
    }
    const h = String(Math.floor(mins / 60)).padStart(2, "0");
    const m = String(mins % 60).padStart(2, "0");
    slots.push(`${h}:${m}`);
  }
  return slots;
}

const START_TIME_OPTIONS = buildTimeSlots(8, 20, false); // 08:00..19:30
const END_TIME_OPTIONS = buildTimeSlots(8, 20, true).slice(1); // 08:30..20:00

function computeInitialSelections(
  metadata: TaScheduleMetadataResponse,
  initialCohortId?: string
) {
  const courseId = metadata.courses[0]?.id ?? "";
  const matchingTas = metadata.tas.filter((t) => t.courseId === courseId);
  const matchingCohortIds = new Set(
    metadata.cohortCourses
      .filter((cc) => cc.courseId === courseId)
      .map((cc) => cc.cohortId)
  );
  const cohortId =
    initialCohortId && matchingCohortIds.has(initialCohortId)
      ? initialCohortId
      : metadata.cohorts.find((c) => matchingCohortIds.has(c.id))?.id ??
        metadata.cohorts[0]?.id ??
        "";

  return {
    courseId,
    cohortId,
    taId: matchingTas[0]?.id ?? metadata.tas[0]?.id ?? "",
    roomId: metadata.rooms[0]?.id ?? "",
  };
}

function BookingDialogForm({
  metadata,
  campusTz,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialCohortId,
  onOpenChange,
  onCreated,
}: Omit<BookingDialogProps, "open" | "openKey">) {
  const initial = computeInitialSelections(metadata, initialCohortId);

  const [courseId, setCourseId] = useState(initial.courseId);
  const [cohortId, setCohortId] = useState(initial.cohortId);
  const [taId, setTaId] = useState(initial.taId);
  const [roomId, setRoomId] = useState(initial.roomId);
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<TaBookingConflictResponse | null>(
    null
  );
  const [appliedHint, setAppliedHint] = useState<string | null>(null);

  const enrolledCohorts = useMemo(() => {
    const enrolledIds = new Set(
      metadata.cohortCourses
        .filter((cc) => cc.courseId === courseId)
        .map((cc) => cc.cohortId)
    );
    const filtered = metadata.cohorts.filter((c) => enrolledIds.has(c.id));
    return filtered.length > 0 ? filtered : metadata.cohorts;
  }, [courseId, metadata.cohortCourses, metadata.cohorts]);

  const courseTas = useMemo(() => {
    const filtered = metadata.tas.filter((t) => t.courseId === courseId);
    return filtered.length > 0 ? filtered : metadata.tas;
  }, [courseId, metadata.tas]);

  function handleCourseChange(nextCourseId: string | null) {
    if (!nextCourseId) {
      return;
    }
    setCourseId(nextCourseId);
    const nextTas = metadata.tas.filter((t) => t.courseId === nextCourseId);
    if (nextTas.length > 0) {
      setTaId(nextTas[0].id);
    }
    const enrolledIds = new Set(
      metadata.cohortCourses
        .filter((cc) => cc.courseId === nextCourseId)
        .map((cc) => cc.cohortId)
    );
    if (!enrolledIds.has(cohortId)) {
      const firstEnrolled = metadata.cohorts.find((c) => enrolledIds.has(c.id));
      if (firstEnrolled) {
        setCohortId(firstEnrolled.id);
      }
    }
    setConflict(null);
    setValidationError(null);
  }

  function handleApplySuggestion(suggestion: TaSlotSuggestion) {
    const startParts = getZonedParts(new Date(suggestion.startsAt), campusTz);
    const endParts = getZonedParts(new Date(suggestion.endsAt), campusTz);

    setDate(startParts.dateKey);
    setStartTime(
      `${String(startParts.hour).padStart(2, "0")}:${String(startParts.minute).padStart(2, "0")}`
    );
    setEndTime(
      `${String(endParts.hour).padStart(2, "0")}:${String(endParts.minute).padStart(2, "0")}`
    );
    setRoomId(suggestion.roomId);
    setConflict(null);
    setValidationError(null);
    setAppliedHint(
      `Applied ${startParts.dateKey} ${String(startParts.hour).padStart(2, "0")}:${String(startParts.minute).padStart(2, "0")}–${String(endParts.hour).padStart(2, "0")}:${String(endParts.minute).padStart(2, "0")} in ${suggestion.roomCode}. Click Schedule Discussion to confirm.`
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidationError(null);
    setConflict(null);

    const trimmedTopic = topic.trim();
    if (!trimmedTopic) {
      setValidationError("Enter a discussion topic.");
      return;
    }

    if (!date || !startTime || !endTime) {
      setValidationError("Select a date, start time, and end time.");
      return;
    }

    const [y, m, d] = date.split("-").map(Number);
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);

    const startsAt = zonedDateTimeToUtc(
      y,
      m,
      d,
      sh,
      sm,
      campusTz
    ).toISOString();
    const endsAt = zonedDateTimeToUtc(y, m, d, eh, em, campusTz).toISOString();

    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setValidationError("End time must be after start time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/ta-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          cohortId,
          taId,
          roomId,
          topic: trimmedTopic,
          startsAt,
          endsAt,
        }),
      });

      if (response.status === 409) {
        const conflictData =
          (await response.json()) as TaBookingConflictResponse;
        setConflict(conflictData);
        setAppliedHint(null);
        return;
      }

      if (!response.ok) {
        const errPayload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        setValidationError(
          errPayload?.message ?? "Failed to schedule TA discussion."
        );
        return;
      }

      await onCreated();
      onOpenChange(false);
    } catch {
      setValidationError("Network error while scheduling TA discussion.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedCourse = metadata.courses.find((c) => c.id === courseId);
  const selectedCohort = enrolledCohorts.find((c) => c.id === cohortId);
  const selectedTa = courseTas.find((t) => t.id === taId);
  const selectedRoom = metadata.rooms.find((r) => r.id === roomId);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-course"
            className="text-xs font-medium text-slate-700"
          >
            Course
          </label>
          <Select value={courseId} onValueChange={handleCourseChange}>
            <SelectTrigger id="booking-course" className="w-full bg-white">
              <SelectValue>
                {selectedCourse
                  ? `${selectedCourse.code} · ${selectedCourse.title}`
                  : "Select course"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {metadata.courses.map((course) => (
                <SelectItem key={course.id} value={course.id}>
                  {course.code} · {course.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-cohort"
            className="text-xs font-medium text-slate-700"
          >
            Student Cohort
          </label>
          <Select
            value={cohortId}
            onValueChange={(val) => {
              if (val) setCohortId(val);
              setConflict(null);
            }}
          >
            <SelectTrigger id="booking-cohort" className="w-full bg-white">
              <SelectValue>
                {selectedCohort
                  ? `${selectedCohort.code} (${selectedCohort.studentCount})`
                  : "Select cohort"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {enrolledCohorts.map((cohort) => (
                <SelectItem key={cohort.id} value={cohort.id}>
                  {cohort.code} · {cohort.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-ta"
            className="text-xs font-medium text-slate-700"
          >
            Teaching Assistant
          </label>
          <Select
            value={taId}
            onValueChange={(val) => {
              if (val) setTaId(val);
              setConflict(null);
            }}
          >
            <SelectTrigger id="booking-ta" className="w-full bg-white">
              <SelectValue>
                {selectedTa ? selectedTa.displayName : "Select TA"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {courseTas.map((ta) => (
                <SelectItem key={ta.id} value={ta.id}>
                  {ta.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-room"
            className="text-xs font-medium text-slate-700"
          >
            Discussion Room
          </label>
          <Select
            value={roomId}
            onValueChange={(val) => {
              if (val) setRoomId(val);
              setConflict(null);
            }}
          >
            <SelectTrigger id="booking-room" className="w-full bg-white">
              <SelectValue>
                {selectedRoom
                  ? `${selectedRoom.code} · ${selectedRoom.label}`
                  : "Select room"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {metadata.rooms.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.code} · {room.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="booking-topic"
          className="text-xs font-medium text-slate-700"
        >
          Discussion Topic
        </label>
        <Input
          id="booking-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Integration by Parts & Practice Problems"
          maxLength={160}
          disabled={isSubmitting}
          className="bg-white"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-date"
            className="text-xs font-medium text-slate-700"
          >
            Date ({campusTz})
          </label>
          <Input
            id="booking-date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setConflict(null);
            }}
            disabled={isSubmitting}
            className="tabular-mono bg-white"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-start"
            className="text-xs font-medium text-slate-700"
          >
            Start Time
          </label>
          <Select
            value={startTime}
            onValueChange={(val) => {
              if (val) setStartTime(val);
              setConflict(null);
            }}
          >
            <SelectTrigger
              id="booking-start"
              className="tabular-mono w-full bg-white"
            >
              <SelectValue>{startTime}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {START_TIME_OPTIONS.map((slot) => (
                <SelectItem key={slot} value={slot} className="tabular-mono">
                  {slot}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="booking-end"
            className="text-xs font-medium text-slate-700"
          >
            End Time
          </label>
          <Select
            value={endTime}
            onValueChange={(val) => {
              if (val) setEndTime(val);
              setConflict(null);
            }}
          >
            <SelectTrigger
              id="booking-end"
              className="tabular-mono w-full bg-white"
            >
              <SelectValue>{endTime}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {END_TIME_OPTIONS.map((slot) => (
                <SelectItem key={slot} value={slot} className="tabular-mono">
                  {slot}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {appliedHint ? (
        <div className="flex items-start gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-600" />
          <span>{appliedHint}</span>
        </div>
      ) : null}

      {validationError ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {validationError}
        </p>
      ) : null}

      {conflict ? (
        <ConflictResolutionBanner
          conflict={conflict}
          campusTz={campusTz}
          onApplySuggestion={handleApplySuggestion}
        />
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          <Plus data-icon="inline-start" />
          <span>{isSubmitting ? "Scheduling..." : "Schedule Discussion"}</span>
        </Button>
      </DialogFooter>
    </form>
  );
}

export function BookingDialog({
  open,
  openKey,
  onOpenChange,
  metadata,
  campusTz,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialCohortId,
  onCreated,
}: BookingDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>Schedule TA Discussion</DialogTitle>
          <DialogDescription>
            Protected by atomic 3-way conflict blocking across student cohort,
            TA, and room ({campusTz}).
          </DialogDescription>
        </DialogHeader>

        <BookingDialogForm
          key={openKey}
          metadata={metadata}
          campusTz={campusTz}
          initialDate={initialDate}
          initialStartTime={initialStartTime}
          initialEndTime={initialEndTime}
          initialCohortId={initialCohortId}
          onOpenChange={onOpenChange}
          onCreated={onCreated}
        />
      </DialogContent>
    </Dialog>
  );
}
