"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Coffee,
  Link2,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  applyTableTimerSync,
  buildTimerSyncPayload,
  formatTimerClock,
  pauseFocusManual,
  resetTimer,
  selectTimerTechnique,
  startBreakBlock,
  startFocusBlock,
  STUDY_TECHNIQUES,
  STUDY_TECHNIQUE_LIST,
  tickTimer,
  type StudyTimerState,
} from "@/lib/study-timer";
import type {
  CampusSubject,
  StudySessionCreateResponse,
  StudySessionPatchResponse,
  StudyTechnique,
  StudyTimerVisualState,
  TimerSyncPayload,
} from "@/types/domain";
import { cn } from "cn";

interface StudyTimerProps {
  roomSlug: string;
  subject: CampusSubject;
  userId: string;
  tableId: string | null;
  timerState: StudyTimerState;
  syncedWithTable: boolean;
  distractionCount: number;
  onResetDistractionCount?: () => void;
  onActiveSessionChange?: (sessionId: string | null) => void;
  onSendTimerSync?: (payload: TimerSyncPayload) => void;
  registerTimerSyncListener?: (
    listener: ((payload: TimerSyncPayload) => void) | null
  ) => void;
  registerResumeHandler?: (handler: (() => Promise<void>) | null) => void;
  onStateChange: React.Dispatch<React.SetStateAction<StudyTimerState>>;
  onSyncedWithTableChange: (synced: boolean) => void;
  registerFinishHandler?: (
    handler: (() => Promise<void>) | null
  ) => void;
}

const VISUAL_STATE_STYLES: Record<
  StudyTimerVisualState,
  {
    pillBorderClass: string;
    digitsClass: string;
    badgeClass: string;
    badgeLabel: string;
    dotClass: string;
  }
> = {
  idle: {
    pillBorderClass: "border-slate-200/85",
    digitsClass: "text-slate-700",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
    badgeLabel: "Ready",
    dotClass: "bg-emerald-500",
  },
  focus: {
    pillBorderClass: "border-emerald-300",
    digitsClass: "text-slate-900",
    badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
    badgeLabel: "Focusing",
    dotClass: "bg-emerald-600",
  },
  paused_distraction: {
    pillBorderClass: "border-red-300",
    digitsClass: "text-red-700",
    badgeClass: "border-red-200 bg-red-50 text-red-700",
    badgeLabel: "Paused · Distraction",
    dotClass: "bg-red-600",
  },
  paused_manual: {
    pillBorderClass: "border-amber-300",
    digitsClass: "text-slate-700",
    badgeClass: "border-amber-200 bg-amber-50 text-amber-700",
    badgeLabel: "Paused",
    dotClass: "bg-amber-500",
  },
  break: {
    pillBorderClass: "border-yellow-300",
    digitsClass: "text-amber-800",
    badgeClass: "border-yellow-200 bg-yellow-50 text-amber-700",
    badgeLabel: "Break Time",
    dotClass: "bg-yellow-500",
  },
};

export function StudyTimer({
  roomSlug,
  subject,
  userId,
  tableId,
  timerState,
  syncedWithTable,
  distractionCount,
  onResetDistractionCount,
  onActiveSessionChange,
  onSendTimerSync,
  registerTimerSyncListener,
  registerResumeHandler,
  onStateChange,
  onSyncedWithTableChange,
  registerFinishHandler,
}: StudyTimerProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const activeSessionIdRef = useRef<string | null>(null);
  const sessionStartingRef = useRef(false);
  const lastTickAtRef = useRef<number>(0);

  const timerStateRef = useRef(timerState);
  const syncedRef = useRef(syncedWithTable);
  const tableIdRef = useRef(tableId);
  const distractionCountRef = useRef(distractionCount);
  const onSendTimerSyncRef = useRef(onSendTimerSync);
  const onActiveSessionChangeRef = useRef(onActiveSessionChange);

  useEffect(() => {
    timerStateRef.current = timerState;
    syncedRef.current = syncedWithTable;
    tableIdRef.current = tableId;
    distractionCountRef.current = distractionCount;
    onSendTimerSyncRef.current = onSendTimerSync;
    onActiveSessionChangeRef.current = onActiveSessionChange;
  }, [
    timerState,
    syncedWithTable,
    tableId,
    distractionCount,
    onSendTimerSync,
    onActiveSessionChange,
  ]);

  const setActiveSessionId = useCallback((sessionId: string | null) => {
    activeSessionIdRef.current = sessionId;
    onActiveSessionChangeRef.current?.(sessionId);
  }, []);

  const ensureServerSession = useCallback(
    async (technique: StudyTechnique, synced: boolean) => {
      if (activeSessionIdRef.current || sessionStartingRef.current) {
        return activeSessionIdRef.current;
      }
      sessionStartingRef.current = true;
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            roomSlug,
            tableId: tableIdRef.current,
            technique,
            syncedWithTable: synced,
          }),
        });
        if (!res.ok) {
          return null;
        }
        const json = (await res.json()) as StudySessionCreateResponse;
        setActiveSessionId(json.session.id);
        return json.session.id;
      } catch {
        return null;
      } finally {
        sessionStartingRef.current = false;
      }
    },
    [roomSlug, setActiveSessionId, subject]
  );

  const patchServerSession = useCallback(
    async (options: {
      endSession: boolean;
      focusedSeconds?: number;
      technique?: StudyTechnique;
      keepalive?: boolean;
    }): Promise<StudySessionPatchResponse | null> => {
      const sessionId = activeSessionIdRef.current;
      if (!sessionId) {
        return null;
      }
      if (options.endSession) {
        setActiveSessionId(null);
      }

      const current = timerStateRef.current;
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          keepalive: options.keepalive,
          body: JSON.stringify({
            focusedSeconds: options.focusedSeconds ?? current.focusedSeconds,
            distractionCount: distractionCountRef.current,
            tableId: tableIdRef.current,
            technique: options.technique ?? current.technique,
            syncedWithTable: syncedRef.current,
            endSession: options.endSession,
          }),
        });
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as StudySessionPatchResponse;
      } catch {
        return null;
      }
    },
    [setActiveSessionId]
  );

  const broadcastTimerState = useCallback(
    (nextState: StudyTimerState) => {
      if (!tableIdRef.current || !syncedRef.current) {
        return;
      }
      const payload = buildTimerSyncPayload(userId, nextState);
      if (!payload) {
        return;
      }
      onSendTimerSyncRef.current?.(payload);
    },
    [userId]
  );

  useEffect(() => {
    if (!registerFinishHandler) {
      return;
    }
    const handler = async () => {
      if (activeSessionIdRef.current) {
        await patchServerSession({ endSession: true, keepalive: true });
      }
    };
    registerFinishHandler(handler);
    return () => {
      registerFinishHandler(null);
    };
  }, [patchServerSession, registerFinishHandler]);

  useEffect(() => {
    return () => {
      if (activeSessionIdRef.current) {
        void patchServerSession({ endSession: true, keepalive: true });
      }
    };
  }, [patchServerSession]);

  // Register listener on the single consolidated `useTableBroadcast` channel
  useEffect(() => {
    if (!registerTimerSyncListener) {
      return;
    }
    const listener = (payload: TimerSyncPayload) => {
      if (!syncedRef.current || !payload) {
        return;
      }
      onStateChange((prev) => {
        const next = applyTableTimerSync(prev, payload);
        if (next.visualState === "focus" && !activeSessionIdRef.current) {
          void ensureServerSession(next.technique, true);
        }
        return next;
      });
      setStatusMessage("Synced with table timer");
    };
    registerTimerSyncListener(listener);
    return () => {
      registerTimerSyncListener(null);
    };
  }, [ensureServerSession, onStateChange, registerTimerSyncListener]);

  useEffect(() => {
    const isRunning =
      timerState.visualState === "focus" || timerState.visualState === "break";
    if (!isRunning) {
      lastTickAtRef.current = 0;
      return;
    }

    lastTickAtRef.current = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickAtRef.current;
      lastTickAtRef.current = now;

      const current = timerStateRef.current;
      const result = tickTimer(current, delta, now);
      if (result.state !== current) {
        onStateChange(result.state);
      }

      if (result.completedFocusBlock) {
        void patchServerSession({
          endSession: true,
          focusedSeconds: result.state.focusedSeconds,
          technique: result.state.technique,
        }).then((saved) => {
          onResetDistractionCount?.();
          if (saved) {
            setStatusMessage(
              `Saved block · ${saved.session.focusScorePct ?? 100}% focus`
            );
          }
        });
        broadcastTimerState(result.state);
      }
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [
    broadcastTimerState,
    onResetDistractionCount,
    onStateChange,
    patchServerSession,
    timerState.visualState,
  ]);

  const handleTechniqueChange = (value: string | null) => {
    if (!value || !(value in STUDY_TECHNIQUES)) {
      return;
    }
    const nextTechnique = value as StudyTechnique;
    if (activeSessionIdRef.current && timerState.focusedSeconds > 0) {
      void patchServerSession({ endSession: true });
    } else {
      setActiveSessionId(null);
    }
    onResetDistractionCount?.();
    const next = selectTimerTechnique(timerState, nextTechnique);
    onStateChange(next);
    setStatusMessage(null);
  };

  const handleStartOrResume = useCallback(async () => {
    const next = startFocusBlock(timerStateRef.current);
    onStateChange(next);
    setStatusMessage(null);
    await ensureServerSession(next.technique, syncedRef.current);
    broadcastTimerState(next);
  }, [broadcastTimerState, ensureServerSession, onStateChange]);

  useEffect(() => {
    if (!registerResumeHandler) {
      return;
    }
    registerResumeHandler(handleStartOrResume);
    return () => {
      registerResumeHandler(null);
    };
  }, [handleStartOrResume, registerResumeHandler]);

  const handlePause = () => {
    const next = pauseFocusManual(timerState);
    onStateChange(next);
    void patchServerSession({ endSession: false });
    broadcastTimerState(next);
  };

  const handleStartBreak = () => {
    const next = startBreakBlock(timerState);
    onStateChange(next);
    void patchServerSession({ endSession: false });
    broadcastTimerState(next);
  };

  const handleFinishBlock = async () => {
    const snapshot = timerStateRef.current;
    const hadActiveSession = Boolean(activeSessionIdRef.current);

    onStateChange(resetTimer(snapshot));
    setIsSaving(true);
    try {
      let result: StudySessionPatchResponse | null = null;
      if (hadActiveSession) {
        result = await patchServerSession({
          endSession: true,
          focusedSeconds: snapshot.focusedSeconds,
          technique: snapshot.technique,
        });
      } else if (snapshot.focusedSeconds > 0) {
        const createdId = await ensureServerSession(
          snapshot.technique,
          syncedRef.current
        );
        if (createdId) {
          result = await patchServerSession({
            endSession: true,
            focusedSeconds: snapshot.focusedSeconds,
            technique: snapshot.technique,
          });
        }
      }
      onResetDistractionCount?.();
      if (result) {
        setStatusMessage(
          `Saved · ${result.streak.currentStreakDays}d streak`
        );
      } else {
        setStatusMessage("Timer reset");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (activeSessionIdRef.current && timerState.focusedSeconds > 0) {
      void handleFinishBlock();
      return;
    }
    setActiveSessionId(null);
    onResetDistractionCount?.();
    onStateChange(resetTimer(timerState));
    setStatusMessage(null);
  };

  const visual = VISUAL_STATE_STYLES[timerState.visualState];
  const techniqueDef = STUDY_TECHNIQUES[timerState.technique];

  return (
    <aside
      data-testid="study-timer-card"
      className="pointer-events-none flex flex-col items-end"
    >
      {/* Minimal Floating Pill */}
      <div
        className={cn(
          "pointer-events-auto flex h-11 items-center gap-2 rounded-full border bg-white/88 px-3 text-slate-900 shadow-lg backdrop-blur-md transition-colors",
          visual.pillBorderClass
        )}
      >
        <span
          className={cn("size-2 shrink-0 rounded-full", visual.dotClass)}
          aria-hidden="true"
        />

        <span
          data-testid="study-timer-clock"
          className={cn(
            "tabular-mono text-base font-semibold tracking-tight",
            visual.digitsClass
          )}
        >
          {formatTimerClock(timerState.displayMs)}
        </span>

        <Badge
          variant="outline"
          data-testid="study-timer-status-badge"
          className={cn(
            "rounded-full px-2 py-0 text-[11px] font-medium",
            visual.badgeClass
          )}
        >
          {visual.badgeLabel}
        </Badge>

        {timerState.visualState === "focus" ? (
          <Button
            type="button"
            size="icon-xs"
            variant="secondary"
            aria-label="Pause timer"
            onClick={handlePause}
            data-testid="timer-pause-button"
            className="size-7 rounded-full bg-slate-100 text-slate-800 hover:bg-slate-200"
          >
            <Pause className="size-3.5" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon-xs"
            aria-label={
              timerState.visualState === "paused_manual" ||
              timerState.visualState === "paused_distraction"
                ? "Resume focus"
                : "Start focus"
            }
            onClick={() => void handleStartOrResume()}
            data-testid="timer-start-button"
            className="size-7 rounded-full bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <Play className="size-3.5" />
          </Button>
        )}

        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Timer options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((prev) => !prev)}
          data-testid="timer-options-trigger"
          className="size-7 rounded-full text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </div>

      {/* Clean Light Popover for Technique, Break/Reset & Table Sync */}
      {menuOpen ? (
        <div
          data-testid="timer-options-popover"
          className="pointer-events-auto mt-2 w-72 rounded-2xl border border-slate-200/90 bg-white/95 p-3.5 text-slate-900 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">
              Study Technique
            </span>
            <span className="tabular-mono text-[11px] text-slate-500">
              Focused {Math.floor(timerState.focusedSeconds / 60)}m{" "}
              {timerState.focusedSeconds % 60}s
            </span>
          </div>

          <div className="mt-2">
            <Select
              value={timerState.technique}
              onValueChange={handleTechniqueChange}
            >
              <SelectTrigger
                size="sm"
                aria-label="Study technique"
                data-testid="study-technique-select"
                className="w-full border-slate-200 bg-slate-50 text-xs text-slate-800 hover:bg-slate-100"
              >
                <SelectValue>
                  {techniqueDef.label} ({techniqueDef.badge})
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="border-slate-200 bg-white text-slate-900">
                {STUDY_TECHNIQUE_LIST.map((item) => (
                  <SelectItem
                    key={item.id}
                    value={item.id}
                    className="text-xs focus:bg-slate-100 focus:text-slate-900"
                  >
                    <span>{item.label}</span>
                    <span className="tabular-mono ml-auto text-[11px] text-slate-500">
                      {item.badge}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {timerState.visualState !== "break" ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleStartBreak}
                data-testid="timer-break-button"
                className="h-8 flex-1 border-amber-200 bg-amber-50/70 px-2.5 text-xs text-amber-800 hover:bg-amber-100"
              >
                <Coffee className="size-3.5" />
                <span>Break</span>
              </Button>
            ) : null}

            {timerState.focusedSeconds > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isSaving}
                onClick={() => void handleFinishBlock()}
                data-testid="timer-finish-button"
                className="h-8 flex-1 border-blue-200 bg-blue-50 px-2.5 text-xs text-blue-700 hover:bg-blue-100"
              >
                <CheckCircle2 className="size-3.5" />
                <span>{isSaving ? "Saving..." : "Finish"}</span>
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleReset}
                aria-label="Reset timer"
                data-testid="timer-reset-button"
                className="h-8 border-slate-200 bg-slate-50 px-2.5 text-xs text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              >
                <RotateCcw className="size-3.5" />
                <span>Reset</span>
              </Button>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <label
              htmlFor="sync-table-timer"
              className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-700"
            >
              <Link2 className="size-3.5 text-slate-400" />
              <span>Sync timer with table</span>
            </label>
            <Switch
              id="sync-table-timer"
              size="sm"
              checked={syncedWithTable}
              disabled={!tableId}
              onCheckedChange={(checked) => {
                onSyncedWithTableChange(checked);
                if (checked && timerState.visualState !== "idle") {
                  syncedRef.current = true;
                  broadcastTimerState(timerState);
                }
              }}
              data-testid="sync-table-switch"
            />
          </div>

          {!tableId ? (
            <p className="mt-1.5 text-[11px] text-slate-500">
              Sit at any table to enable table timer sync.
            </p>
          ) : statusMessage ? (
            <p
              data-testid="timer-status-note"
              className="mt-1.5 text-[11px] font-medium text-emerald-700"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </aside>
  );
}
