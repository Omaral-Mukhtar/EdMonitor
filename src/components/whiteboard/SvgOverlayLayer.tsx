"use client";

import { useMemo } from "react";
import { renderMathPlotToSvg } from "@/lib/ai/math-plotter";
import {
  hasSvgDrawableContent,
  sanitizeSvgClient,
} from "@/lib/ai/sanitizeSvg";
import type { WhiteboardAiStep } from "@/types/whiteboard";

interface SvgOverlayLayerProps {
  step: WhiteboardAiStep | null;
  visible: boolean;
}

export function SvgOverlayLayer({ step, visible }: SvgOverlayLayerProps) {
  const sanitizedPlotSvg = useMemo(() => {
    if (!step?.plotSpec) {
      return "";
    }
    const rawPlotSvg = renderMathPlotToSvg(step.plotSpec);
    return sanitizeSvgClient(rawPlotSvg);
  }, [step]);

  const sanitizedAiSvg = useMemo(() => {
    if (!step?.svg) {
      return "";
    }
    const cleaned = sanitizeSvgClient(step.svg);
    return hasSvgDrawableContent(cleaned) ? cleaned : "";
  }, [step]);

  if (!visible || !step) {
    return null;
  }

  const hasVisual = Boolean(sanitizedPlotSvg || sanitizedAiSvg);

  return (
    <div
      data-testid="whiteboard-svg-overlay"
      className="pointer-events-none absolute inset-0 z-20"
    >
      {sanitizedPlotSvg ? (
        <div
          data-testid="svg-overlay-mathplot"
          className="absolute inset-0 h-full w-full [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: sanitizedPlotSvg }}
        />
      ) : null}

      {sanitizedAiSvg ? (
        <div
          data-testid="svg-overlay-ai"
          className="absolute inset-0 h-full w-full [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: sanitizedAiSvg }}
        />
      ) : null}

      {!hasVisual ? (
        <div className="flex h-full w-full items-end justify-center pb-5">
          <span
            data-testid="svg-overlay-unavailable"
            className="rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs text-slate-500 shadow-sm"
          >
            Diagram unavailable for this step
          </span>
        </div>
      ) : null}
    </div>
  );
}
