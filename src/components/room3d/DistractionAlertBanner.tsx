"use client";

import { AlertTriangle, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DistractionReason } from "@/types/domain";

interface DistractionAlertBannerProps {
  reason: DistractionReason | null;
  visible: boolean;
  onResumeFocus: () => void;
  onDismiss: () => void;
}

const REASON_LABELS: Record<DistractionReason, string> = {
  cell_phone: "Phone detected — timer paused",
  face_absent: "Away from desk — timer paused",
  look_away: "Looking away — timer paused",
};

export function DistractionAlertBanner({
  reason,
  visible,
  onResumeFocus,
  onDismiss,
}: DistractionAlertBannerProps) {
  if (!visible || !reason) {
    return null;
  }

  return (
    <div
      role="alert"
      data-testid="distraction-alert-banner"
      className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-red-300 bg-red-50/95 px-4 py-2 text-xs font-medium text-red-800 shadow-lg backdrop-blur-md"
    >
      <AlertTriangle className="size-4 shrink-0 text-red-600" />
      <span>{REASON_LABELS[reason]}</span>
      <Button
        type="button"
        size="xs"
        onClick={onResumeFocus}
        data-testid="distraction-resume-button"
        className="h-6 gap-1 rounded-full bg-red-600 px-2.5 text-[11px] text-white hover:bg-red-700"
      >
        <Play className="size-3" />
        <span>Resume</span>
      </Button>
      <button
        type="button"
        aria-label="Dismiss distraction alert"
        onClick={onDismiss}
        className="rounded-full p-0.5 text-red-500 hover:bg-red-100 hover:text-red-800"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
