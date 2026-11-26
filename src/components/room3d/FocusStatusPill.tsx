"use client";

import { AlertTriangle, CameraOff, Eye, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DistractionReason, FocusHalo } from "@/types/domain";
import { cn } from "cn";

export type CvGuardStatus =
  | "requesting"
  | "loading"
  | "ready"
  | "camera_off"
  | "cv_error";

interface FocusStatusPillProps {
  cvStatus: CvGuardStatus;
  halo: FocusHalo;
  isBreakMode: boolean;
  distractionReason?: DistractionReason | null;
  cameraError?: string | null;
  cvError?: string | null;
  onRetryCamera: () => void;
}

const DISTRACTED_PILL_LABELS: Record<DistractionReason, string> = {
  cell_phone: "Distracted: Phone",
  look_away: "Distracted: Look away",
  face_absent: "Distracted: Face absent",
};

export function FocusStatusPill({
  cvStatus,
  halo,
  isBreakMode,
  distractionReason = null,
  cameraError = null,
  cvError = null,
  onRetryCamera,
}: FocusStatusPillProps) {
  if (cvStatus === "camera_off") {
    const shortError = cameraError
      ? cameraError.split(":")[0]?.trim() || "Unavailable"
      : null;

    return (
      <div
        data-testid="cv-status-pill"
        data-cv-status={cvStatus}
        title={cameraError ?? undefined}
        className="pointer-events-auto mt-2 flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow-md backdrop-blur-md"
      >
        <CameraOff className="size-3.5 shrink-0 text-slate-500" />
        <span className="font-medium">
          {shortError
            ? `Camera off (${shortError}) · Manual timer mode`
            : "Camera off · Manual timer mode"}
        </span>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={onRetryCamera}
          data-testid="enable-camera-button"
          className="h-6 gap-1 rounded-full border-slate-200 bg-slate-50 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
        >
          <RefreshCw className="size-3" />
          <span>Enable Camera</span>
        </Button>
      </div>
    );
  }

  if (cvStatus === "cv_error") {
    return (
      <div
        data-testid="cv-status-pill"
        data-cv-status="cv_error"
        title={cvError ?? undefined}
        className="pointer-events-auto mt-2 flex max-w-xs items-center gap-2 rounded-full border border-amber-300 bg-amber-50/95 px-3 py-1.5 text-xs text-amber-900 shadow-md backdrop-blur-md"
      >
        <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
        <span className="truncate font-medium">
          {cvError ? `CV Error: ${cvError}` : "CV Guard unavailable"}
        </span>
      </div>
    );
  }

  if (cvStatus === "requesting" || cvStatus === "loading") {
    return (
      <div
        data-testid="cv-status-pill"
        data-cv-status={cvStatus}
        className="pointer-events-auto mt-2 flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/90 px-3 py-1.5 text-xs text-slate-700 shadow-md backdrop-blur-md"
      >
        <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-600" />
        <span className="font-medium">
          {cvStatus === "requesting"
            ? "Requesting camera..."
            : "Loading CV models..."}
        </span>
      </div>
    );
  }

  const dotClass =
    halo === "red"
      ? "bg-[#DC2626]"
      : isBreakMode || halo === "yellow"
        ? "bg-[#CA8A04]"
        : "bg-[#16A34A]";

  const label =
    halo === "red"
      ? distractionReason
        ? DISTRACTED_PILL_LABELS[distractionReason]
        : "CV Guard: Distracted"
      : isBreakMode
        ? "CV Guard: Break (Paused)"
        : "CV Guard: Focused";

  return (
    <div
      data-testid="cv-status-pill"
      data-cv-status="ready"
      className={cn(
        "pointer-events-auto mt-2 flex items-center gap-2 rounded-full border bg-white/90 px-3 py-1.5 text-xs shadow-md backdrop-blur-md",
        halo === "red"
          ? "border-red-300 text-red-800"
          : "border-slate-200/90 text-slate-700"
      )}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", dotClass)}
        aria-hidden="true"
      />
      <Eye className="size-3.5 shrink-0 text-slate-500" />
      <span className="font-medium">{label}</span>
    </div>
  );
}
