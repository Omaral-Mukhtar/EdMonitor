import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuidParamSchema = z.string().uuid("Invalid study session ID.");

export const createDistractionLogSchema = z.object({
  reason: z.enum(["cell_phone", "face_absent", "look_away"]),
  durationMs: z
    .number()
    .int("durationMs must be an integer.")
    .min(0, "durationMs must be >= 0.")
    .max(86_400_000, "durationMs exceeds 24 hours."),
  triggeredAt: z
    .string()
    .datetime({ offset: true, message: "triggeredAt must be an ISO-8601 timestamp." })
    .optional(),
});

interface SessionOwnershipRow {
  id: string;
  user_id: string;
  distraction_count: number;
}

interface DistractionLogRow {
  id: string;
  session_id: string;
  user_id: string;
  reason: "cell_phone" | "face_absent" | "look_away";
  duration_ms: number;
  triggered_at: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
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

  const { sessionId } = await context.params;
  const parsedId = uuidParamSchema.safeParse(sessionId);
  if (!parsedId.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid study session ID.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON request body.");
  }

  const parsed = createDistractionLogSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid distraction log payload.",
      { fieldErrors: parsed.error.flatten().fieldErrors }
    );
  }

  const lookupClient =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : supabase;

  const { data: sessionRow, error: sessionError } = await lookupClient
    .from("study_sessions")
    .select("id, user_id, distraction_count")
    .eq("id", parsedId.data)
    .maybeSingle<SessionOwnershipRow>();

  if (sessionError) {
    return apiError(500, "INTERNAL_ERROR", "Failed to verify study session.");
  }

  if (!sessionRow) {
    return apiError(404, "NOT_FOUND", "Study session was not found.");
  }

  if (sessionRow.user_id !== user.id) {
    return apiError(
      403,
      "FORBIDDEN",
      "You do not have permission to log distractions for this session."
    );
  }

  const triggeredAt = parsed.data.triggeredAt ?? new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("distraction_logs")
    .insert({
      session_id: sessionRow.id,
      user_id: user.id,
      reason: parsed.data.reason,
      duration_ms: parsed.data.durationMs,
      triggered_at: triggeredAt,
    })
    .select("id, session_id, user_id, reason, duration_ms, triggered_at")
    .single<DistractionLogRow>();

  if (insertError || !inserted) {
    return apiError(500, "INTERNAL_ERROR", "Failed to log distraction event.");
  }

  // Keep parent session's distraction_count incremented in sync with logs.
  await supabase
    .from("study_sessions")
    .update({ distraction_count: (sessionRow.distraction_count ?? 0) + 1 })
    .eq("id", sessionRow.id)
    .eq("user_id", user.id);

  return NextResponse.json(
    {
      distractionLog: {
        id: inserted.id,
        sessionId: inserted.session_id,
        reason: inserted.reason,
        durationMs: inserted.duration_ms,
        triggeredAt: inserted.triggered_at,
      },
    },
    { status: 201 }
  );
}
