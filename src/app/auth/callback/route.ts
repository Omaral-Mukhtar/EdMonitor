import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { deriveProfileDefaults, isVerifiedEmailUser } from "@/lib/auth-user";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const nextPath = searchParams.get("next");
  const safeNext =
    nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
      ? nextPath
      : "/campus";

  const supabase = await createClient();
  let verified = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verified = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    verified = !error;
  }

  if (verified) {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isVerifiedEmailUser(user)) {
      const { displayName, avatarColor } = deriveProfileDefaults(user);
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          display_name: displayName,
          avatar_color: avatarColor,
          is_guest: false,
        },
        { onConflict: "id", ignoreDuplicates: true }
      );

      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = safeNext;
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  const errorRedirect = request.nextUrl.clone();
  errorRedirect.pathname = "/";
  errorRedirect.search = "?authError=verification_failed";
  return NextResponse.redirect(errorRedirect);
}
