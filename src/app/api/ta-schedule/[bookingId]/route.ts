import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { patchTaBookingSchema } from "@/lib/ta-conflicts";

const uuidParamSchema = z.string().uuid("Invalid booking ID.");

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ bookingId: string }> }
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

  const { bookingId } = await context.params;
  const parsedId = uuidParamSchema.safeParse(bookingId);
  if (!parsedId.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid booking ID.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON request body.");
  }

  const parsedBody = patchTaBookingSchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsedBody.error.issues[0]?.message ?? "Invalid status update."
    );
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

  const { data, error } = await admin
    .from("ta_bookings")
    .update({ status: parsedBody.data.status })
    .eq("id", parsedId.data)
    .select("id, status")
    .maybeSingle<{ id: string; status: "scheduled" | "cancelled" }>();

  if (error) {
    return apiError(500, "INTERNAL_ERROR", "Failed to cancel TA booking.");
  }

  if (!data) {
    return apiError(404, "NOT_FOUND", "TA booking was not found.");
  }

  return NextResponse.json(
    {
      booking: {
        id: data.id,
        status: data.status,
      },
    },
    { status: 200 }
  );
}
