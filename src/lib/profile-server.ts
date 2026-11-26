import { deriveProfileDefaults, isVerifiedEmailUser } from "@/lib/auth-user";
import { mapProfileRow, type ProfileRow } from "@/lib/profile-validation";
import { createClient } from "@/lib/supabase/server";
import type { UserProfile } from "@/types/domain";

const PROFILE_SELECT =
  "id, display_name, avatar_color, is_guest, current_streak_days, last_study_date, created_at";

/**
 * Load the current verified email user's profile, optionally initializing it
 * from auth metadata/email if this is their first visit after confirming email.
 */
export async function getVerifiedProfile(
  createIfMissing = false
): Promise<UserProfile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isVerifiedEmailUser(user)) {
    return null;
  }

  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  if (data) {
    return mapProfileRow(data);
  }

  if (!createIfMissing) {
    return null;
  }

  const defaults = deriveProfileDefaults(user);
  const { data: created } = await supabase
    .from("profiles")
    .upsert(
      {
        id: user.id,
        display_name: defaults.displayName,
        avatar_color: defaults.avatarColor,
        is_guest: false,
      },
      { onConflict: "id" }
    )
    .select(PROFILE_SELECT)
    .single<ProfileRow>();

  return created ? mapProfileRow(created) : null;
}
