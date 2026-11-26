import { z } from "zod";
import { CAMPUS_ZONES, getCampusRoomBySlug } from "@/lib/campus-rooms";
import type { StudySessionRecord, StudyTechnique } from "@/types/domain";

const ACTIVE_SUBJECT_IDS = new Set<string>(CAMPUS_ZONES.map((z) => z.id));

export const studyTechniqueSchema = z.enum([
  "pomodoro",
  "deep_work",
  "feynman",
  "flowtime",
]);

export const createStudySessionSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required.")
    .refine((value) => ACTIVE_SUBJECT_IDS.has(value), {
      message: "Subject must be an active campus zone (math or general).",
    }),
  roomSlug: z.string().trim().min(1, "Room slug is required."),
  tableId: z.string().trim().min(1).max(32).nullable().optional().default(null),
  technique: studyTechniqueSchema,
  syncedWithTable: z.boolean().optional().default(false),
});

export const patchStudySessionSchema = z.object({
  focusedSeconds: z.number().int().min(0).max(86400).optional(),
  distractionCount: z.number().int().min(0).max(10000).optional(),
  tableId: z.string().trim().min(1).max(32).nullable().optional(),
  technique: studyTechniqueSchema.optional(),
  syncedWithTable: z.boolean().optional(),
  endSession: z.boolean().optional(),
});

export function isValidTableIdForRoom(
  roomSlug: string,
  tableId: string | null | undefined
): boolean {
  if (tableId === null || tableId === undefined) {
    return true;
  }
  const room = getCampusRoomBySlug(roomSlug);
  if (!room) {
    return false;
  }
  const match = /^table-(\d+)$/.exec(tableId);
  if (!match) {
    return false;
  }
  const tableNumber = Number.parseInt(match[1], 10);
  return tableNumber >= 1 && tableNumber <= room.tableCount;
}

export interface StudySessionRow {
  id: string;
  user_id: string;
  subject: string;
  room_slug: string;
  table_id: string | null;
  technique: StudyTechnique;
  synced_with_table: boolean;
  focused_seconds: number;
  distraction_count: number;
  focus_score_pct: number | null;
  started_at: string;
  ended_at: string | null;
}

export function mapStudySessionRow(row: StudySessionRow): StudySessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    roomSlug: row.room_slug,
    tableId: row.table_id,
    technique: row.technique,
    syncedWithTable: row.synced_with_table,
    focusedSeconds: row.focused_seconds,
    distractionCount: row.distraction_count,
    focusScorePct: row.focus_score_pct,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}
