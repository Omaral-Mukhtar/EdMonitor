import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { deriveProfileDefaults, isVerifiedEmailUser } from "@/lib/auth-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  addCalendarDays,
  buildConflictBreakdown,
  createTaBookingSchema,
  findAvailableSlotSuggestions,
  getZonedParts,
  resolveCampusTimeZone,
  SUGGESTION_LOOKAHEAD_DAYS,
  taScheduleQuerySchema,
  validateStudyHoursRange,
  zonedDateTimeToUtc,
  type ScheduledBookingSlot,
} from "@/lib/ta-conflicts";
import {
  fetchTaBookings,
  type TaBookingJoinedRow,
} from "@/lib/ta-schedule-server";
import type { TaBookingConflictResponse, TaRoom } from "@/types/ta-schedule";

interface InsertedBookingRow {
  id: string;
  course_id: string;
  cohort_id: string;
  ta_id: string;
  room_id: string;
  topic: string;
  status: "scheduled" | "cancelled";
  starts_at: string;
  ends_at: string;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !isVerifiedEmailUser(user)) {
    return apiError(
      401,
      "UNAUTHORIZED",
      "Verified email authentication required."
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsedQuery = taScheduleQuerySchema.safeParse({
    cohortId: sp.get("cohortId") || undefined,
    taId: sp.get("taId") || undefined,
    roomId: sp.get("roomId") || undefined,
    courseId: sp.get("courseId") || undefined,
    weekStart: sp.get("weekStart") || undefined,
    status: sp.get("status") || undefined,
  });

  if (!parsedQuery.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsedQuery.error.issues[0]?.message ?? "Invalid timetable query filters.",
      { fieldErrors: parsedQuery.error.flatten().fieldErrors }
    );
  }

  const { data, error } = await fetchTaBookings(supabase, parsedQuery.data);
  if (error || !data) {
    return apiError(500, "INTERNAL_ERROR", "Failed to load TA schedule.");
  }

  return NextResponse.json({ bookings: data }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !isVerifiedEmailUser(user)) {
    return apiError(
      401,
      "UNAUTHORIZED",
      "Verified email authentication required."
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON request body.");
  }

  const parsed = createTaBookingSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid TA booking payload.",
      { fieldErrors: parsed.error.flatten().fieldErrors }
    );
  }

  const input = parsed.data;
  const timeZone = resolveCampusTimeZone();
  const hoursCheck = validateStudyHoursRange(
    input.startsAt,
    input.endsAt,
    timeZone
  );

  if (!hoursCheck.ok) {
    return apiError(400, "VALIDATION_ERROR", hoursCheck.message);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Server database write credentials are not configured."
    );
  }

  // Validate referenced catalog records and relational rules before INSERT.
  const [courseRes, cohortRes, taRes, roomRes, enrollmentRes] =
    await Promise.all([
      admin
        .from("courses")
        .select("id, code")
        .eq("id", input.courseId)
        .maybeSingle<{ id: string; code: string }>(),
      admin
        .from("cohorts")
        .select("id")
        .eq("id", input.cohortId)
        .maybeSingle<{ id: string }>(),
      admin
        .from("tas")
        .select("id, course_id")
        .eq("id", input.taId)
        .maybeSingle<{ id: string; course_id: string }>(),
      admin
        .from("ta_rooms")
        .select("id")
        .eq("id", input.roomId)
        .maybeSingle<{ id: string }>(),
      admin
        .from("cohort_courses")
        .select("cohort_id")
        .eq("cohort_id", input.cohortId)
        .eq("course_id", input.courseId)
        .maybeSingle<{ cohort_id: string }>(),
    ]);

  if (
    courseRes.error ||
    cohortRes.error ||
    taRes.error ||
    roomRes.error ||
    enrollmentRes.error
  ) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Failed to validate course, cohort, TA, and room references."
    );
  }

  if (!courseRes.data) {
    return apiError(400, "VALIDATION_ERROR", "Selected course does not exist.");
  }
  if (!cohortRes.data) {
    return apiError(400, "VALIDATION_ERROR", "Selected cohort does not exist.");
  }
  if (!taRes.data) {
    return apiError(400, "VALIDATION_ERROR", "Selected TA does not exist.");
  }
  if (!roomRes.data) {
    return apiError(400, "VALIDATION_ERROR", "Selected room does not exist.");
  }
  if (taRes.data.course_id !== input.courseId) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Selected TA is not assigned to the selected course."
    );
  }
  if (!enrollmentRes.data) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      "Selected cohort is not enrolled in the selected course."
    );
  }

  // Ensure a profile row exists for created_by FK without overwriting user customizations.
  const defaults = deriveProfileDefaults(user);
  await admin.from("profiles").upsert(
    {
      id: user.id,
      display_name: defaults.displayName,
      avatar_color: defaults.avatarColor,
      is_guest: false,
    },
    { onConflict: "id", ignoreDuplicates: true }
  );

  const { data: inserted, error: insertError } = await admin
    .from("ta_bookings")
    .insert({
      course_id: input.courseId,
      cohort_id: input.cohortId,
      ta_id: input.taId,
      room_id: input.roomId,
      topic: input.topic,
      status: "scheduled",
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      created_by: user.id,
    })
    .select(
      "id, course_id, cohort_id, ta_id, room_id, topic, status, starts_at, ends_at"
    )
    .single<InsertedBookingRow>();

  if (!insertError && inserted) {
    return NextResponse.json(
      {
        booking: {
          id: inserted.id,
          courseId: inserted.course_id,
          cohortId: inserted.cohort_id,
          taId: inserted.ta_id,
          roomId: inserted.room_id,
          topic: inserted.topic,
          status: inserted.status,
          startsAt: inserted.starts_at,
          endsAt: inserted.ends_at,
        },
      },
      { status: 201 }
    );
  }

  // Postgres 23P01 = exclusion_violation from 3-way btree_gist constraints.
  if (insertError?.code === "23P01") {
    const startLocal = getZonedParts(new Date(input.startsAt), timeZone);
    const lookaheadEndDate = addCalendarDays(
      startLocal.dateKey,
      SUGGESTION_LOOKAHEAD_DAYS
    );
    const [ey, em, ed] = lookaheadEndDate.split("-").map(Number);
    const lookaheadEndIso = zonedDateTimeToUtc(
      ey,
      em,
      ed,
      20,
      0,
      timeZone
    ).toISOString();

    const [windowBookingsRes, allRoomsRes] = await Promise.all([
      admin
        .from("ta_bookings")
        .select(
          "id, course_id, cohort_id, ta_id, room_id, topic, status, starts_at, ends_at, courses(code, subject), cohorts(code), tas(display_name), ta_rooms(code)"
        )
        .eq("status", "scheduled")
        .lt("starts_at", lookaheadEndIso)
        .gt("ends_at", input.startsAt)
        .returns<TaBookingJoinedRow[]>(),
      admin
        .from("ta_rooms")
        .select("id, code, label, capacity")
        .order("code", { ascending: true })
        .returns<TaRoom[]>(),
    ]);

    const windowBookings: ScheduledBookingSlot[] = (
      windowBookingsRes.data ?? []
    ).map((row) => {
      const relCourse = Array.isArray(row.courses)
        ? row.courses[0]
        : row.courses;
      return {
        id: row.id,
        courseCode: relCourse?.code ?? "STEM",
        cohortId: row.cohort_id,
        taId: row.ta_id,
        roomId: row.room_id,
        topic: row.topic,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
      };
    });

    const conflicts = buildConflictBreakdown({
      cohortId: input.cohortId,
      taId: input.taId,
      roomId: input.roomId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      overlappingBookings: windowBookings,
    });

    const suggestions = findAvailableSlotSuggestions({
      requestedStartsAt: input.startsAt,
      requestedEndsAt: input.endsAt,
      requestedRoomId: input.roomId,
      cohortId: input.cohortId,
      taId: input.taId,
      rooms: allRoomsRes.data ?? [],
      existingBookings: windowBookings,
      conflictDimensions: conflicts.map((c) => c.dimension),
      timeZone,
      maxSuggestions: 3,
    });

    const payload: TaBookingConflictResponse = {
      error: "BOOKING_CONFLICT",
      message: `Slot blocked due to ${conflicts.length || 1} overlapping constraint(s).`,
      conflicts,
      suggestions,
    };

    return NextResponse.json(payload, { status: 409 });
  }

  return apiError(500, "INTERNAL_ERROR", "Failed to create TA booking.");
}
