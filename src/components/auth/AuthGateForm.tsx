"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  LogOut,
  MailCheck,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { AVATAR_COLOR_PRESETS, type UserProfile } from "@/types/domain";
import { cn } from "cn";

interface AuthGateFormProps {
  existingProfile: UserProfile | null;
  initialAuthError?: string | null;
}

const COLOR_LABELS: Record<string, string> = {
  "#2563EB": "Cobalt Blue",
  "#0D9488": "Physics Teal",
  "#7C3AED": "Chemistry Iris",
  "#0284C7": "Sky Slate",
  "#475569": "Graphite Slate",
};

export function AuthGateForm({
  existingProfile,
  initialAuthError = null,
}: AuthGateFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState<string>(
    AVATAR_COLOR_PRESETS[0]
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    initialAuthError
  );
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  async function upsertProfile(name: string, color: string) {
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name, avatarColor: color }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      throw new Error(payload?.message ?? "Could not save your profile.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setInfoMessage(null);

    const trimmedEmail = email.trim();
    const trimmedName = displayName.trim();

    if (!trimmedEmail || !password) {
      setErrorMessage("Enter both your email address and password.");
      return;
    }

    if (mode === "signup") {
      if (!trimmedName || trimmedName.length > 32) {
        setErrorMessage(
          "Enter a display name between 1 and 32 characters."
        );
        return;
      }
      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const origin = window.location.origin;

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: `${origin}/auth/callback`,
            data: {
              display_name: trimmedName,
              avatar_color: avatarColor,
            },
          },
        });

        if (error) {
          throw new Error(error.message);
        }

        if (data.user && data.user.identities?.length === 0) {
          setErrorMessage(
            "An account with this email already exists. Switch to Sign in."
          );
          setIsSubmitting(false);
          return;
        }

        // Email verification is required before entering the app
        if (!data.session || !data.user?.email_confirmed_at) {
          if (data.session) {
            await supabase.auth.signOut();
          }
          setPendingVerificationEmail(trimmedEmail);
          setInfoMessage(
            `Verification link sent to ${trimmedEmail}. Confirm your email before signing in.`
          );
          setIsSubmitting(false);
          return;
        }

        await upsertProfile(trimmedName, avatarColor);
        router.push("/campus");
        router.refresh();
        return;
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes("email not confirmed")) {
          setPendingVerificationEmail(trimmedEmail);
          setErrorMessage(
            "Your email is not verified yet. Check your inbox or resend the confirmation email."
          );
          setIsSubmitting(false);
          return;
        }
        throw new Error(error.message);
      }

      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        setPendingVerificationEmail(trimmedEmail);
        setErrorMessage(
          "Verify your email address before entering EdMonitor."
        );
        setIsSubmitting(false);
        return;
      }

      const profileRes = await fetch("/api/profile");
      if (profileRes.status === 404) {
        const metaName =
          typeof data.user.user_metadata?.display_name === "string"
            ? data.user.user_metadata.display_name.trim()
            : "";
        const metaColor =
          typeof data.user.user_metadata?.avatar_color === "string"
            ? data.user.user_metadata.avatar_color
            : avatarColor;
        const fallbackName = (
          metaName ||
          trimmedEmail.split("@")[0] ||
          "Student"
        ).slice(0, 32);
        await upsertProfile(fallbackName, metaColor);
      } else if (!profileRes.ok) {
        throw new Error("Signed in, but failed to load your profile.");
      }

      router.push("/campus");
      router.refresh();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Authentication failed."
      );
      setIsSubmitting(false);
    }
  }

  async function handleResendVerification() {
    if (!pendingVerificationEmail) {
      return;
    }

    setIsResending(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: pendingVerificationEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        throw new Error(error.message);
      }
      setInfoMessage(
        `Sent a new verification email to ${pendingVerificationEmail}.`
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Could not resend verification email."
      );
    } finally {
      setIsResending(false);
    }
  }

  async function handleSignOut() {
    setIsSubmitting(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    setIsSubmitting(false);
  }

  if (existingProfile) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-lg text-slate-900">
              Verified account active
            </CardTitle>
            <Badge variant="secondary">Email verified</Badge>
          </div>
          <CardDescription>
            Your verified session is active and ready for the STEM campus.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-3">
              <span
                className="flex size-9 items-center justify-center rounded-full text-sm font-semibold text-white"
                style={{ backgroundColor: existingProfile.avatarColor }}
              >
                {existingProfile.displayName.charAt(0).toUpperCase()}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-slate-900">
                  {existingProfile.displayName}
                </span>
                <span className="tabular-mono text-xs text-slate-500">
                  {existingProfile.currentStreakDays}d focus streak
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              size="lg"
              className="flex-1"
              nativeButton={false}
              render={<Link href="/campus" />}
            >
              <span>Enter campus</span>
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={isSubmitting}
              onClick={handleSignOut}
            >
              <LogOut data-icon="inline-start" />
              <span>Sign out</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 pb-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg text-slate-900">
            Access EdMonitor
          </CardTitle>
          <Badge variant="outline" className="gap-1 text-slate-700">
            <MailCheck className="size-3.5 text-blue-600" />
            <span>Verified email required</span>
          </Badge>
        </div>
        <CardDescription>
          Sign in with your verified email or create an account and confirm your
          inbox link to enter the campus.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 pt-5">
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value as "signin" | "signup");
            setErrorMessage(null);
            setInfoMessage(null);
          }}
        >
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Create account
            </TabsTrigger>
          </TabsList>

          <TabsContent value={mode} className="mt-4">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {mode === "signup" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="signup-display-name"
                      className="text-sm font-medium text-slate-700"
                    >
                      Display name
                    </label>
                    <Input
                      id="signup-display-name"
                      name="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Youssef"
                      maxLength={32}
                      autoComplete="name"
                      disabled={isSubmitting}
                      className="h-10 bg-white"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      Avatar ink
                    </span>
                    <div
                      className="flex items-center gap-2.5"
                      role="radiogroup"
                      aria-label="Avatar color"
                    >
                      {AVATAR_COLOR_PRESETS.map((preset) => {
                        const isSelected = avatarColor === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={COLOR_LABELS[preset] ?? preset}
                            onClick={() => setAvatarColor(preset)}
                            disabled={isSubmitting}
                            className={cn(
                              "flex size-8 items-center justify-center rounded-full border-2 transition-transform focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:outline-none",
                              isSelected
                                ? "scale-105 border-slate-900"
                                : "border-transparent hover:scale-105"
                            )}
                            style={{ backgroundColor: preset }}
                          >
                            {isSelected ? (
                              <Check
                                className="size-4 text-white"
                                strokeWidth={2.5}
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="auth-email"
                  className="text-sm font-medium text-slate-700"
                >
                  Email address
                </label>
                <Input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  autoComplete="email"
                  disabled={isSubmitting}
                  className="h-10 bg-white"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="auth-password"
                  className="text-sm font-medium text-slate-700"
                >
                  Password
                </label>
                <Input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  autoComplete={
                    mode === "signin" ? "current-password" : "new-password"
                  }
                  disabled={isSubmitting}
                  className="h-10 bg-white"
                />
              </div>

              {errorMessage ? (
                <p
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {errorMessage}
                </p>
              ) : null}

              {infoMessage ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">
                  <p>{infoMessage}</p>
                </div>
              ) : null}

              {pendingVerificationEmail ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isResending}
                  onClick={handleResendVerification}
                >
                  <RefreshCw data-icon="inline-start" />
                  <span>
                    {isResending
                      ? "Sending verification email..."
                      : "Resend verification email"}
                  </span>
                </Button>
              ) : null}

              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="h-10 w-full"
              >
                <span>
                  {isSubmitting
                    ? mode === "signin"
                      ? "Signing in..."
                      : "Creating account..."
                    : mode === "signin"
                      ? "Sign in with verified email"
                      : "Create account & send verification"}
                </span>
                <ArrowRight data-icon="inline-end" />
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
