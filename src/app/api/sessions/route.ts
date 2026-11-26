import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { deriveProfileDefaults, isVerifiedEmailUser } from "@/lib/auth-user";
import { getCampusRoomBySlug } from "@/lib/campus-rooms";
import {
  createStudySessionSchema,
  isValidTableIdForRoom,
  mapStudySessionRow,
  type StudySessionRow,
} from "@/lib/study-sessions";
import { createClient } from "@/lib/supabase/server";

const SESSION_SELECT =
  "id, user_id, subject, room_slug, table_id, technique, synced_with_table, focused_seconds, distraction_count, focus_score_pct, started_at, ended_at";

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

  const parsed = createStudySessionSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid study session payload.",
      { fieldErrors: parsed.error.flatten().fieldErrors }
    );
  }

  const { subject, roomSlug, tableId, technique, syncedWithTable } =
    parsed.data;

  const room = getCampusRoomBySlug(roomSlug);
  if (!room) {
    return apiError(404, "NOT_FOUND", `Study room '${roomSlug}' was not found.`);
  }

  if (room.subject !== subject) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      `Subject '${subject}' does not match room '${roomSlug}' (${room.subject}).`
    );
  }

  if (!isValidTableIdForRoom(roomSlug, tableId)) {
    return apiError(
      404,
      "NOT_FOUND",
      `Table '${tableId}' was not found in room '${roomSlug}'.`
    );
  }

  const insertPayload = {
    user_id: user.id,
    subject,
    room_slug: roomSlug,
    table_id: tableId ?? null,
    technique,
    synced_with_table: syncedWithTable,
  };

  let { data, error } = await supabase
    .from("study_sessions")
    .insert(insertPayload)
    .select(SESSION_SELECT)
    .single<StudySessionRow>();

  // Ensure profile row exists if user hits POST /api/sessions before visiting /campus
  if (error?.code === "23503") {
    const defaults = deriveProfileDefaults(user);
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name: defaults.displayName,
        avatar_color: defaults.avatarColor,
        is_guest: false,
      },
      { onConflict: "id" }
    );

    const retry = await supabase
      .from("study_sessions")
      .insert(insertPayload)
      .select(SESSION_SELECT)
      .single<StudySessionRow>();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Failed to create study session."
    );
  }

  return NextResponse.json(
    { session: mapStudySessionRow(data) },
    { status: 201 }
  );
}
