import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import {
  mapProfileRow,
  profilePatchSchema,
  type ProfileRow,
} from "@/lib/profile-validation";
import { createClient } from "@/lib/supabase/server";

const PROFILE_SELECT =
  "id, display_name, avatar_color, is_guest, current_streak_days, last_study_date, created_at";

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

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (error) {
    return apiError(500, "INTERNAL_ERROR", "Failed to load user profile.");
  }

  if (!data) {
    return apiError(404, "NOT_FOUND", "User profile has not been initialized.");
  }

  return NextResponse.json({ profile: mapProfileRow(data) }, { status: 200 });
}

export async function PATCH(request: NextRequest) {
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

  const parsed = profilePatchSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid profile input.",
      { fieldErrors }
    );
  }

  const upsertPayload: {
    id: string;
    display_name: string;
    is_guest: boolean;
    avatar_color?: string;
  } = {
    id: user.id,
    display_name: parsed.data.displayName,
    is_guest: false,
  };

  if (parsed.data.avatarColor) {
    upsertPayload.avatar_color = parsed.data.avatarColor;
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(upsertPayload, { onConflict: "id" })
    .select(PROFILE_SELECT)
    .single<ProfileRow>();

  if (error || !data) {
    return apiError(500, "INTERNAL_ERROR", "Failed to save user profile.");
  }

  return NextResponse.json({ profile: mapProfileRow(data) }, { status: 200 });
}
