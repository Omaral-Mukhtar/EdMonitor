import { compileMathExpression } from "@/lib/ai/math-eval";
import type { MathPlotDomain, MathPlotSpec } from "@/types/whiteboard";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 800;

const PAD_LEFT = 84;
const PAD_RIGHT = 64;
const PAD_TOP = 54;
const PAD_BOTTOM = 64;

const PLOT_WIDTH = VIEWBOX_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = VIEWBOX_HEIGHT - PAD_TOP - PAD_BOTTOM;

const CURVE_SAMPLE_COUNT = 320;
const REGION_SAMPLE_COUNT = 120;

const DEFAULT_CURVE_COLORS = [
  "#2563EB", // Cobalt
  "#0F172A", // Ink
  "#0D9488", // Teal
  "#7C3AED", // Iris
];

const DEFAULT_REGION_COLORS = [
  "#2563EB",
  "#0D9488",
  "#7C3AED",
  "#0284C7",
];

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeHexColor(raw: string | null | undefined, fallback: string): string {
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function normalizeDomain(domain: MathPlotDomain): MathPlotDomain {
  const xMin = Number.isFinite(domain.xMin) ? domain.xMin : -5;
  const xMax = Number.isFinite(domain.xMax) && domain.xMax > xMin ? domain.xMax : xMin + 10;
  const yMin = Number.isFinite(domain.yMin) ? domain.yMin : -5;
  const yMax = Number.isFinite(domain.yMax) && domain.yMax > yMin ? domain.yMax : yMin + 10;
  return { xMin, xMax, yMin, yMax };
}

function toSvgX(x: number, domain: MathPlotDomain): number {
  return PAD_LEFT + ((x - domain.xMin) / (domain.xMax - domain.xMin)) * PLOT_WIDTH;
}

function toSvgY(y: number, domain: MathPlotDomain): number {
  return PAD_TOP + ((domain.yMax - y) / (domain.yMax - domain.yMin)) * PLOT_HEIGHT;
}

function formatTickNumber(n: number): string {
  if (Math.abs(n) < 1e-9) {
    return "0";
  }
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function computeNiceStep(span: number, targetTicks = 8): number {
  const rawStep = span / Math.max(2, targetTicks);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  if (normalized <= 1.5) return magnitude;
  if (normalized <= 3) return 2 * magnitude;
  if (normalized <= 7) return 5 * magnitude;
  return 10 * magnitude;
}

function generateTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const start = Math.ceil(min / step - 1e-9) * step;
  for (let v = start; v <= max + step * 1e-6; v += step) {
    const clean = Math.abs(v) < step * 1e-6 ? 0 : Math.round(v * 1e6) / 1e6;
    if (clean >= min - 1e-6 && clean <= max + 1e-6) {
      ticks.push(clean);
    }
  }
  return ticks;
}

function buildCurvePathData(
  samples: Array<{ x: number; y: number } | null>,
  domain: MathPlotDomain,
  orientation: "y_of_x" | "x_of_y"
): { d: string; labelAnchor: { sx: number; sy: number } | null } {
  const xSpan = domain.xMax - domain.xMin;
  const ySpan = domain.yMax - domain.yMin;
  const xPad = xSpan * 0.35;
  const yPad = ySpan * 0.35;
  const jumpLimit = orientation === "y_of_x" ? ySpan * 0.6 : xSpan * 0.6;

  const segments: string[] = [];
  let currentSegment: Array<{ sx: number; sy: number }> = [];
  let prevSample: { x: number; y: number } | null = null;
  const visiblePoints: Array<{ sx: number; sy: number }> = [];

  const flushSegment = () => {
    if (currentSegment.length >= 2) {
      const commands = currentSegment.map((pt, idx) =>
        `${idx === 0 ? "M" : "L"} ${pt.sx.toFixed(2)} ${pt.sy.toFixed(2)}`
      );
      segments.push(commands.join(" "));
    }
    currentSegment = [];
  };

  for (const sample of samples) {
    if (!sample) {
      flushSegment();
      prevSample = null;
      continue;
    }

    const inExpandedBox =
      sample.x >= domain.xMin - xPad &&
      sample.x <= domain.xMax + xPad &&
      sample.y >= domain.yMin - yPad &&
      sample.y <= domain.yMax + yPad;

    if (!inExpandedBox) {
      flushSegment();
      prevSample = null;
      continue;
    }

    if (prevSample) {
      const delta =
        orientation === "y_of_x"
          ? Math.abs(sample.y - prevSample.y)
          : Math.abs(sample.x - prevSample.x);
      const signFlip =
        orientation === "y_of_x"
          ? sample.y * prevSample.y < 0
          : sample.x * prevSample.x < 0;

      if (delta > jumpLimit || (signFlip && delta > jumpLimit * 0.5)) {
        flushSegment();
      }
    }

    const sx = toSvgX(sample.x, domain);
    const sy = toSvgY(sample.y, domain);
    currentSegment.push({ sx, sy });

    if (
      sample.x >= domain.xMin &&
      sample.x <= domain.xMax &&
      sample.y >= domain.yMin &&
      sample.y <= domain.yMax
    ) {
      visiblePoints.push({ sx, sy });
    }

    prevSample = sample;
  }

  flushSegment();

  const labelAnchor =
    visiblePoints.length > 0
      ? visiblePoints[Math.floor(visiblePoints.length * 0.72)]
      : null;

  return { d: segments.join(" "), labelAnchor };
}

/**
 * Deterministically renders a `MathPlotSpec` onto a `1200 x 800` SVG canvas
 * using strictly allowlisted `mathjs` expression evaluation.
 */
export function renderMathPlotToSvg(spec: MathPlotSpec): string {
  const domain = normalizeDomain(spec.domain);
  const clipId = "math-plot-clip";
  const arrowId = "math-plot-arrow";

  const xStep = computeNiceStep(domain.xMax - domain.xMin);
  const yStep = computeNiceStep(domain.yMax - domain.yMin);
  const xTicks = generateTicks(domain.xMin, domain.xMax, xStep);
  const yTicks = generateTicks(domain.yMin, domain.yMax, yStep);

  const zeroXInDomain = domain.xMin <= 0 && domain.xMax >= 0;
  const zeroYInDomain = domain.yMin <= 0 && domain.yMax >= 0;
  const axisY = zeroYInDomain ? toSvgY(0, domain) : PAD_TOP + PLOT_HEIGHT;
  const axisX = zeroXInDomain ? toSvgX(0, domain) : PAD_LEFT;

  const parts: string[] = [
    `<svg viewBox="0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cartesian Math Plot">`,
    "<defs>",
    `<clipPath id="${clipId}"><rect x="${PAD_LEFT}" y="${PAD_TOP}" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" /></clipPath>`,
    `<marker id="${arrowId}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#64748B" /></marker>`,
    "</defs>",
  ];

  // Grid lines & tick labels
  parts.push('<g data-layer="grid-and-axes">');
  for (const xt of xTicks) {
    const sx = toSvgX(xt, domain);
    parts.push(
      `<line x1="${sx.toFixed(2)}" y1="${PAD_TOP}" x2="${sx.toFixed(2)}" y2="${PAD_TOP + PLOT_HEIGHT}" stroke="#E2E8F0" stroke-width="1" />`
    );
    const labelY = Math.min(PAD_TOP + PLOT_HEIGHT + 20, axisY + 20);
    if (Math.abs(xt) > 1e-9 || !zeroXInDomain) {
      parts.push(
        `<text x="${sx.toFixed(2)}" y="${labelY.toFixed(2)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" fill="#475569">${escapeXml(formatTickNumber(xt))}</text>`
      );
    }
  }

  for (const yt of yTicks) {
    const sy = toSvgY(yt, domain);
    parts.push(
      `<line x1="${PAD_LEFT}" y1="${sy.toFixed(2)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${sy.toFixed(2)}" stroke="#E2E8F0" stroke-width="1" />`
    );
    const labelX = Math.max(PAD_LEFT - 10, axisX - 10);
    if (Math.abs(yt) > 1e-9 || !zeroYInDomain) {
      parts.push(
        `<text x="${labelX.toFixed(2)}" y="${(sy + 4).toFixed(2)}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="12" fill="#475569">${escapeXml(formatTickNumber(yt))}</text>`
      );
    }
  }

  // Border frame
  parts.push(
    `<rect x="${PAD_LEFT}" y="${PAD_TOP}" width="${PLOT_WIDTH}" height="${PLOT_HEIGHT}" fill="none" stroke="#CBD5E1" stroke-width="1" />`
  );

  // Primary axes
  parts.push(
    `<line x1="${PAD_LEFT}" y1="${axisY.toFixed(2)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${axisY.toFixed(2)}" stroke="#64748B" stroke-width="2" marker-end="url(#${arrowId})" />`
  );
  parts.push(
    `<line x1="${axisX.toFixed(2)}" y1="${PAD_TOP + PLOT_HEIGHT}" x2="${axisX.toFixed(2)}" y2="${PAD_TOP}" stroke="#64748B" stroke-width="2" marker-end="url(#${arrowId})" />`
  );
  parts.push(
    `<text x="${PAD_LEFT + PLOT_WIDTH + 14}" y="${(axisY + 4).toFixed(2)}" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="600" fill="#334155">x</text>`
  );
  parts.push(
    `<text x="${(axisX + 12).toFixed(2)}" y="${PAD_TOP - 10}" font-family="Plus Jakarta Sans, sans-serif" font-size="14" font-weight="600" fill="#334155">y</text>`
  );
  parts.push("</g>");

  // Clipped mathematical geometry
  parts.push(`<g clip-path="url(#${clipId})">`);

  // Shaded regions (drawn behind curves)
  if (spec.shadedRegions && spec.shadedRegions.length > 0) {
    spec.shadedRegions.forEach((region, index) => {
      const from = Math.min(region.from, region.to);
      const to = Math.max(region.from, region.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
        return;
      }

      const variable = region.orientation === "dx" ? "x" : "y";
      let upperFn: (t: number) => number;
      let lowerFn: (t: number) => number;
      try {
        upperFn = compileMathExpression(region.upperExpr, variable);
        lowerFn = compileMathExpression(region.lowerExpr, variable);
      } catch {
        return;
      }

      const upperPts: Array<{ sx: number; sy: number }> = [];
      const lowerPts: Array<{ sx: number; sy: number }> = [];

      for (let i = 0; i <= REGION_SAMPLE_COUNT; i += 1) {
        const t = from + ((to - from) * i) / REGION_SAMPLE_COUNT;
        const u = upperFn(t);
        const l = lowerFn(t);
        if (!Number.isFinite(u) || !Number.isFinite(l)) {
          continue;
        }
        if (region.orientation === "dx") {
          upperPts.push({ sx: toSvgX(t, domain), sy: toSvgY(u, domain) });
          lowerPts.push({ sx: toSvgX(t, domain), sy: toSvgY(l, domain) });
        } else {
          upperPts.push({ sx: toSvgX(u, domain), sy: toSvgY(t, domain) });
          lowerPts.push({ sx: toSvgX(l, domain), sy: toSvgY(t, domain) });
        }
      }

      if (upperPts.length < 2) {
        return;
      }

      const color = sanitizeHexColor(
        region.color,
        DEFAULT_REGION_COLORS[index % DEFAULT_REGION_COLORS.length]
      );

      const dUpper = upperPts
        .map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`)
        .join(" ");
      const dLower = [...lowerPts]
        .reverse()
        .map((p) => `L ${p.sx.toFixed(2)} ${p.sy.toFixed(2)}`)
        .join(" ");

      parts.push(
        `<path data-shaded-region="${escapeXml(region.id)}" d="${dUpper} ${dLower} Z" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-opacity="0.35" stroke-width="1" />`
      );

      if (region.label) {
        const midIdx = Math.floor(upperPts.length / 2);
        const cx = (upperPts[midIdx].sx + lowerPts[midIdx].sx) / 2;
        const cy = (upperPts[midIdx].sy + lowerPts[midIdx].sy) / 2;
        parts.push(
          `<text x="${cx.toFixed(2)}" y="${cy.toFixed(2)}" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-size="13" font-weight="600" fill="${color}" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(region.label)}</text>`
        );
      }
    });
  }

  // Representative dx / dy slices
  if (spec.slices && spec.slices.length > 0) {
    for (const slice of spec.slices) {
      if (!Number.isFinite(slice.at)) {
        continue;
      }
      const variable = slice.orientation === "dx" ? "x" : "y";
      let fromFn: (t: number) => number;
      let toFn: (t: number) => number;
      try {
        fromFn = compileMathExpression(slice.fromExpr, variable);
        toFn = compileMathExpression(slice.toExpr, variable);
      } catch {
        continue;
      }

      const v1 = fromFn(slice.at);
      const v2 = toFn(slice.at);
      if (!Number.isFinite(v1) || !Number.isFinite(v2)) {
        continue;
      }

      const thickness = Math.max(6, Math.min(28, slice.thicknessPx ?? 14));

      if (slice.orientation === "dx") {
        const cx = toSvgX(slice.at, domain);
        const syTop = toSvgY(Math.max(v1, v2), domain);
        const syBottom = toSvgY(Math.min(v1, v2), domain);
        const h = Math.max(2, syBottom - syTop);
        parts.push(
          `<rect data-slice="dx" x="${(cx - thickness / 2).toFixed(2)}" y="${syTop.toFixed(2)}" width="${thickness.toFixed(2)}" height="${h.toFixed(2)}" fill="#16A34A" fill-opacity="0.35" stroke="#16A34A" stroke-width="2" />`
        );
        if (slice.label) {
          parts.push(
            `<text x="${(cx + thickness / 2 + 6).toFixed(2)}" y="${((syTop + syBottom) / 2).toFixed(2)}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#15803D" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(slice.label)}</text>`
          );
        }
      } else {
        const cy = toSvgY(slice.at, domain);
        const sxLeft = toSvgX(Math.min(v1, v2), domain);
        const sxRight = toSvgX(Math.max(v1, v2), domain);
        const w = Math.max(2, sxRight - sxLeft);
        parts.push(
          `<rect data-slice="dy" x="${sxLeft.toFixed(2)}" y="${(cy - thickness / 2).toFixed(2)}" width="${w.toFixed(2)}" height="${thickness.toFixed(2)}" fill="#16A34A" fill-opacity="0.35" stroke="#16A34A" stroke-width="2" />`
        );
        if (slice.label) {
          parts.push(
            `<text x="${((sxLeft + sxRight) / 2).toFixed(2)}" y="${(cy - thickness / 2 - 6).toFixed(2)}" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#15803D" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(slice.label)}</text>`
          );
        }
      }
    }
  }

  // Asymptotes
  if (spec.asymptotes && spec.asymptotes.length > 0) {
    for (const asym of spec.asymptotes) {
      if (!Number.isFinite(asym.value)) {
        continue;
      }
      if (asym.axis === "x") {
        const sx = toSvgX(asym.value, domain);
        parts.push(
          `<line data-asymptote="x" x1="${sx.toFixed(2)}" y1="${PAD_TOP}" x2="${sx.toFixed(2)}" y2="${PAD_TOP + PLOT_HEIGHT}" stroke="#DC2626" stroke-width="1.75" stroke-dasharray="7 6" />`
        );
        if (asym.label) {
          parts.push(
            `<text x="${(sx + 6).toFixed(2)}" y="${PAD_TOP + 20}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#DC2626" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(asym.label)}</text>`
          );
        }
      } else {
        const sy = toSvgY(asym.value, domain);
        parts.push(
          `<line data-asymptote="y" x1="${PAD_LEFT}" y1="${sy.toFixed(2)}" x2="${PAD_LEFT + PLOT_WIDTH}" y2="${sy.toFixed(2)}" stroke="#DC2626" stroke-width="1.75" stroke-dasharray="7 6" />`
        );
        if (asym.label) {
          parts.push(
            `<text x="${PAD_LEFT + 10}" y="${(sy - 8).toFixed(2)}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#DC2626" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(asym.label)}</text>`
          );
        }
      }
    }
  }

  // Vertical asymptotes (shorthand for dashed vertical lines x = a)
  if (spec.verticalAsymptotes && spec.verticalAsymptotes.length > 0) {
    for (const va of spec.verticalAsymptotes) {
      if (!Number.isFinite(va.x)) {
        continue;
      }
      const sx = toSvgX(va.x, domain);
      parts.push(
        `<line data-vertical-asymptote="true" x1="${sx.toFixed(2)}" y1="${PAD_TOP}" x2="${sx.toFixed(2)}" y2="${PAD_TOP + PLOT_HEIGHT}" stroke="#DC2626" stroke-width="1.75" stroke-dasharray="7 6" />`
      );
      if (va.label) {
        parts.push(
          `<text x="${(sx + 6).toFixed(2)}" y="${PAD_TOP + 20}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#DC2626" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(va.label)}</text>`
        );
      }
    }
  }

  // Analytical curves (y = f(x) and x = g(y))
  spec.curves.forEach((curve, index) => {
    const variable = curve.orientation === "y_of_x" ? "x" : "y";
    let evaluator: (t: number) => number;
    try {
      evaluator = compileMathExpression(curve.expression, variable);
    } catch {
      return;
    }

    const tMin =
      curve.orientation === "y_of_x"
        ? curve.xRange?.[0] ?? domain.xMin
        : curve.yRange?.[0] ?? domain.yMin;
    const tMax =
      curve.orientation === "y_of_x"
        ? curve.xRange?.[1] ?? domain.xMax
        : curve.yRange?.[1] ?? domain.yMax;

    if (!Number.isFinite(tMin) || !Number.isFinite(tMax) || tMax <= tMin) {
      return;
    }

    const samples: Array<{ x: number; y: number } | null> = [];
    for (let i = 0; i <= CURVE_SAMPLE_COUNT; i += 1) {
      const t = tMin + ((tMax - tMin) * i) / CURVE_SAMPLE_COUNT;
      const out = evaluator(t);
      if (!Number.isFinite(out)) {
        samples.push(null);
      } else if (curve.orientation === "y_of_x") {
        samples.push({ x: t, y: out });
      } else {
        samples.push({ x: out, y: t });
      }
    }

    const { d, labelAnchor } = buildCurvePathData(
      samples,
      domain,
      curve.orientation
    );
    if (!d) {
      return;
    }

    const color = sanitizeHexColor(
      curve.color,
      DEFAULT_CURVE_COLORS[index % DEFAULT_CURVE_COLORS.length]
    );

    parts.push(
      `<path data-curve-id="${escapeXml(curve.id)}" d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`
    );

    if (curve.label && labelAnchor) {
      const lx = Math.min(PAD_LEFT + PLOT_WIDTH - 24, Math.max(PAD_LEFT + 24, labelAnchor.sx + 8));
      const ly = Math.min(PAD_TOP + PLOT_HEIGHT - 12, Math.max(PAD_TOP + 20, labelAnchor.sy - 10));
      parts.push(
        `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" font-family="JetBrains Mono, monospace" font-size="13" font-weight="600" fill="${color}" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(curve.label)}</text>`
      );
    }
  });

  // Intersections
  if (spec.intersections && spec.intersections.length > 0) {
    for (const pt of spec.intersections) {
      if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) {
        continue;
      }
      const sx = toSvgX(pt.x, domain);
      const sy = toSvgY(pt.y, domain);
      parts.push(
        `<circle data-intersection="true" cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="5.5" fill="#DC2626" stroke="#FFFFFF" stroke-width="2" />`
      );
      if (pt.label) {
        parts.push(
          `<text x="${(sx + 9).toFixed(2)}" y="${(sy - 9).toFixed(2)}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#0F172A" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(pt.label)}</text>`
        );
      }
    }
  }

  // Removable discontinuity holes (white-filled open circles with colored stroke)
  if (spec.holes && spec.holes.length > 0) {
    const holeStroke = sanitizeHexColor(
      spec.curves[0]?.color,
      DEFAULT_CURVE_COLORS[0]
    );
    for (const hole of spec.holes) {
      if (!Number.isFinite(hole.x) || !Number.isFinite(hole.y)) {
        continue;
      }
      const sx = toSvgX(hole.x, domain);
      const sy = toSvgY(hole.y, domain);
      parts.push(
        `<circle data-hole="true" cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="6" fill="#FFFFFF" stroke="${holeStroke}" stroke-width="2.5" />`
      );
      if (hole.label) {
        parts.push(
          `<text x="${(sx + 10).toFixed(2)}" y="${(sy - 10).toFixed(2)}" font-family="JetBrains Mono, monospace" font-size="12" font-weight="600" fill="#0F172A" paint-order="stroke" stroke="#FFFFFF" stroke-width="4">${escapeXml(hole.label)}</text>`
        );
      }
    }
  }

  parts.push("</g>");
  parts.push("</svg>");

  return parts.join("");
}
