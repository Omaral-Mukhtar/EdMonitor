"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Info,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CampusRoomConfig } from "@/lib/campus-rooms";
import {
  MATH_SYLLABUS_TOPICS,
  getMathSyllabusTopic,
} from "@/lib/ai/math-syllabus";
import { MAX_WHITEBOARD_PROMPT_CHARS } from "@/lib/ai/prompts";
import type {
  DiagnosticCheckResponse,
  WhiteboardAiMode,
  WhiteboardAiResponse,
} from "@/types/whiteboard";
import { cn } from "cn";

interface AiEnhancerPanelProps {
  room: CampusRoomConfig;
  mode: WhiteboardAiMode;
  topicId: string;
  prompt: string;
  isLoading: boolean;
  loadingPhase?: "idle" | "diagnose" | "explain";
  errorMessage: string | null;
  diagnosticCheck?: DiagnosticCheckResponse | null;
  diagnosticAnswers?: Record<string, string>;
  aiResponse: WhiteboardAiResponse | null;
  activeStepIndex: number;
  onModeChange: (mode: WhiteboardAiMode) => void;
  onTopicChange: (topicId: string) => void;
  onPromptChange: (prompt: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onSelectDiagnosticAnswer?: (questionId: string, answer: string) => void;
  onAnalyzeGaps?: () => void;
  onSkipDiagnostic?: () => void;
  onSelectStep: (index: number) => void;
}

function DiagnosticCheckSection({
  diagnosticCheck,
  diagnosticAnswers,
  isLoading,
  onSelectAnswer,
  onAnalyzeGaps,
  onSkipDiagnostic,
}: {
  diagnosticCheck: DiagnosticCheckResponse;
  diagnosticAnswers: Record<string, string>;
  isLoading: boolean;
  onSelectAnswer: (questionId: string, answer: string) => void;
  onAnalyzeGaps: () => void;
  onSkipDiagnostic: () => void;
}) {
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});

  const allAnswered =
    diagnosticCheck.questions.length > 0 &&
    diagnosticCheck.questions.every(
      (q) => (diagnosticAnswers[q.id]?.trim().length ?? 0) > 0
    );

  return (
    <div
      data-testid="diagnostic-check-section"
      className="flex flex-col gap-2.5"
    >
      <div className="rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs text-blue-950">
        <div className="flex items-center gap-1.5 font-semibold text-blue-800">
          <HelpCircle className="size-3.5 shrink-0" />
          <span>Quick Diagnostic Check</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-blue-900">
          {diagnosticCheck.topicSummary}
        </p>
      </div>

      {diagnosticCheck.questions.map((question, qIndex) => {
        const selected = diagnosticAnswers[question.id] ?? "";
        const customDraft = customDrafts[question.id] ?? "";
        const isNotSure = selected === "I'm not sure" && !customDraft;

        return (
          <div
            key={question.id}
            data-testid={`diagnostic-question-card-${qIndex}`}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <Badge
                variant="outline"
                data-testid={`diagnostic-concept-tag-${qIndex}`}
                className="rounded-full border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-700"
              >
                {question.conceptTag}
              </Badge>
              <span className="tabular-mono text-[10px] text-slate-400">
                Q{qIndex + 1}
              </span>
            </div>

            <p className="text-xs font-medium leading-snug text-slate-900">
              {question.question}
            </p>

            <div className="flex flex-col gap-1.5">
              {question.options.map((option, optIndex) => {
                const isSelected = selected === option && !customDraft;
                return (
                  <button
                    key={`${question.id}-opt-${optIndex}`}
                    type="button"
                    aria-pressed={isSelected}
                    disabled={isLoading}
                    onClick={() => {
                      setCustomDrafts((prev) => ({
                        ...prev,
                        [question.id]: "",
                      }));
                      onSelectAnswer(question.id, option);
                    }}
                    className={cn(
                      "rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-snug transition-colors",
                      isSelected
                        ? "border-blue-500 bg-blue-50 font-medium text-blue-800 ring-1 ring-blue-500/20"
                        : "border-slate-200 bg-slate-50/70 text-slate-700 hover:border-slate-300 hover:bg-slate-100"
                    )}
                  >
                    {option}
                  </button>
                );
              })}

              <button
                type="button"
                aria-pressed={isNotSure}
                disabled={isLoading}
                onClick={() => {
                  setCustomDrafts((prev) => ({
                    ...prev,
                    [question.id]: "",
                  }));
                  onSelectAnswer(question.id, "I'm not sure");
                }}
                className={cn(
                  "rounded-lg border border-dashed px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors",
                  isNotSure
                    ? "border-amber-400 bg-amber-50 text-amber-900 ring-1 ring-amber-400/30"
                    : "border-slate-300 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/50 hover:text-amber-800"
                )}
              >
                I&apos;m not sure
              </button>
            </div>

            <input
              type="text"
              value={customDraft}
              disabled={isLoading}
              maxLength={240}
              onChange={(e) => {
                const next = e.target.value;
                setCustomDrafts((prev) => ({ ...prev, [question.id]: next }));
                onSelectAnswer(question.id, next.trim());
              }}
              placeholder="Or type your own answer..."
              data-testid={`diagnostic-custom-input-${qIndex}`}
              className="h-7 w-full rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 text-[11px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        );
      })}

      <div className="flex flex-col gap-1.5 pt-1">
        <Button
          type="button"
          size="sm"
          disabled={!allAnswered || isLoading}
          onClick={onAnalyzeGaps}
          data-testid="ai-analyze-gaps-button"
          className="h-8 w-full gap-1.5 bg-blue-600 text-xs text-white hover:bg-blue-700"
        >
          <Sparkles className="size-3.5" />
          <span>Analyze Gaps &amp; Plot</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isLoading}
          onClick={onSkipDiagnostic}
          data-testid="ai-skip-diagnose-button"
          className="h-8 w-full border-slate-200 bg-white text-xs text-slate-700 hover:bg-slate-100"
        >
          Skip &amp; Plot Directly
        </Button>
      </div>
    </div>
  );
}

export function AiEnhancerPanel({
  room,
  mode,
  topicId,
  prompt,
  isLoading,
  loadingPhase = "idle",
  errorMessage,
  diagnosticCheck = null,
  diagnosticAnswers = {},
  aiResponse,
  activeStepIndex,
  onModeChange,
  onTopicChange,
  onPromptChange,
  onSubmit,
  onCancel,
  onRetry,
  onSelectDiagnosticAnswer = () => {},
  onAnalyzeGaps = () => {},
  onSkipDiagnostic = () => {},
  onSelectStep,
}: AiEnhancerPanelProps) {
  const activeTopic = getMathSyllabusTopic(topicId);
  const steps = aiResponse?.steps ?? [];
  const conceptGaps = aiResponse?.conceptGaps ?? [];
  const activeStep = steps[activeStepIndex] ?? null;
  const isGeneralStudyRoom = room.subject !== "math";
  const showDiagnostics = mode === "generate" && Boolean(diagnosticCheck);

  return (
    <aside
      data-testid="ai-enhancer-panel"
      className="flex h-[46%] min-h-0 w-full shrink-0 flex-col border-t border-slate-200 bg-slate-50/95 md:h-full md:w-80 md:border-t-0 md:border-l lg:w-96"
    >
      {/* Top Scope Pill + Math-Only Notice in General Study Rooms */}
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            data-testid="math-syllabus-guard-badge"
            className="gap-1.5 rounded-full border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-medium text-blue-700"
          >
            <ShieldCheck className="size-3.5" />
            <span>Math Syllabus Guard Active</span>
          </Badge>
          <span className="text-[11px] font-medium text-slate-500">
            Math topics only
          </span>
        </div>

        {isGeneralStudyRoom ? (
          <div
            data-testid="general-room-math-only-notice"
            className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700"
          >
            <Info className="mt-0.5 size-3.5 shrink-0 text-slate-500" />
            <span>
              <strong>Math topics only:</strong> Your solo drawing canvas works
              for any notes in {room.name}, while the AI Tutor &amp; Plotter is
              scoped strictly to Mathematics.
            </span>
          </div>
        ) : null}

        <Tabs
          value={mode}
          onValueChange={(value) => {
            if (value === "enhance" || value === "generate") {
              onModeChange(value);
            }
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger
              value="enhance"
              data-testid="ai-mode-enhance"
              className="text-xs"
            >
              Explain &amp; Enhance Sketch
            </TabsTrigger>
            <TabsTrigger
              value="generate"
              data-testid="ai-mode-generate"
              className="text-xs"
            >
              Explain Math Topic
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Topic Selector, Prompt & Action Controls */}
      <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-white/80 px-4 py-3">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="math-syllabus-topic"
            className="text-xs font-medium text-slate-700"
          >
            Syllabus Topic
          </label>
          <select
            id="math-syllabus-topic"
            value={activeTopic.id}
            onChange={(e) => onTopicChange(e.target.value)}
            data-testid="ai-topic-select"
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            {MATH_SYLLABUS_TOPICS.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.course} · {topic.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="ai-whiteboard-prompt"
              className="text-xs font-medium text-slate-700"
            >
              {mode === "enhance"
                ? "Optional note about your sketch"
                : "Mathematics question or equations to plot"}
            </label>
            <span className="tabular-mono text-[10px] text-slate-400">
              {prompt.length}/{MAX_WHITEBOARD_PROMPT_CHARS}
            </span>
          </div>
          <textarea
            id="ai-whiteboard-prompt"
            value={prompt}
            maxLength={MAX_WHITEBOARD_PROMPT_CHARS}
            rows={3}
            onChange={(e) => onPromptChange(e.target.value)}
            placeholder={
              mode === "enhance"
                ? "e.g. Check my dx area integral setup between y = 2x and y = x^2"
                : `e.g. ${activeTopic.examplePrompts[0] ?? "Find the area enclosed by y = x^2 and y = 2x"}`
            }
            data-testid="ai-prompt-input"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {activeTopic.examplePrompts.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {activeTopic.examplePrompts.slice(0, 2).map((example, idx) => (
              <button
                key={example}
                type="button"
                data-testid={`ai-example-chip-${idx}`}
                onClick={() => {
                  onModeChange("generate");
                  onPromptChange(example);
                }}
                className="max-w-full truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                {example}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={
                isLoading || (mode === "generate" && prompt.trim().length === 0)
              }
              onClick={onSubmit}
              data-testid="ai-submit-button"
              className="h-8 flex-1 gap-1.5 bg-blue-600 text-xs text-white hover:bg-blue-700"
            >
              <Sparkles className="size-3.5" />
              <span>
                {isLoading
                  ? loadingPhase === "diagnose"
                    ? "Checking..."
                    : "Analyzing..."
                  : mode === "enhance"
                    ? "Analyze & Enhance"
                    : "Check Understanding & Plot"}
              </span>
            </Button>
            {isLoading ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCancel}
                data-testid="ai-cancel-button"
                className="h-8 gap-1 border-slate-200 px-2.5 text-xs text-slate-700"
              >
                <X className="size-3.5" />
                <span>Cancel</span>
              </Button>
            ) : null}
          </div>

          {mode === "generate" && !showDiagnostics ? (
            <button
              type="button"
              disabled={isLoading || prompt.trim().length === 0}
              onClick={onSkipDiagnostic}
              data-testid="ai-skip-diagnose-button"
              className="self-end text-[11px] font-medium text-slate-500 underline-offset-2 transition-colors hover:text-blue-600 hover:underline disabled:pointer-events-none disabled:opacity-40"
            >
              Skip &amp; Plot Directly
            </button>
          ) : null}
        </div>
      </div>

      {/* Scrollable Steps, Loading Skeleton, Mistake Callout & Errors */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
        {errorMessage ? (
          <div
            data-testid="ai-error-banner"
            role="alert"
            className="flex items-start justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900"
          >
            <div className="flex flex-col gap-1">
              <span className="font-semibold">AI Tutor Error</span>
              <span>{errorMessage}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="h-7 shrink-0 border-red-300 bg-white px-2.5 text-xs text-red-700 hover:bg-red-100"
            >
              Retry
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <div
            data-testid="ai-loading-skeleton"
            className="flex flex-col gap-2.5"
          >
            <p className="text-xs font-medium text-blue-700">
              {loadingPhase === "diagnose"
                ? "Preparing quick diagnostic check..."
                : "Analyzing sketch & building Math diagram..."}
            </p>
            <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white p-3" />
            <div className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white p-3" />
            <div className="h-16 animate-pulse rounded-xl border border-slate-200 bg-white p-3" />
          </div>
        ) : null}

        {!isLoading && showDiagnostics && diagnosticCheck ? (
          <DiagnosticCheckSection
            key={`${diagnosticCheck.topicSummary}-${diagnosticCheck.questions
              .map((q) => q.id)
              .join("-")}`}
            diagnosticCheck={diagnosticCheck}
            diagnosticAnswers={diagnosticAnswers}
            isLoading={isLoading}
            onSelectAnswer={onSelectDiagnosticAnswer}
            onAnalyzeGaps={onAnalyzeGaps}
            onSkipDiagnostic={onSkipDiagnostic}
          />
        ) : null}

        {!isLoading && !showDiagnostics && conceptGaps.length > 0 ? (
          <div
            data-testid="ai-concept-check-summary"
            className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3"
          >
            <span className="text-xs font-semibold text-slate-800">
              Concept Check
            </span>
            <div className="flex flex-col gap-1.5">
              {conceptGaps.map((item, index) => {
                const isGap = item.status === "gap";
                return (
                  <div
                    key={`${item.concept}-${index}`}
                    data-testid={
                      isGap
                        ? `concept-gap-badge-${index}`
                        : `concept-solid-badge-${index}`
                    }
                    className={cn(
                      "flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] leading-snug",
                      isGap
                        ? "border-amber-300 bg-amber-50 text-amber-950"
                        : "border-emerald-300 bg-emerald-50 text-emerald-950"
                    )}
                  >
                    {isGap ? (
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                    )}
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">{item.concept}</span>
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                            isGap
                              ? "bg-amber-200/80 text-amber-900"
                              : "bg-emerald-200/80 text-emerald-900"
                          )}
                        >
                          {isGap ? "Gap" : "Solid"}
                        </span>
                      </div>
                      <span
                        className={cn(
                          isGap ? "text-amber-900/90" : "text-emerald-900/90"
                        )}
                      >
                        {item.note}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {!isLoading && !showDiagnostics && activeStep?.flaggedMistake ? (
          <div
            data-testid="ai-flagged-mistake"
            className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">Mistake Flagged in Sketch</span>
              <span>{activeStep.flaggedMistake}</span>
            </div>
          </div>
        ) : null}

        {!isLoading && !showDiagnostics && steps.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                Math Steps ({activeStepIndex + 1} of {steps.length})
              </span>
              {activeStep?.plotSpec ? (
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                  Cartesian Plot
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              {steps.map((step, index) => {
                const isActive = index === activeStepIndex;
                return (
                  <button
                    key={`${aiResponse?.overlayId ?? "step"}-${index}`}
                    type="button"
                    onClick={() => onSelectStep(index)}
                    data-testid={`ai-step-card-${index}`}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border p-3 text-left transition-colors",
                      isActive
                        ? "border-blue-500 bg-white shadow-sm ring-1 ring-blue-500/20"
                        : "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-900">
                        {index + 1}. {step.title}
                      </span>
                      {step.flaggedMistake ? (
                        <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
                      ) : null}
                    </div>
                    <p className="text-xs leading-relaxed text-slate-600">
                      {step.explanation}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {!isLoading && !showDiagnostics && steps.length === 0 && !errorMessage ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/70 p-4 text-xs leading-relaxed text-slate-600">
            <p className="font-medium text-slate-800">
              How the Solo Math Tutor works
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              <li>
                Sketch curves or an integral setup on the left, then click{" "}
                <strong>Analyze &amp; Enhance</strong> to check for mistakes.
              </li>
              <li>
                Or switch to <strong>Explain Math Topic</strong> to generate
                syllabus-aligned steps with deterministic Cartesian plots,
                crossing shaded regions, and <code>dx</code>/<code>dy</code>{" "}
                slices.
              </li>
            </ul>
          </div>
        ) : null}
      </div>

      {/* Bottom Local Step Navigation */}
      {!showDiagnostics && steps.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={activeStepIndex <= 0}
            onClick={() => onSelectStep(Math.max(0, activeStepIndex - 1))}
            data-testid="ai-prev-step"
            className="h-8 gap-1 border-slate-200 px-2.5 text-xs"
          >
            <ChevronLeft className="size-3.5" />
            <span>Prev Step</span>
          </Button>
          <span className="tabular-mono text-xs text-slate-500">
            {activeStepIndex + 1} / {steps.length}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={activeStepIndex >= steps.length - 1}
            onClick={() =>
              onSelectStep(Math.min(steps.length - 1, activeStepIndex + 1))
            }
            data-testid="ai-next-step"
            className="h-8 gap-1 border-slate-200 px-2.5 text-xs"
          >
            <span>Next Step</span>
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </aside>
  );
}
