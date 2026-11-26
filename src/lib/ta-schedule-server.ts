import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addCalendarDays,
  resolveCampusTimeZone,
  zonedDateTimeToUtc,
} from "@/lib/ta-conflicts";
import type { Subject } from "@/types/domain";
import type {
  Cohort,
  CohortCourse,
  Course,
  TaBooking,
  TaBookingStatus,
  TaRoom,
  TaScheduleMetadataResponse,
  TeachingAssistant,
} from "@/types/ta-schedule";

interface CourseRow {
  id: string;
  code: string;
  subject: Subject;
  title: string;
}

interface CohortRow {
  id: string;
  code: string;
  label: string;
  student_count: number;
}

interface CohortCourseRow {
  cohort_id: string;
  course_id: string;
}

interface TaRow {
  id: string;
  course_id: string;
  display_name: string;
  email: string;
}

interface TaRoomRow {
  id: string;
  code: string;
  label: string;
  capacity: number;
}

type Relation<T> = T | T[] | null;

export interface TaBookingJoinedRow {
  id: string;
  course_id: string;
  cohort_id: string;
  ta_id: string;
  room_id: string;
  topic: string;
  status: TaBookingStatus;
  starts_at: string;
  ends_at: string;
  courses: Relation<{ code: string; subject: Subject }>;
  cohorts: Relation<{ code: string }>;
  tas: Relation<{ display_name: string }>;
  ta_rooms: Relation<{ code: string }>;
}

export interface TaBookingFilterParams {
  cohortId?: string;
  taId?: string;
  roomId?: string;
  courseId?: string;
  weekStart?: string;
  status?: TaBookingStatus;
}

function unwrapRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

/** Map a joined `ta_bookings` row to the API `TaBooking` camelCase shape. */
export function mapTaBookingRow(row: TaBookingJoinedRow): TaBooking {
  const course = unwrapRelation(row.courses);
  const cohort = unwrapRelation(row.cohorts);
  const ta = unwrapRelation(row.tas);
  const room = unwrapRelation(row.ta_rooms);

  return {
    id: row.id,
    courseId: row.course_id,
    courseCode: course?.code,
    subject: course?.subject,
    cohortId: row.cohort_id,
    cohortCode: cohort?.code,
    taId: row.ta_id,
    taName: ta?.display_name,
    roomId: row.room_id,
    roomCode: room?.code,
    topic: row.topic,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

/**
 * Fetch pre-seeded courses, cohorts, enrollments, TAs, and discussion rooms.
 */
export async function fetchTaScheduleMetadata(
  supabase: SupabaseClient
): Promise<{ data: TaScheduleMetadataResponse | null; error: string | null }> {
  const [coursesRes, cohortsRes, cohortCoursesRes, tasRes, roomsRes] =
    await Promise.all([
      supabase
        .from("courses")
        .select("id, code, subject, title")
        .order("code", { ascending: true })
        .returns<CourseRow[]>(),
      supabase
        .from("cohorts")
        .select("id, code, label, student_count")
        .order("code", { ascending: true })
        .returns<CohortRow[]>(),
      supabase
        .from("cohort_courses")
        .select("cohort_id, course_id")
        .returns<CohortCourseRow[]>(),
      supabase
        .from("tas")
        .select("id, course_id, display_name, email")
        .order("display_name", { ascending: true })
        .returns<TaRow[]>(),
      supabase
        .from("ta_rooms")
        .select("id, code, label, capacity")
        .order("code", { ascending: true })
        .returns<TaRoomRow[]>(),
    ]);

  const firstError =
    coursesRes.error ??
    cohortsRes.error ??
    cohortCoursesRes.error ??
    tasRes.error ??
    roomsRes.error;

  if (firstError) {
    return { data: null, error: firstError.message };
  }

  const courses: Course[] = (coursesRes.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    subject: row.subject,
    title: row.title,
  }));

  const cohorts: Cohort[] = (cohortsRes.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    studentCount: row.student_count,
  }));

  const cohortCourses: CohortCourse[] = (cohortCoursesRes.data ?? []).map(
    (row) => ({
      cohortId: row.cohort_id,
      courseId: row.course_id,
    })
  );

  const tas: TeachingAssistant[] = (tasRes.data ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    displayName: row.display_name,
    email: row.email,
  }));

  const rooms: TaRoom[] = (roomsRes.data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    capacity: row.capacity,
  }));

  return {
    data: { courses, cohorts, cohortCourses, tas, rooms },
    error: null,
  };
}

/**
 * Fetch TA bookings filtered by cohort, TA, room, course, weekStart (in CAMPUS_TZ), and status.
 */
export async function fetchTaBookings(
  supabase: SupabaseClient,
  filters: TaBookingFilterParams = {}
): Promise<{ data: TaBooking[] | null; error: string | null }> {
  const status = filters.status ?? "scheduled";
  let query = supabase
    .from("ta_bookings")
    .select(
      "id, course_id, cohort_id, ta_id, room_id, topic, status, starts_at, ends_at, courses(code, subject), cohorts(code), tas(display_name), ta_rooms(code)"
    )
    .eq("status", status)
    .order("starts_at", { ascending: true });

  if (filters.cohortId) {
    query = query.eq("cohort_id", filters.cohortId);
  }
  if (filters.taId) {
    query = query.eq("ta_id", filters.taId);
  }
  if (filters.roomId) {
    query = query.eq("room_id", filters.roomId);
  }
  if (filters.courseId) {
    query = query.eq("course_id", filters.courseId);
  }
  if (filters.weekStart) {
    const timeZone = resolveCampusTimeZone();
    const [sy, sm, sd] = filters.weekStart.split("-").map(Number);
    const weekEndKey = addCalendarDays(filters.weekStart, 7);
    const [ey, em, ed] = weekEndKey.split("-").map(Number);

    const weekStartIso = zonedDateTimeToUtc(
      sy,
      sm,
      sd,
      0,
      0,
      timeZone
    ).toISOString();
    const weekEndIso = zonedDateTimeToUtc(
      ey,
      em,
      ed,
      0,
      0,
      timeZone
    ).toISOString();

    query = query.gte("starts_at", weekStartIso).lt("starts_at", weekEndIso);
  }

  const { data, error } = await query.returns<TaBookingJoinedRow[]>();
  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: (data ?? []).map(mapTaBookingRow),
    error: null,
  };
}
