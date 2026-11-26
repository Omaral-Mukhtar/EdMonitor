import type { User } from "@supabase/supabase-js";

/**
 * Only non-anonymous users with a confirmed email address are allowed to enter
 * EdMonitor routes and call authenticated API endpoints.
 */
export function isVerifiedEmailUser(
  user: User | null | undefined
): user is User {
  return Boolean(user && !user.is_anonymous && user.email_confirmed_at);
}

/**
 * Derive a safe default profile display name & avatar color from user metadata or email.
 */
export function deriveProfileDefaults(user: User): {
  displayName: string;
  avatarColor: string;
} {
  const metaName =
    typeof user.user_metadata?.display_name === "string"
      ? user.user_metadata.display_name.trim()
      : "";
  const emailPrefix = (user.email ?? "").split("@")[0]?.trim() ?? "";
  const displayName = (metaName || emailPrefix || "Student").slice(0, 32);

  const metaColor =
    typeof user.user_metadata?.avatar_color === "string"
      ? user.user_metadata.avatar_color.trim()
      : "";
  const avatarColor = /^#[0-9A-Fa-f]{6}$/.test(metaColor)
    ? metaColor
    : "#2563EB";

  return { displayName, avatarColor };
}
