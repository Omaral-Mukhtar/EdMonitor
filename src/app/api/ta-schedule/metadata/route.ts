import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import { createClient } from "@/lib/supabase/server";
import { fetchTaScheduleMetadata } from "@/lib/ta-schedule-server";

export async function GET() {
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

  const { data, error } = await fetchTaScheduleMetadata(supabase);
  if (error || !data) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Failed to load TA scheduling metadata."
    );
  }

  return NextResponse.json(data, { status: 200 });
}
