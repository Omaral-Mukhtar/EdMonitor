import { describe, expect, it } from "vitest";
import {
  MathExpressionError,
  compileMathExpression,
  evaluateMathExpression,
} from "@/lib/ai/math-eval";
import { renderMathPlotToSvg } from "@/lib/ai/math-plotter";
import { sanitizeSvgClient, sanitizeSvgServer } from "@/lib/ai/sanitizeSvg";

describe("math-eval allowlist security & evaluation", () => {
  it("evaluates valid arithmetic, powers, and allowlisted functions", () => {
    expect(evaluateMathExpression("x^2 + 2*x - 1", "x", 3)).toBe(14);
    expect(evaluateMathExpression("sqrt(y) + 1", "y", 9)).toBe(4);
    expect(evaluateMathExpression("ln(e)", "x", 0)).toBeCloseTo(1, 6);
    expect(evaluateMathExpression("sin(pi/2)", "x", 0)).toBeCloseTo(1, 6);
    expect(evaluateMathExpression("1/(x - 1)", "x", 1)).toBeNaN();
  });

  it("rejects unsafe mathjs expressions (import, eval, assignments, objects, wrong vars)", () => {
    const unsafe = [
      'import("fs")',
      'eval("process.exit(1)")',
      "x = 5",
      "[1, 2, 3]",
      "{ a: 1 }",
      "window.alert(1)",
      "y + 1", // wrong variable when expecting 'x'
      '"hello"',
    ];

    for (const expr of unsafe) {
      expect(() => compileMathExpression(expr, "x")).toThrow(
        MathExpressionError
      );
    }
  });
});

describe("math-plotter deterministic 1200x800 SVG generation", () => {
  it("renders y = f(x) and x = g(y) curves, crossing shadedRegions[], dx/dy slices, and intersections", () => {
    const svg = renderMathPlotToSvg({
      domain: { xMin: -2, xMax: 4, yMin: -2, yMax: 4 },
      curves: [
        {
          id: "cubic",
          orientation: "y_of_x",
          expression: "x^3",
          label: "y = x^3",
          color: "#2563EB",
        },
        {
          id: "parabola-y",
          orientation: "x_of_y",
          expression: "y^2",
          label: "x = y^2",
          color: "#0F172A",
        },
      ],
      shadedRegions: [
        {
          id: "left-cross",
          orientation: "dx",
          upperExpr: "x^3",
          lowerExpr: "x",
          from: -1,
          to: 0,
          label: "R1",
        },
        {
          id: "right-cross",
          orientation: "dx",
          upperExpr: "x",
          lowerExpr: "x^3",
          from: 0,
          to: 1,
          label: "R2",
        },
      ],
      slices: [
        {
          orientation: "dx",
          at: 0.5,
          fromExpr: "x^3",
          toExpr: "x",
          label: "dx",
        },
        {
          orientation: "dy",
          at: 1,
          fromExpr: "y^2",
          toExpr: "y + 2",
          label: "dy",
        },
      ],
      intersections: [
        { x: 0, y: 0, label: "(0, 0)" },
        { x: 1, y: 1, label: "(1, 1)" },
      ],
    });

    expect(svg).toContain('viewBox="0 0 1200 800"');
    expect(svg).toContain('data-curve-id="cubic"');
    expect(svg).toContain('data-curve-id="parabola-y"');
    expect(svg).toContain('data-shaded-region="left-cross"');
    expect(svg).toContain('data-shaded-region="right-cross"');
    expect(svg).toContain('data-slice="dx"');
    expect(svg).toContain('data-slice="dy"');
    expect(svg).toContain('data-intersection="true"');
    expect(svg).toContain("(1, 1)");

    // Passes client DOMPurify intact with full geometry attributes preserved
    const purified = sanitizeSvgClient(svg);
    expect(purified).toContain('viewBox="0 0 1200 800"');
    expect(purified).toContain("<path d=");
    expect(purified).toContain("y = x^3");
    expect(purified).toContain("x = y^2");
    expect(purified).toContain("R1");
    expect(purified).toContain("R2");
    expect(purified).toContain("dx");
    expect(purified).toContain("dy");
    expect(purified).toContain("(1, 1)");
  });

  it("splits 1/x across x = 0 into separate subpaths without a vertical bridge line", () => {
    const svg = renderMathPlotToSvg({
      domain: { xMin: -4, xMax: 4, yMin: -4, yMax: 4 },
      curves: [
        {
          id: "reciprocal",
          orientation: "y_of_x",
          expression: "1/x",
          label: "y = 1/x",
        },
      ],
      asymptotes: [{ axis: "x", value: 0, label: "x = 0" }],
    });

    const match = /data-curve-id="reciprocal"\s+d="([^"]+)"/.exec(svg);
    expect(match).not.toBeNull();
    const pathD = match?.[1] ?? "";
    // Must contain at least two separate "M " subpath starts (left and right branches)
    const moveCount = (pathD.match(/\bM\s/g) ?? []).length;
    expect(moveCount).toBeGreaterThanOrEqual(2);
    expect(svg).toContain('data-asymptote="x"');
  });

  it("renders open-circle holes and dashed verticalAsymptotes safely and passes sanitizeSvgServer", () => {
    const svg = renderMathPlotToSvg({
      domain: { xMin: -2, xMax: 4, yMin: -4, yMax: 6 },
      curves: [
        {
          id: "rational",
          orientation: "y_of_x",
          expression: "(x^2 - 1)/(x - 1)",
          label: "y = (x^2 - 1)/(x - 1)",
          color: "#2563EB",
        },
        {
          id: "asym-curve",
          orientation: "y_of_x",
          expression: "1/(x - 2)",
          label: "y = 1/(x - 2)",
          color: "#0F172A",
        },
      ],
      holes: [{ x: 1, y: 2, label: "Hole (1, 2)" }],
      verticalAsymptotes: [{ x: 2, label: "x = 2" }],
    });

    expect(svg).toContain('data-hole="true"');
    expect(svg).toContain('fill="#FFFFFF"');
    expect(svg).toContain('stroke="#2563EB"');
    expect(svg).toContain("Hole (1, 2)");
    expect(svg).toContain('data-vertical-asymptote="true"');
    expect(svg).toContain('stroke-dasharray="7 6"');
    expect(svg).toContain("x = 2");

    const serverPurified = sanitizeSvgServer(svg);
    expect(serverPurified).toContain('viewBox="0 0 1200 800"');
    expect(serverPurified).toContain('fill="#FFFFFF"');
    expect(serverPurified).toContain('stroke="#2563EB"');
    expect(serverPurified).toContain('stroke-dasharray="7 6"');
    expect(serverPurified).toContain("Hole (1, 2)");
    expect(serverPurified).toContain("x = 2");
  });
});
