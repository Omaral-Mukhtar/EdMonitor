import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { deriveProfileDefaults, isVerifiedEmailUser } from "@/lib/auth-user";
import { getCampusRoomBySlug } from "@/lib/campus-rooms";
import { getLiveKitConfig, mintLiveKitTableToken } from "@/lib/livekit";
import { isValidTableIdForRoom } from "@/lib/study-sessions";
import { createClient } from "@/lib/supabase/server";

export const liveKitTokenRequestSchema = z.object({
  roomSlug: z.string().trim().min(1, "roomSlug is required."),
  tableId: z
    .string()
    .trim()
    .min(1, "tableId is required.")
    .max(32, "tableId is too long."),
});

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

  const parsed = liveKitTokenRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid LiveKit token request.",
      { fieldErrors: parsed.error.flatten().fieldErrors }
    );
  }

  const { roomSlug, tableId } = parsed.data;
  const room = getCampusRoomBySlug(roomSlug);
  if (!room) {
    return apiError(404, "NOT_FOUND", `Study room '${roomSlug}' was not found.`);
  }

  if (!room.allowAudioVideo) {
    return apiError(
      403,
      "FORBIDDEN",
      "Audio/video calls are disabled in General Study silent rooms."
    );
  }

  if (!isValidTableIdForRoom(roomSlug, tableId)) {
    return apiError(
      404,
      "NOT_FOUND",
      `Table '${tableId}' was not found in room '${roomSlug}'.`
    );
  }

  const config = getLiveKitConfig();
  if (!config) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "LiveKit server credentials are not configured."
    );
  }

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string }>();

  const participantName =
    profileRow?.display_name?.trim() || deriveProfileDefaults(user).displayName;

  const minted = await mintLiveKitTableToken({
    config,
    roomSlug,
    tableId,
    participantIdentity: user.id,
    participantName,
  });

  return NextResponse.json(minted, { status: 200 });
}
