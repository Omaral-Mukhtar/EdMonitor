import type { Subject } from "./domain";

export type TaBookingStatus = "scheduled" | "cancelled";

export type ConflictDimension = "cohort" | "ta" | "room";

export interface Course {
  id: string;
  code: string;
  subject: Subject;
  title: string;
}

export interface Cohort {
  id: string;
  code: string;
  label: string;
  studentCount: number;
}

export interface CohortCourse {
  cohortId: string;
  courseId: string;
}

export interface TeachingAssistant {
  id: string;
  courseId: string;
  displayName: string;
  email: string;
}

export interface TaRoom {
  id: string;
  code: string;
  label: string;
  capacity: number;
}

export interface TaBooking {
  id: string;
  courseId: string;
  courseCode?: string;
  subject?: Subject;
  cohortId: string;
  cohortCode?: string;
  taId: string;
  taName?: string;
  roomId: string;
  roomCode?: string;
  topic: string;
  status: TaBookingStatus;
  startsAt: string;
  endsAt: string;
}

export interface TaBookingConflictItem {
  dimension: ConflictDimension;
  bookingId: string;
  courseCode: string;
  topic: string;
  startsAt: string;
  endsAt: string;
}

export interface TaSlotSuggestion {
  startsAt: string;
  endsAt: string;
  roomId: string;
  roomCode: string;
}

export interface TaScheduleMetadataResponse {
  courses: Course[];
  cohorts: Cohort[];
  cohortCourses: CohortCourse[];
  tas: TeachingAssistant[];
  rooms: TaRoom[];
}

export interface TaBookingConflictResponse {
  error: "BOOKING_CONFLICT";
  message: string;
  conflicts: TaBookingConflictItem[];
  suggestions: TaSlotSuggestion[];
}
