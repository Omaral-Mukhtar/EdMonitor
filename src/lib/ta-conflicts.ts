import { z } from "zod";
import type {
  ConflictDimension,
  TaBookingConflictItem,
  TaRoom,
  TaSlotSuggestion,
} from "@/types/ta-schedule";

export const STUDY_START_MINUTES = 8 * 60; // 08:00
export const STUDY_END_MINUTES = 20 * 60; // 20:00
export const SLOT_STEP_MINUTES = 30;
export const SUGGESTION_LOOKAHEAD_DAYS = 7;

export const createTaBookingSchema = z.object({
  courseId: z.string().uuid("Invalid courseId."),
  cohortId: z.string().uuid("Invalid cohortId."),
  taId: z.string().uuid("Invalid taId."),
  roomId: z.string().uuid("Invalid roomId."),
  topic: z
    .string()
    .trim()
    .min(1, "Topic is required.")
    .max(160, "Topic must be 160 characters or fewer."),
  startsAt: z.string().datetime({ offset: true, message: "Invalid startsAt ISO-8601 datetime." }),
  endsAt: z.string().datetime({ offset: true, message: "Invalid endsAt ISO-8601 datetime." }),
});

export type CreateTaBookingInput = z.infer<typeof createTaBookingSchema>;

export const patchTaBookingSchema = z.object({
  status: z.literal("cancelled", {
    error: "Status must be 'cancelled'.",
  }),
});

export const taScheduleQuerySchema = z.object({
  cohortId: z.string().uuid().optional(),
  taId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  courseId: z.string().uuid().optional(),
  weekStart: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD.")
    .optional(),
  status: z.enum(["scheduled", "cancelled"]).default("scheduled"),
});

export interface ZonedDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dateKey: string;
  minutesFromMidnight: number;
}

export interface ScheduledBookingSlot {
  id: string;
  courseCode: string;
  cohortId: string;
  taId: string;
  roomId: string;
  topic: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Resolve the configured campus IANA timezone, falling back to UTC if invalid.
 */
export function resolveCampusTimeZone(tz?: string): string {
  const candidate = (tz ?? process.env.CAMPUS_TZ ?? "UTC").trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return "UTC";
  }
}

/**
 * Extract calendar date and wall-clock time parts for an instant in a target IANA timezone.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedDateTimeParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const year = lookup("year");
  const month = lookup("month");
  const day = lookup("day");
  const rawHour = lookup("hour");
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = lookup("minute");
  const second = lookup("second");

  const dateKey = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey,
    minutesFromMidnight: hour * 60 + minute,
  };
}

/**
 * Convert a wall-clock date/time in `timeZone` to an exact UTC Date.
 */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let utcMs = targetAsUtc;
  for (let i = 0; i < 2; i += 1) {
    const parts = getZonedParts(new Date(utcMs), timeZone);
    const localAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      0
    );
    const diffMs = localAsUtc - targetAsUtc;
    if (diffMs === 0) {
      break;
    }
    utcMs -= diffMs;
  }

  return new Date(utcMs);
}

/**
 * Add calendar days to a YYYY-MM-DD date string without timezone drift.
 */
export function addCalendarDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days, 0, 0, 0, 0));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Half-open interval overlap check `[aStart, aEnd) && [bStart, bEnd)`.
 * Back-to-back ranges (e.g. 10:00–11:00 and 11:00–12:00) return false.
 */
export function rangesOverlap(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number
): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

/**
 * Validate that a requested booking interval has `endsAt > startsAt`
 * and stays within 08:00–20:00 on a single local calendar day in `timeZone`.
 */
export function validateStudyHoursRange(
  startsAtIso: string,
  endsAtIso: string,
  timeZone: string
): { ok: true; startMs: number; endMs: number } | { ok: false; message: string } {
  const startDate = new Date(startsAtIso);
  const endDate = new Date(endsAtIso);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return { ok: false, message: "Invalid booking start or end timestamp." };
  }

  if (endMs <= startMs) {
    return { ok: false, message: "End time must be after start time." };
  }

  const startLocal = getZonedParts(startDate, timeZone);
  const endLocal = getZonedParts(endDate, timeZone);

  if (startLocal.minutesFromMidnight < STUDY_START_MINUTES) {
    return {
      ok: false,
      message: `Discussions must start at or after 08:00 (${timeZone}).`,
    };
  }

  // Handle exact 20:00 end on the same calendar day (where local minutes = 1200)
  // vs midnight rollover (00:00 next day is outside 08:00-20:00).
  const isSameDay = startLocal.dateKey === endLocal.dateKey;
  if (!isSameDay) {
    return {
      ok: false,
      message: `Discussions must start and end on the same day within 08:00–20:00 (${timeZone}).`,
    };
  }

  const endTotalSeconds = endLocal.minutesFromMidnight * 60 + endLocal.second;
  if (endTotalSeconds > STUDY_END_MINUTES * 60) {
    return {
      ok: false,
      message: `Discussions must end by 20:00 (${timeZone}).`,
    };
  }

  return { ok: true, startMs, endMs };
}

/**
 * Build the structured 3-way conflict breakdown across cohort, TA, and room dimensions.
 */
export function buildConflictBreakdown(params: {
  cohortId: string;
  taId: string;
  roomId: string;
  startsAt: string;
  endsAt: string;
  overlappingBookings: ScheduledBookingSlot[];
}): TaBookingConflictItem[] {
  const reqStartMs = Date.parse(params.startsAt);
  const reqEndMs = Date.parse(params.endsAt);
  const conflicts: TaBookingConflictItem[] = [];

  for (const booking of params.overlappingBookings) {
    const bStartMs = Date.parse(booking.startsAt);
    const bEndMs = Date.parse(booking.endsAt);

    if (!rangesOverlap(reqStartMs, reqEndMs, bStartMs, bEndMs)) {
      continue;
    }

    if (booking.cohortId === params.cohortId) {
      conflicts.push({
        dimension: "cohort",
        bookingId: booking.id,
        courseCode: booking.courseCode,
        topic: booking.topic,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      });
    }

    if (booking.taId === params.taId) {
      conflicts.push({
        dimension: "ta",
        bookingId: booking.id,
        courseCode: booking.courseCode,
        topic: booking.topic,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      });
    }

    if (booking.roomId === params.roomId) {
      conflicts.push({
        dimension: "room",
        bookingId: booking.id,
        courseCode: booking.courseCode,
        topic: booking.topic,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      });
    }
  }

  return conflicts;
}

/**
 * Check whether a candidate [startMs, endMs) window in `roomId` is free for
 * the target cohort, TA, and room against all scheduled bookings.
 */
function isCandidateWindowFree(
  startMs: number,
  endMs: number,
  cohortId: string,
  taId: string,
  roomId: string,
  existingBookings: ScheduledBookingSlot[]
): boolean {
  for (const booking of existingBookings) {
    if (
      booking.cohortId !== cohortId &&
      booking.taId !== taId &&
      booking.roomId !== roomId
    ) {
      continue;
    }

    const bStartMs = Date.parse(booking.startsAt);
    const bEndMs = Date.parse(booking.endsAt);
    if (rangesOverlap(startMs, endMs, bStartMs, bEndMs)) {
      return false;
    }
  }

  return true;
}

/**
 * Scan forward in 30-minute increments within 08:00–20:00 in `timeZone` to find
 * up to 3 conflict-free slots matching the requested duration.
 *
 * When only `room` conflicted at the requested window, checks alternate rooms
 * at the exact requested time first, then prefers the requested room on forward slots.
 */
export function findAvailableSlotSuggestions(params: {
  requestedStartsAt: string;
  requestedEndsAt: string;
  requestedRoomId: string;
  cohortId: string;
  taId: string;
  rooms: TaRoom[];
  existingBookings: ScheduledBookingSlot[];
  conflictDimensions: ConflictDimension[];
  timeZone: string;
  maxSuggestions?: number;
}): TaSlotSuggestion[] {
  const maxSuggestions = params.maxSuggestions ?? 3;
  const reqStartMs = Date.parse(params.requestedStartsAt);
  const reqEndMs = Date.parse(params.requestedEndsAt);
  const durationMs = reqEndMs - reqStartMs;

  if (Number.isNaN(durationMs) || durationMs <= 0) {
    return [];
  }

  const requestedRoom = params.rooms.find((r) => r.id === params.requestedRoomId);
  if (!requestedRoom) {
    return [];
  }

  const suggestions: TaSlotSuggestion[] = [];
  const seenKeys = new Set<string>();

  const pushSuggestion = (startMs: number, endMs: number, room: TaRoom) => {
    const key = `${startMs}:${endMs}:${room.id}`;
    if (seenKeys.has(key) || suggestions.length >= maxSuggestions) {
      return;
    }
    seenKeys.add(key);
    suggestions.push({
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(endMs).toISOString(),
      roomId: room.id,
      roomCode: room.code,
    });
  };

  const uniqueDims = new Set(params.conflictDimensions);
  const onlyRoomConflicted =
    uniqueDims.size === 1 && uniqueDims.has("room");

  // 1. If only the room conflicted, suggest an alternate free room at the exact requested time first.
  if (onlyRoomConflicted) {
    for (const altRoom of params.rooms) {
      if (altRoom.id === requestedRoom.id) {
        continue;
      }
      if (
        isCandidateWindowFree(
          reqStartMs,
          reqEndMs,
          params.cohortId,
          params.taId,
          altRoom.id,
          params.existingBookings
        )
      ) {
        pushSuggestion(reqStartMs, reqEndMs, altRoom);
        break;
      }
    }
  }

  // 2. Scan forward in 30-minute steps within 08:00-20:00 in CAMPUS_TZ, preferring the requested room.
  const startLocal = getZonedParts(new Date(reqStartMs), params.timeZone);
  const stepMs = SLOT_STEP_MINUTES * 60 * 1000;

  // Snap forward to the next 30-minute boundary strictly after reqStartMs.
  const minuteMod = startLocal.minute % SLOT_STEP_MINUTES;
  const hasSubMinute = startLocal.second > 0 || new Date(reqStartMs).getUTCMilliseconds() > 0;
  const minutesToNextStep =
    minuteMod === 0 && !hasSubMinute
      ? SLOT_STEP_MINUTES
      : SLOT_STEP_MINUTES - minuteMod;
  const firstCandidateMin = startLocal.minutesFromMidnight + minutesToNextStep;

  const collectForRooms = (candidateRooms: TaRoom[]) => {
    for (let dayOffset = 0; dayOffset < SUGGESTION_LOOKAHEAD_DAYS; dayOffset += 1) {
      if (suggestions.length >= maxSuggestions) {
        break;
      }

      const dateKey = addCalendarDays(startLocal.dateKey, dayOffset);
      const [year, month, day] = dateKey.split("-").map(Number);

      const dayStartUtc = zonedDateTimeToUtc(
        year,
        month,
        day,
        8,
        0,
        params.timeZone
      ).getTime();
      const dayEndUtc = zonedDateTimeToUtc(
        year,
        month,
        day,
        20,
        0,
        params.timeZone
      ).getTime();

      let cursorMs: number;
      if (dayOffset === 0) {
        const candidateHour = Math.floor(firstCandidateMin / 60);
        const candidateMinute = firstCandidateMin % 60;
        if (firstCandidateMin >= STUDY_END_MINUTES) {
          continue;
        }
        cursorMs = Math.max(
          dayStartUtc,
          zonedDateTimeToUtc(
            year,
            month,
            day,
            candidateHour,
            candidateMinute,
            params.timeZone
          ).getTime()
        );
      } else {
        cursorMs = dayStartUtc;
      }

      while (cursorMs + durationMs <= dayEndUtc) {
        if (suggestions.length >= maxSuggestions) {
          break;
        }

        const candidateEndMs = cursorMs + durationMs;
        for (const room of candidateRooms) {
          if (
            isCandidateWindowFree(
              cursorMs,
              candidateEndMs,
              params.cohortId,
              params.taId,
              room.id,
              params.existingBookings
            )
          ) {
            pushSuggestion(cursorMs, candidateEndMs, room);
            break;
          }
        }

        cursorMs += stepMs;
      }
    }
  };

  collectForRooms([requestedRoom]);

  // 3. Fallback to alternate rooms on future slots only if requested room had fewer than 3 slots.
  if (suggestions.length < maxSuggestions) {
    const alternateRooms = params.rooms.filter((r) => r.id !== requestedRoom.id);
    if (alternateRooms.length > 0) {
      collectForRooms(alternateRooms);
    }
  }

  return suggestions;
}
