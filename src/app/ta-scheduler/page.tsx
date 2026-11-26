import { redirect } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { TaSchedulerShell } from "@/components/ta-scheduler/TaSchedulerShell";
import { getVerifiedProfile } from "@/lib/profile-server";
import { createClient } from "@/lib/supabase/server";
import {
  addCalendarDays,
  getZonedParts,
  resolveCampusTimeZone,
} from "@/lib/ta-conflicts";
import {
  fetchTaBookings,
  fetchTaScheduleMetadata,
} from "@/lib/ta-schedule-server";

export const dynamic = "force-dynamic";

function getCurrentWeekMondayKey(timeZone: string): string {
  const local = getZonedParts(new Date(), timeZone);
  const utcDate = new Date(
    Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0)
  );
  const dayOfWeek = utcDate.getUTCDay(); // 0=Sun..6=Sat
  const offsetToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addCalendarDays(local.dateKey, offsetToMonday);
}

export default async function TaSchedulerPage() {
  const profile = await getVerifiedProfile(true);
  if (!profile) {
    redirect("/");
  }

  const campusTz = resolveCampusTimeZone();
  const initialWeekStart = getCurrentWeekMondayKey(campusTz);

  const supabase = await createClient();
  const [metadataRes, bookingsRes] = await Promise.all([
    fetchTaScheduleMetadata(supabase),
    fetchTaBookings(supabase, {
      weekStart: initialWeekStart,
      status: "scheduled",
    }),
  ]);

  const metadata = metadataRes.data ?? {
    courses: [],
    cohorts: [],
    cohortCourses: [],
    tas: [],
    rooms: [],
  };
  const initialBookings = bookingsRes.data ?? [];

  return (
    <div className="drafting-grid flex min-h-screen flex-col">
      <TopNav profile={profile} />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-6 py-8">
        <TaSchedulerShell
          metadata={metadata}
          initialBookings={initialBookings}
          initialWeekStart={initialWeekStart}
          campusTz={campusTz}
        />
      </main>
    </div>
  );
}
