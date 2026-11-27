"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, PauseCircle, X } from "lucide-react";
import { AiEnhancerPanel } from "@/components/whiteboard/AiEnhancerPanel";
import { SvgOverlayLayer } from "@/components/whiteboard/SvgOverlayLayer";
import {
  WhiteboardCanvas,
  type WhiteboardCanvasHandle,
} from "@/components/whiteboard/WhiteboardCanvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDefaultMathTopicForRoom } from "@/lib/ai/math-syllabus";
import type { CampusRoomConfig } from "@/lib/campus-rooms";
import type {
  DiagnosticAnswerInput,
  DiagnosticCheckResponse,
  WhiteboardAiMode,
  WhiteboardAiResponse,
  WhiteboardStroke,
} from "@/types/whiteboard";

interface WhiteboardOverlayProps {
  open: boolean;
  room: CampusRoomConfig;
  tableId: string | null;
  onClose: () => void;
}

type PendingAiAction =
  | { kind: "enhance" }
  | { kind: "diagnose" }
  | { kind: "explain_topic"; withDiagnostics: boolean };

export function WhiteboardOverlay({
  open,
  room,
  tableId,
  onClose,
}: WhiteboardOverlayProps) {
  // Strictly solo local browser state (ZERO Supabase Broadcast events)
  const [strokes, setStrokes] = useState<WhiteboardStroke[]>([]);
  const [mode, setMode] = useState<WhiteboardAiMode>("generate");
  const [topicId, setTopicId] = useState<string>(() =>
    getDefaultMathTopicForRoom(room.slug)
  );
  const [prompt, setPrompt] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingPhase, setLoadingPhase] = useState<"idle" | "diagnose" | "explain">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [diagnosticCheck, setDiagnosticCheck] =
    useState<DiagnosticCheckResponse | null>(null);
  const [diagnosticAnswers, setDiagnosticAnswers] = useState<
    Record<string, string>
  >({});
  const [aiResponse, setAiResponse] = useState<WhiteboardAiResponse | null>(
    null
  );
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [showAiOverlay, setShowAiOverlay] = useState<boolean>(true);
  const [dimSketch, setDimSketch] = useState<boolean>(true);

  const canvasHandleRef = useRef<WhiteboardCanvasHandle | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastActionRef = useRef<PendingAiAction | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleCancelRequest = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setLoadingPhase("idle");
  }, []);

  const executeEnhance = useCallback(async () => {
    if (isLoading) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    const canvasPngBase64 = canvasHandleRef.current?.exportPngBase64() ?? "";
    if (!canvasPngBase64) {
      setErrorMessage("Unable to capture whiteboard sketch.");
      return;
    }

    lastActionRef.current = { kind: "enhance" };
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setLoadingPhase("explain");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/ai/whiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "enhance",
          subject: "math",
          roomSlug: room.slug,
          tableId,
          topicId,
          prompt: trimmedPrompt || undefined,
          canvasPngBase64,
        }),
      });

      const payload = (await response.json()) as
        | WhiteboardAiResponse
        | { error?: string; message?: string };

      if (!response.ok) {
        const msg =
          "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Unable to analyze Math request.";
        setErrorMessage(msg);
        return;
      }

      const data = payload as WhiteboardAiResponse;
      setAiResponse(data);
      setActiveStepIndex(0);
      setShowAiOverlay(true);
      setDimSketch(true);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setErrorMessage(
        "Network error reaching Math AI Tutor. Your local sketch is preserved."
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      setLoadingPhase("idle");
    }
  }, [isLoading, prompt, room.slug, tableId, topicId]);

  const executeDiagnose = useCallback(async () => {
    if (isLoading) {
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setErrorMessage("Enter a Math problem or equation to plot.");
      return;
    }

    lastActionRef.current = { kind: "diagnose" };
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setLoadingPhase("diagnose");
    setErrorMessage(null);
    setDiagnosticCheck(null);
    setDiagnosticAnswers({});
    setAiResponse(null);

    try {
      const response = await fetch("/api/ai/whiteboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          mode: "diagnose",
          subject: "math",
          roomSlug: room.slug,
          tableId,
          topicId,
          prompt: trimmedPrompt,
        }),
      });

      const payload = (await response.json()) as
        | DiagnosticCheckResponse
        | { error?: string; message?: string };

      if (!response.ok) {
        const msg =
          "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Unable to run diagnostic check.";
        setErrorMessage(msg);
        return;
      }

      setDiagnosticCheck(payload as DiagnosticCheckResponse);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }
      setErrorMessage(
        "Network error reaching Math AI Tutor. Your local sketch is preserved."
      );
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsLoading(false);
      setLoadingPhase("idle");
    }
  }, [isLoading, prompt, room.slug, tableId, topicId]);

  const executeExplainTopic = useCallback(
    async (withDiagnostics: boolean) => {
      if (isLoading) {
        return;
      }

      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        setErrorMessage("Enter a Math problem or equation to plot.");
        return;
      }

      const diagnosticAnswersPayload: DiagnosticAnswerInput[] | undefined =
        withDiagnostics && diagnosticCheck
          ? diagnosticCheck.questions.map((q) => ({
              conceptTag: q.conceptTag,
              question: q.question,
              studentAnswer:
                diagnosticAnswers[q.id]?.trim() || "I'm not sure",
            }))
          : undefined;

      lastActionRef.current = {
        kind: "explain_topic",
        withDiagnostics,
      };
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsLoading(true);
      setLoadingPhase("explain");
      setErrorMessage(null);

      try {
        const response = await fetch("/api/ai/whiteboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            mode: "explain_topic",
            subject: "math",
            roomSlug: room.slug,
            tableId,
            topicId,
            prompt: trimmedPrompt,
            ...(diagnosticAnswersPayload
              ? { diagnosticAnswers: diagnosticAnswersPayload }
              : {}),
          }),
        });

        const payload = (await response.json()) as
          | WhiteboardAiResponse
          | { error?: string; message?: string };

        if (!response.ok) {
          const msg =
            "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Unable to analyze Math request.";
          setErrorMessage(msg);
          return;
        }

        const data = payload as WhiteboardAiResponse;
        setDiagnosticCheck(null);
        setAiResponse(data);
        setActiveStepIndex(0);
        setShowAiOverlay(true);
        setDimSketch(true);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setErrorMessage(
          "Network error reaching Math AI Tutor. Your local sketch is preserved."
        );
      } finally {
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
        setIsLoading(false);
        setLoadingPhase("idle");
      }
    },
    [
      diagnosticAnswers,
      diagnosticCheck,
      isLoading,
      prompt,
      room.slug,
      tableId,
      topicId,
    ]
  );

  const handleSubmit = useCallback(() => {
    if (mode === "enhance") {
      void executeEnhance();
      return;
    }
    void executeDiagnose();
  }, [executeDiagnose, executeEnhance, mode]);

  const handleRetry = useCallback(() => {
    const last = lastActionRef.current;
    if (!last) {
      handleSubmit();
      return;
    }
    if (last.kind === "enhance") {
      void executeEnhance();
      return;
    }
    if (last.kind === "diagnose") {
      void executeDiagnose();
      return;
    }
    void executeExplainTopic(last.withDiagnostics);
  }, [executeDiagnose, executeEnhance, executeExplainTopic, handleSubmit]);

  const handleTopicChange = useCallback((nextTopicId: string) => {
    setTopicId(nextTopicId);
    setDiagnosticCheck(null);
    setDiagnosticAnswers({});
  }, []);

  const handlePromptChange = useCallback((nextPrompt: string) => {
    setPrompt(nextPrompt);
    setDiagnosticCheck((prev) => {
      if (prev) {
        setDiagnosticAnswers({});
      }
      return null;
    });
  }, []);

  const handleSelectDiagnosticAnswer = useCallback(
    (questionId: string, answer: string) => {
      setDiagnosticAnswers((prev) => ({
        ...prev,
        [questionId]: answer,
      }));
    },
    []
  );

  if (!open) {
    return null;
  }

  const activeStep = aiResponse?.steps[activeStepIndex] ?? null;
  const hasActiveOverlay = Boolean(activeStep);

  return (
    <div
      data-testid="whiteboard-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Solo Whiteboard and Math AI Tutor"
      className="pointer-events-auto fixed inset-3 z-40 flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-md"
    >
      {/* Top Overlay Header (h-12) */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <h2 className="truncate text-sm font-semibold text-slate-900">
            My Whiteboard · Math AI Tutor &amp; Plotter (Solo)
          </h2>
          <Badge
            variant="outline"
            data-testid="solo-board-badge"
            className="hidden gap-1 rounded-full border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 md:inline-flex"
          >
            <Lock className="size-3" />
            <span>Solo Board · Local browser state only</span>
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            data-testid="whiteboard-3d-paused-badge"
            className="gap-1 rounded-full border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700"
          >
            <PauseCircle className="size-3.5" />
            <span>3D Paused</span>
          </Badge>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onClose}
            data-testid="whiteboard-close-button"
            className="h-8 gap-1 rounded-full border-slate-200 px-3 text-xs text-slate-700 hover:bg-slate-100"
          >
            <X className="size-3.5" />
            <span>Close</span>
          </Button>
        </div>
      </header>

      {/* Main 2-Column Split */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <WhiteboardCanvas
          ref={canvasHandleRef}
          strokes={strokes}
          onStrokesChange={setStrokes}
          hasActiveOverlay={hasActiveOverlay}
          showAiOverlay={showAiOverlay}
          dimSketch={dimSketch}
          onToggleAiOverlay={() => setShowAiOverlay((prev) => !prev)}
          onToggleDimSketch={() => setDimSketch((prev) => !prev)}
          overlayLayer={
            <SvgOverlayLayer step={activeStep} visible={showAiOverlay} />
          }
        />

        <AiEnhancerPanel
          room={room}
          mode={mode}
          topicId={topicId}
          prompt={prompt}
          isLoading={isLoading}
          loadingPhase={loadingPhase}
          errorMessage={errorMessage}
          diagnosticCheck={diagnosticCheck}
          diagnosticAnswers={diagnosticAnswers}
          aiResponse={aiResponse}
          activeStepIndex={activeStepIndex}
          onModeChange={(nextMode) => {
            setMode(nextMode);
            setErrorMessage(null);
          }}
          onTopicChange={handleTopicChange}
          onPromptChange={handlePromptChange}
          onSubmit={handleSubmit}
          onCancel={handleCancelRequest}
          onRetry={handleRetry}
          onSelectDiagnosticAnswer={handleSelectDiagnosticAnswer}
          onAnalyzeGaps={() => void executeExplainTopic(true)}
          onSkipDiagnostic={() => void executeExplainTopic(false)}
          onSelectStep={setActiveStepIndex}
        />
      </div>
    </div>
  );
}
