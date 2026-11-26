import { MailCheck } from "lucide-react";
import { AuthGateForm } from "@/components/auth/AuthGateForm";
import { Badge } from "@/components/ui/badge";
import { getVerifiedProfile } from "@/lib/profile-server";

export const dynamic = "force-dynamic";

const SUBJECT_WINGS = [
  {
    code: "M-101",
    name: "Math Wing",
    courses: "Calculus, Linear Algebra & Differential Equations",
    barClass: "bg-blue-600",
    badgeClass: "text-blue-700 bg-blue-50 border-blue-200",
  },
  {
    code: "P-101",
    name: "Physics Wing",
    courses: "Mechanics, Electromagnetism & Quantum Foundations",
    barClass: "bg-teal-600",
    badgeClass: "text-teal-700 bg-teal-50 border-teal-200",
  },
  {
    code: "C-101",
    name: "Chemistry Wing",
    courses: "Organic Synthesis & Thermodynamics",
    barClass: "bg-violet-600",
    badgeClass: "text-violet-700 bg-violet-50 border-violet-200",
  },
] as const;

interface LandingPageProps {
  searchParams?: Promise<{ authError?: string }>;
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialAuthError =
    params?.authError === "verification_failed"
      ? "Email verification link is invalid or expired. Request a new verification email."
      : null;

  const existingProfile = await getVerifiedProfile(false);

  return (
    <div className="drafting-grid flex min-h-screen flex-col">
      <header className="h-14 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-semibold text-white">
              EM
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              EdMonitor
            </span>
          </div>

          <Badge variant="outline" className="gap-1.5 bg-white text-slate-700">
            <MailCheck className="size-3.5 text-blue-600" />
            <span>Verified access only</span>
          </Badge>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 items-center px-6 py-12 lg:py-16">
        <div className="grid w-full grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <section className="flex flex-col gap-6 lg:col-span-6">
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                Focused STEM study rooms, built for deep work.
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-slate-600">
                Verify your email to enter Math, Physics, and Chemistry study
                tables with synchronized focus timers, private webcam focus
                guard, a shared drafting whiteboard with Gemini diagrams, and
                conflict-free TA scheduling.
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              {SUBJECT_WINGS.map((wing) => (
                <div
                  key={wing.code}
                  className="flex items-center gap-3.5 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span
                    className={`h-8 w-1 shrink-0 rounded-full ${wing.barClass}`}
                    aria-hidden="true"
                  />
                  <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">
                        {wing.name}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {wing.courses}
                      </p>
                    </div>
                    <span
                      className={`tabular-mono shrink-0 rounded-md border px-2 py-0.5 text-xs font-medium ${wing.badgeClass}`}
                    >
                      {wing.code}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="lg:col-span-6 lg:pl-4">
            <AuthGateForm
              existingProfile={existingProfile}
              initialAuthError={initialAuthError}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
