"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Circle as CircleIcon,
  Eraser,
  Layers,
  Minus,
  PenLine,
  RotateCcw,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clientPointToVirtual,
  WHITEBOARD_HEIGHT,
  WHITEBOARD_WIDTH,
} from "@/lib/whiteboard-coords";
import type {
  VirtualPoint,
  WhiteboardStroke,
  WhiteboardTool,
} from "@/types/whiteboard";
import { cn } from "cn";

export const WHITEBOARD_INK_SWATCHES = [
  { label: "Slate Ink", hex: "#0F172A" },
  { label: "Cobalt", hex: "#2563EB" },
  { label: "Teal", hex: "#0D9488" },
  { label: "Iris", hex: "#7C3AED" },
  { label: "Alert Red", hex: "#DC2626" },
] as const;

export const WHITEBOARD_STROKE_WIDTHS = [2, 4, 7] as const;

export interface WhiteboardCanvasHandle {
  exportPngBase64: () => string;
}

interface WhiteboardCanvasProps {
  strokes: WhiteboardStroke[];
  onStrokesChange: React.Dispatch<React.SetStateAction<WhiteboardStroke[]>>;
  hasActiveOverlay: boolean;
  showAiOverlay: boolean;
  dimSketch: boolean;
  onToggleAiOverlay: () => void;
  onToggleDimSketch: () => void;
  overlayLayer?: React.ReactNode;
}

function drawStrokeOnContext(
  ctx: CanvasRenderingContext2D,
  stroke: WhiteboardStroke
) {
  if (stroke.points.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = stroke.tool === "eraser" ? stroke.width * 3.5 : stroke.width;

  if (stroke.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = stroke.color;
  }

  const start = stroke.points[0];
  const end = stroke.points[stroke.points.length - 1];

  if (stroke.tool === "pen" || stroke.tool === "eraser") {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    if (stroke.points.length === 1) {
      ctx.lineTo(start.x + 0.01, start.y + 0.01);
    } else {
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
    }
    ctx.stroke();
  } else if (stroke.tool === "line") {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  } else if (stroke.tool === "rect") {
    ctx.strokeRect(
      Math.min(start.x, end.x),
      Math.min(start.y, end.y),
      Math.abs(end.x - start.x),
      Math.abs(end.y - start.y)
    );
  } else if (stroke.tool === "circle") {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export const WhiteboardCanvas = forwardRef<
  WhiteboardCanvasHandle,
  WhiteboardCanvasProps
>(function WhiteboardCanvas(
  {
    strokes,
    onStrokesChange,
    hasActiveOverlay,
    showAiOverlay,
    dimSketch,
    onToggleAiOverlay,
    onToggleDimSketch,
    overlayLayer,
  },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<WhiteboardTool>("pen");
  const [color, setColor] = useState<string>(WHITEBOARD_INK_SWATCHES[0].hex);
  const [strokeWidth, setStrokeWidth] = useState<number>(4);
  const [draftStroke, setDraftStroke] = useState<WhiteboardStroke | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  const redrawCanvas = useCallback(
    (committed: WhiteboardStroke[], draft: WhiteboardStroke | null) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
      for (const s of committed) {
        drawStrokeOnContext(ctx, s);
      }
      if (draft) {
        drawStrokeOnContext(ctx, draft);
      }
    },
    []
  );

  useEffect(() => {
    redrawCanvas(strokes, draftStroke);
  }, [strokes, draftStroke, redrawCanvas]);

  useImperativeHandle(
    ref,
    () => ({
      exportPngBase64: () => {
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = WHITEBOARD_WIDTH;
        exportCanvas.height = WHITEBOARD_HEIGHT;
        const ctx = exportCanvas.getContext("2d");
        if (!ctx) {
          return "";
        }
        // Composite onto opaque white sheet so dark ink is legible to Gemini vision
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
        for (const s of strokes) {
          drawStrokeOnContext(ctx, s);
        }
        return exportCanvas.toDataURL("image/png");
      },
    }),
    [strokes]
  );

  const getVirtualPointFromEvent = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ): VirtualPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return clientPointToVirtual(event.clientX, event.clientY, rect);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointerIdRef.current = event.pointerId;
    const pt = getVirtualPointFromEvent(event);
    const id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setDraftStroke({
      id,
      tool,
      color,
      width: strokeWidth,
      points: [pt],
    });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId || !draftStroke) {
      return;
    }
    const pt = getVirtualPointFromEvent(event);
    setDraftStroke((prev) => {
      if (!prev) {
        return prev;
      }
      if (prev.tool === "pen" || prev.tool === "eraser") {
        const last = prev.points[prev.points.length - 1];
        if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.5) {
          return prev;
        }
        return { ...prev, points: [...prev.points, pt] };
      }
      return { ...prev, points: [prev.points[0], pt] };
    });
  };

  const commitDraftStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activePointerIdRef.current = null;
    if (draftStroke) {
      const completed = draftStroke;
      setDraftStroke(null);
      onStrokesChange((prev) => [...prev, completed]);
    }
  };

  const handleUndo = () => {
    onStrokesChange((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setDraftStroke(null);
    onStrokesChange([]);
  };

  const isCanvasDimmed = hasActiveOverlay && showAiOverlay && dimSketch;
  const isBoardEmpty = strokes.length === 0 && !draftStroke;

  const toolButtons: Array<{
    id: WhiteboardTool;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: "pen", label: "Pen", icon: <PenLine className="size-3.5" /> },
    { id: "line", label: "Line", icon: <Minus className="size-3.5" /> },
    { id: "rect", label: "Rect", icon: <Square className="size-3.5" /> },
    { id: "circle", label: "Circle", icon: <CircleIcon className="size-3.5" /> },
    { id: "eraser", label: "Eraser", icon: <Eraser className="size-3.5" /> },
  ];

  return (
    <div className="relative flex min-h-[240px] min-w-0 flex-1 flex-col bg-slate-100/80">
      {/* Top Floating Tool Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {toolButtons.map((btn) => (
            <Button
              key={btn.id}
              type="button"
              size="sm"
              variant={tool === btn.id ? "default" : "outline"}
              onClick={() => setTool(btn.id)}
              data-testid={`wb-tool-${btn.id}`}
              className={cn(
                "h-7 gap-1 px-2 text-xs",
                tool === btn.id
                  ? "bg-slate-900 text-white hover:bg-slate-800"
                  : "border-slate-200 text-slate-700 hover:bg-slate-100"
              )}
            >
              {btn.icon}
              <span className="hidden sm:inline">{btn.label}</span>
            </Button>
          ))}

          <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />

          <div className="flex items-center gap-1" role="group" aria-label="Ink color">
            {WHITEBOARD_INK_SWATCHES.map((swatch) => {
              const selected =
                color.toUpperCase() === swatch.hex.toUpperCase() &&
                tool !== "eraser";
              return (
                <button
                  key={swatch.hex}
                  type="button"
                  title={swatch.label}
                  aria-label={swatch.label}
                  onClick={() => {
                    setColor(swatch.hex);
                    if (tool === "eraser") {
                      setTool("pen");
                    }
                  }}
                  className={cn(
                    "size-5 rounded-full border transition-transform hover:scale-110",
                    selected
                      ? "scale-110 border-slate-900 ring-2 ring-slate-900/20"
                      : "border-slate-300"
                  )}
                  style={{ backgroundColor: swatch.hex }}
                />
              );
            })}
          </div>

          <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />

          <div className="flex items-center gap-1" role="group" aria-label="Stroke width">
            {WHITEBOARD_STROKE_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                aria-label={`Stroke width ${w}px`}
                onClick={() => setStrokeWidth(w)}
                className={cn(
                  "flex size-6 items-center justify-center rounded border text-[10px]",
                  strokeWidth === w
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"
                )}
              >
                <span
                  className="rounded-full bg-current"
                  style={{ width: w + 2, height: w + 2 }}
                />
              </button>
            ))}
          </div>

          <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={strokes.length === 0}
            onClick={handleUndo}
            data-testid="wb-undo-button"
            className="h-7 gap-1 border-slate-200 px-2 text-xs text-slate-700"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden md:inline">Undo</span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={strokes.length === 0}
            onClick={handleClear}
            data-testid="wb-clear-button"
            className="h-7 gap-1 border-slate-200 px-2 text-xs text-slate-700"
          >
            <Trash2 className="size-3.5" />
            <span className="hidden md:inline">Clear</span>
          </Button>
        </div>

        {/* AI Overlay & Auto-Dim Controls */}
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={showAiOverlay && hasActiveOverlay ? "secondary" : "outline"}
            disabled={!hasActiveOverlay}
            onClick={onToggleAiOverlay}
            data-testid="wb-toggle-ai-overlay"
            className={cn(
              "h-7 gap-1 px-2.5 text-xs",
              showAiOverlay && hasActiveOverlay
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                : "border-slate-200 text-slate-600"
            )}
          >
            <Layers className="size-3.5" />
            <span>AI Overlay: {showAiOverlay ? "ON" : "OFF"}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant={dimSketch ? "secondary" : "outline"}
            disabled={!hasActiveOverlay || !showAiOverlay}
            onClick={onToggleDimSketch}
            data-testid="wb-toggle-dim-sketch"
            className={cn(
              "h-7 px-2.5 text-xs",
              dimSketch && hasActiveOverlay && showAiOverlay
                ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border-slate-200 text-slate-600"
            )}
          >
            Dim Sketch: {dimSketch ? "ON" : "OFF"}
          </Button>
        </div>
      </div>

      {/* Unified 1200x800 Aspect-Locked Sheet */}
      <div
        className="relative flex min-h-[200px] min-w-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4"
        style={{ containerType: "size" }}
      >
        <div
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          style={{
            width: "min(calc(100cqw - 16px), calc((100cqh - 16px) * 1.5))",
            height: "min(calc(100cqh - 16px), calc((100cqw - 16px) / 1.5))",
            backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          {/* Empty-board watermark */}
          {isBoardEmpty && !(hasActiveOverlay && showAiOverlay) ? (
            <div
              data-testid="wb-empty-watermark"
              className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center p-8 text-center"
            >
              <p className="max-w-md rounded-xl bg-white/85 px-4 py-2 text-sm text-slate-500">
                Sketch a math problem here, or use Explain Math Topic on the
                right to plot &amp; explain.
              </p>
            </div>
          ) : null}

          {/* Layer 1: Local HTML5 Canvas (auto-dimmed when AI plot/overlay is active) */}
          <canvas
            ref={canvasRef}
            width={WHITEBOARD_WIDTH}
            height={WHITEBOARD_HEIGHT}
            data-testid="whiteboard-canvas"
            data-dimmed={isCanvasDimmed ? "true" : "false"}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={commitDraftStroke}
            onPointerCancel={commitDraftStroke}
            className={cn(
              "relative z-10 h-full w-full touch-none transition-opacity duration-200",
              tool === "eraser" ? "cursor-cell" : "cursor-crosshair",
              isCanvasDimmed ? "opacity-25" : "opacity-100"
            )}
          />

          {/* Layer 2: Double-Sanitized SVG & Deterministic MathPlot Overlay */}
          {overlayLayer}
        </div>
      </div>
    </div>
  );
});
