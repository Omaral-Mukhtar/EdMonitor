"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Clock,
  EyeOff,
  Flame,
  RefreshCw,
  Smartphone,
  Target,
  UserX,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCampusRoomBySlug, getSubjectProgressMeta } from "@/lib/campus-rooms";
import type { ProgressResponse, StudyTechnique } from "@/types/domain";
import { cn } from "cn";

interface ProgressSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fallbackStreakDays: number;
}

const TECHNIQUE_LABELS: Record<StudyTechnique, string> = {
  pomodoro: "Pomodoro",
  deep_work: "Deep Work",
  feynman: "Feynman",
  flowtime: "Flowtime",
};

const DISTRACTION_ROWS = [
  {
    key: "cell_phone" as const,
    label: "Phone detected",
    icon: Smartphone,
  },
  {
    key: "face_absent" as const,
    label: "Left desk / face absent",
    icon: UserX,
  },
  {
    key: "look_away" as const,
    label: "Prolonged look-away",
    icon: EyeOff,
  },
];

const WINDOW_OPTIONS = [7, 30, 90] as const;

function formatSessionDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1 && seconds > 0) {
    return `${seconds}s`;
  }
  return `${mins} min`;
}

function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function ProgressSheet({
  open,
  onOpenChange,
  fallbackStreakDays,
}: ProgressSheetProps) {
  const [days, setDays] = useState<number>(30);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);
  const [requestState, setRequestState] = useState<{
    data: ProgressResponse | null;
    error: string | null;
    loadedForKey: string | null;
  }>({
    data: null,
    error: null,
    loadedForKey: null,
  });

  const activeKey = `${days}:${refreshNonce}`;

  useEffect(() => {
    if (!open) {
      return;
    }

    const controller = new AbortController();
    const key = `${days}:${refreshNonce}`;

    fetch(`/api/progress?days=${days}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(payload?.message ?? "Failed to load study progress.");
        }
        return (await response.json()) as ProgressResponse;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setRequestState({ data, error: null, loadedForKey: key });
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setRequestState((prev) => ({
          data: prev.data,
          error:
            err instanceof Error ? err.message : "Could not fetch progress data.",
          loadedForKey: key,
        }));
      });

    return () => {
      controller.abort();
    };
  }, [open, days, refreshNonce]);

  const progress = requestState.data;
  const isLoading = open && requestState.loadedForKey !== activeKey;
  const error =
    requestState.loadedForKey === activeKey ? requestState.error : null;

  const streakDays = progress?.currentStreakDays ?? fallbackStreakDays;
  const totalMinutes = progress?.totalFocusedMinutes ?? 0;
  const averageScore = progress?.averageFocusScorePct ?? 0;

  const subjectEntries = Object.entries(
    progress?.minutesBySubject ?? { math: 0, general: 0 }
  );
  const maxSubjectMinutes = Math.max(
    1,
    ...subjectEntries.map(([, mins]) => mins)
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto bg-white p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4 pr-12">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base font-semibold text-slate-900">
              Study Progress
            </SheetTitle>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
              {WINDOW_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDays(opt)}
                  className={cn(
                    "tabular-mono rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                    days === opt
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {opt}d
                </button>
              ))}
            </div>
          </div>
          <SheetDescription className="text-xs text-slate-500">
            Focused time, focus score, distractions, and streaks across the last{" "}
            {days} days.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 p-5">
          {error ? (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-700">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => setRefreshNonce((n) => n + 1)}
              >
                <RefreshCw className="size-3" />
                <span>Retry</span>
              </Button>
            </div>
          ) : null}

          {/* Summary KPI cards */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Flame className="size-3.5 text-amber-600" />
                <span>Streak</span>
              </div>
              <p className="tabular-mono mt-1.5 text-lg font-semibold text-slate-900">
                {streakDays}d
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="size-3.5 text-blue-600" />
                <span>Focused</span>
              </div>
              <p className="tabular-mono mt-1.5 text-lg font-semibold text-slate-900">
                {isLoading && !progress ? "—" : `${totalMinutes}m`}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Target className="size-3.5 text-emerald-600" />
                <span>Focus score</span>
              </div>
              <p className="tabular-mono mt-1.5 text-lg font-semibold text-slate-900">
                {isLoading && !progress ? "—" : `${averageScore}%`}
              </p>
            </div>
          </div>

          {/* Focused minutes by subject */}
          <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                Focused Minutes by Subject
              </h3>
              <span className="tabular-mono text-xs text-slate-500">
                Last {days}d
              </span>
            </div>

            <div className="flex flex-col gap-3">
              {subjectEntries.map(([subjectKey, minutes]) => {
                const meta = getSubjectProgressMeta(subjectKey);
                const pct =
                  totalMinutes > 0
                    ? Math.round((minutes / maxSubjectMinutes) * 100)
                    : 0;
                return (
                  <div key={subjectKey} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        {meta.label}
                      </span>
                      <span className="tabular-mono font-semibold text-slate-900">
                        {minutes} min
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          meta.barClass
                        )}
                        style={{ width: `${minutes > 0 ? Math.max(pct, 6) : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Distraction breakdown */}
          <section className="flex flex-col gap-2.5 rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Distraction Breakdown
            </h3>
            <div className="divide-y divide-slate-100">
              {DISTRACTION_ROWS.map((item) => {
                const Icon = item.icon;
                const count = progress?.distractionBreakdown[item.key] ?? 0;
                return (
                  <div
                    key={item.key}
                    className="flex items-center justify-between py-2 first:pt-0 last:pb-0"
                  >
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <Icon className="size-3.5 text-slate-400" />
                      <span>{item.label}</span>
                    </div>
                    <span className="tabular-mono rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                      {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recent sessions */}
          <section className="flex flex-col gap-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              Recent Sessions
            </h3>

            {isLoading && !progress ? (
              <div className="flex flex-col gap-2">
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
                <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
              </div>
            ) : progress && progress.recentSessions.length > 0 ? (
              <div className="flex flex-col gap-2">
                {progress.recentSessions.map((session) => {
                  const meta = getSubjectProgressMeta(session.subject);
                  const room = getCampusRoomBySlug(session.roomSlug);
                  return (
                    <div
                      key={session.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={cn(
                              "px-1.5 py-0 text-[11px]",
                              meta.badgeClass
                            )}
                          >
                            {meta.label}
                          </Badge>
                          <span className="truncate text-xs font-semibold text-slate-900">
                            {room?.name ?? session.roomSlug}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {TECHNIQUE_LABELS[session.technique] ??
                            session.technique}{" "}
                          · {formatSessionDate(session.startedAt)}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="tabular-mono text-xs font-semibold text-slate-900">
                          {formatSessionDuration(session.focusedSeconds)}
                        </p>
                        <p className="tabular-mono text-[11px] text-slate-500">
                          {session.focusScorePct !== null
                            ? `${session.focusScorePct}% focus`
                            : "In progress"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center">
                <p className="text-xs font-medium text-slate-700">
                  No study sessions recorded yet.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Enter any General Study or Math room and run a focus timer to
                  track minutes, focus score, and streaks.
                </p>
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
