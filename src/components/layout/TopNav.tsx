"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Compass,
  Flame,
  LogOut,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/types/domain";
import { cn } from "cn";

interface TopNavProps {
  profile: UserProfile | null;
  rightSlot?: ReactNode;
  onOpenProgress?: () => void;
  progressOpen?: boolean;
}

export function TopNav({
  profile,
  rightSlot,
  onOpenProgress,
  progressOpen,
}: TopNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const isCampusActive = pathname.startsWith("/campus");
  const isSchedulerActive = pathname.startsWith("/ta-scheduler");

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-6">
          <Link
            href={profile ? "/campus" : "/"}
            className="flex shrink-0 items-center gap-2 text-slate-900 transition-opacity hover:opacity-85"
          >
            <span className="flex size-7 items-center justify-center rounded-md bg-slate-900 font-mono text-xs font-semibold text-white">
              EM
            </span>
            <span className="hidden text-sm font-semibold tracking-tight sm:inline">
              EdMonitor
            </span>
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-1">
            <Link
              href="/campus"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm",
                isCampusActive
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <Compass className="hidden size-4 shrink-0 sm:block" />
              <span className="sm:hidden">Campus</span>
              <span className="hidden sm:inline">Campus Map</span>
            </Link>
            <Link
              href="/ta-scheduler"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:px-3 sm:text-sm",
                isSchedulerActive
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <CalendarClock className="hidden size-4 shrink-0 sm:block" />
              <span className="sm:hidden">TA</span>
              <span className="hidden sm:inline">TA Scheduler</span>
            </Link>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {rightSlot}

          {profile ? (
            <>
              {onOpenProgress ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenProgress}
                  aria-expanded={progressOpen}
                  data-testid="open-progress-button"
                  className="h-8 gap-1.5 border-slate-200 bg-slate-50 px-2 text-slate-800 hover:bg-slate-100 sm:px-2.5"
                >
                  <Flame className="hidden size-3.5 text-amber-600 sm:block" />
                  <span className="tabular-mono hidden text-xs font-medium sm:inline">
                    Streak: {profile.currentStreakDays}d
                  </span>
                  <span
                    className="hidden text-slate-300 sm:inline"
                    aria-hidden="true"
                  >
                    |
                  </span>
                  <BarChart3 className="size-3.5 text-blue-600" />
                  <span className="text-xs font-semibold">Progress</span>
                </Button>
              ) : (
                <Badge
                  variant="secondary"
                  className="hidden gap-1.5 px-2.5 py-1 sm:inline-flex"
                >
                  <Flame className="size-3.5 text-amber-600" />
                  <span className="tabular-mono text-xs font-medium text-slate-700">
                    {profile.currentStreakDays}d streak
                  </span>
                </Badge>
              )}

              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 p-1 sm:py-1 sm:pr-2.5 sm:pl-1.5">
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: profile.avatarColor }}
                  aria-hidden="true"
                >
                  {profile.displayName.charAt(0).toUpperCase()}
                </span>
                <span className="hidden max-w-24 truncate text-sm font-medium text-slate-900 sm:inline sm:max-w-32">
                  {profile.displayName}
                </span>
                {profile.isGuest ? (
                  <Badge
                    variant="outline"
                    className="hidden h-4 px-1.5 text-[11px] md:inline-flex"
                  >
                    Guest
                  </Badge>
                ) : null}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                aria-label="Sign out"
              >
                <LogOut data-icon="inline-start" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            </>
          ) : (
            <Button
              variant="default"
              size="sm"
              nativeButton={false}
              render={<Link href="/" />}
            >
              Join campus
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
