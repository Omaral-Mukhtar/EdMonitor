import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import {
  buildWhiteboardSystemInstruction,
  buildWhiteboardUserParts,
  whiteboardAiOutputZodSchema,
  whiteboardAiResponseSchema,
} from "@/lib/ai/prompts";
import type { WhiteboardAiMode } from "@/types/whiteboard";

const TARGET_MODEL = "gemini-3.8-flash";
const REQUEST_SPACING_MS = 13_000;
const BACKOFF_429_MS = 15_000;
const REQUEST_TIMEOUT_MS = 35_000;
const MAX_OUTPUT_TOKENS = 3200;

interface BenchmarkCase {
  requestId: number;
  mode: "text" | "sketch_png";
  aiMode: WhiteboardAiMode;
  topicId: string;
  promptLabel: string;
  prompt: string;
}

interface BenchmarkRow {
  requestId: number;
  mode: "text" | "sketch_png";
  promptLabel: string;
  status: "ok" | "error";
  httpStatusOrError: string;
  retried429: boolean;
  latencyMs: number;
  promptTokenCount: number | null;
  cachedContentTokenCount: number | null;
  candidatesTokenCount: number | null;
  thoughtsTokenCount: number | null;
  totalTokenCount: number | null;
  validJsonSchema: boolean;
  cost2026Usd: number | null;
  cost2027Usd: number | null;
}

interface GroupAggregate {
  label: string;
  total: number;
  succeeded: number;
  successRatePct: number;
  retry429Count: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  avgInputTokens: number | null;
  avgOutputTokens: number | null;
  avgThinkingTokens: number | null;
  avgCachedTokens: number | null;
  avgCost2026Usd: number | null;
  avgCost2027Usd: number | null;
}

const BENCHMARK_CASES: readonly BenchmarkCase[] = [
  {
    requestId: 1,
    mode: "text",
    aiMode: "generate",
    topicId: "math2-area-between-curves",
    promptLabel: "Math 2: Area y=x^3 & y=x [-1,1]",
    prompt: "Find the area enclosed by y = x^3 and y = x on [-1, 1].",
  },
  {
    requestId: 2,
    mode: "text",
    aiMode: "generate",
    topicId: "math2-volumes-disk-washer",
    promptLabel: "Math 2: Washer Volume y=x, y=x^2",
    prompt:
      "Find the volume of the solid formed by revolving the region bounded by y = x and y = x^2 around the x-axis using the washer method.",
  },
  {
    requestId: 3,
    mode: "text",
    aiMode: "generate",
    topicId: "math2-integration-techniques",
    promptLabel: "Math 2: Integration by Parts x*e^x",
    prompt:
      "Evaluate the integral of x * e^x from 0 to 1 using integration by parts and plot y = x * exp(x).",
  },
  {
    requestId: 4,
    mode: "text",
    aiMode: "generate",
    topicId: "math1-derivatives-tangent",
    promptLabel: "Math 1: Tangent Line y=x^2+1 at x=1",
    prompt:
      "Find the equation of the tangent line to y = x^2 + 1 at x = 1 and plot both the curve and tangent line.",
  },
  {
    requestId: 5,
    mode: "text",
    aiMode: "generate",
    topicId: "linear-algebra-systems-transform",
    promptLabel: "LinAlg: 2x2 Matrix Eigenvalues",
    prompt:
      "Find the eigenvalues and eigenvectors of the 2x2 matrix [[3, 1], [1, 3]] and plot the eigendirection lines y = x and y = -x.",
  },
  {
    requestId: 6,
    mode: "sketch_png",
    aiMode: "enhance",
    topicId: "math2-area-between-curves",
    promptLabel: "Sketch: Area y=2x & y=x^2 check",
    prompt:
      "Check if my sketch correctly identifies the top and bottom curves and shaded area between y = 2x and y = x^2.",
  },
  {
    requestId: 7,
    mode: "sketch_png",
    aiMode: "enhance",
    topicId: "math2-area-between-curves",
    promptLabel: "Sketch: Swapped Integrand x^2-2x",
    prompt:
      "I set up the integral on [0, 2] as integral of (x^2 - 2x) dx from my sketch. Did I order the curves correctly?",
  },
  {
    requestId: 8,
    mode: "sketch_png",
    aiMode: "enhance",
    topicId: "math1-limits-continuity",
    promptLabel: "Sketch: Asymptote y=1/(x-1)",
    prompt:
      "Enhance my sketch by plotting y = 1/(x - 1) and highlighting the vertical asymptote at x = 1.",
  },
  {
    requestId: 9,
    mode: "sketch_png",
    aiMode: "enhance",
    topicId: "math1-derivatives-tangent",
    promptLabel: "Sketch: Tangent to y=x^2 at (1,1)",
    prompt:
      "Compare my sketch of y = x^2 with its exact tangent line at (1, 1) and flag any slope mistakes.",
  },
  {
    requestId: 10,
    mode: "sketch_png",
    aiMode: "enhance",
    topicId: "math2-area-between-curves",
    promptLabel: "Sketch: dy vs dx x=y^2 & x=y+2",
    prompt:
      "Show why horizontal dy slices are cleaner than dx slices for the region bounded by x = y^2 and x = y + 2.",
  },
];

function loadEnvLocal(): Record<string, string> {
  const envPath = path.resolve(".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found.");
  }
  const entries: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    entries[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return entries;
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

const FONT_5X7: Record<string, string[]> = {
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
  x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
};

/**
 * Generates a realistic 1200x800 student math sketch PNG in memory:
 * white sheet, dot grid, axes, parabola y = x^2, line y = 2x, hatch shading, and labels.
 */
function createStudentSketchPngBase64(): string {
  const width = 1200;
  const height = 800;
  const stride = 1 + width * 3;
  const raw = Buffer.alloc(stride * height, 255);

  for (let y = 0; y < height; y += 1) {
    raw[y * stride] = 0; // PNG filter byte 0
  }

  const setPixel = (px: number, py: number, r: number, g: number, b: number) => {
    const xi = Math.round(px);
    const yi = Math.round(py);
    if (xi < 0 || xi >= width || yi < 0 || yi >= height) return;
    const offset = yi * stride + 1 + xi * 3;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
  };

  const drawDot = (cx: number, cy: number, radius: number, r: number, g: number, b: number) => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (dx * dx + dy * dy <= radius * radius) {
          setPixel(cx + dx, cy + dy, r, g, b);
        }
      }
    }
  };

  const drawLine = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    r: number,
    g: number,
    b: number
  ) => {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      drawDot(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thickness, r, g, b);
    }
  };

  const drawText = (text: string, startX: number, startY: number, scale: number, r: number, g: number, b: number) => {
    let cursorX = startX;
    for (const ch of text) {
      const glyph = FONT_5X7[ch];
      if (glyph) {
        for (let row = 0; row < glyph.length; row += 1) {
          for (let col = 0; col < glyph[row].length; col += 1) {
            if (glyph[row][col] === "1") {
              for (let sy = 0; sy < scale; sy += 1) {
                for (let sx = 0; sx < scale; sx += 1) {
                  setPixel(cursorX + col * scale + sx, startY + row * scale + sy, r, g, b);
                }
              }
            }
          }
        }
      }
      cursorX += 6 * scale;
    }
  };

  // Subtle 24px dot grid
  for (let y = 24; y < height; y += 24) {
    for (let x = 24; x < width; x += 24) {
      setPixel(x, y, 203, 213, 225);
    }
  }

  // Coordinate mapping: x in [-1, 3] -> [180, 1020], y in [-1, 5] -> [680, 110]
  const mapX = (x: number) => 180 + ((x + 1) / 4) * 840;
  const mapY = (y: number) => 680 - ((y + 1) / 6) * 570;

  // Axes (Slate #475569)
  drawLine(140, mapY(0), 1060, mapY(0), 2, 71, 85, 105);
  drawLine(mapX(0), 720, mapX(0), 80, 2, 71, 85, 105);

  // Ticks & axis labels
  drawLine(mapX(2), mapY(0) - 8, mapX(2), mapY(0) + 8, 2, 71, 85, 105);
  drawLine(mapX(0) - 8, mapY(4), mapX(0) + 8, mapY(4), 2, 71, 85, 105);
  drawText("2", mapX(2) - 8, mapY(0) + 16, 3, 71, 85, 105);
  drawText("4", mapX(0) - 28, mapY(4) - 10, 3, 71, 85, 105);
  drawText("0", mapX(0) - 26, mapY(0) + 16, 3, 71, 85, 105);

  // Light hatch shading between y = 2x and y = x^2 on [0, 2]
  for (let x = 0.12; x < 1.95; x += 0.14) {
    drawLine(mapX(x), mapY(x * x), mapX(x), mapY(2 * x), 1, 147, 197, 253);
  }

  // Hand-drawn parabola y = x^2 (#0F172A) with slight human wobble
  for (let i = 0; i < 240; i += 1) {
    const x0 = -0.8 + (i / 240) * 3.1;
    const x1 = -0.8 + ((i + 1) / 240) * 3.1;
    const wobble0 = Math.sin(i * 0.25) * 0.03;
    const wobble1 = Math.sin((i + 1) * 0.25) * 0.03;
    drawLine(mapX(x0), mapY(x0 * x0 + wobble0), mapX(x1), mapY(x1 * x1 + wobble1), 2, 15, 23, 42);
  }

  // Hand-drawn line y = 2x (#2563EB)
  drawLine(mapX(-0.5), mapY(-1.0), mapX(2.4), mapY(4.8), 2, 37, 99, 235);

  // Labels
  drawText("y=2x", mapX(1.3) - 90, mapY(3.3), 3, 37, 99, 235);
  drawText("y=x^2", mapX(2.15), mapY(3.4), 3, 15, 23, 42);

  // Intersection dots
  drawDot(mapX(0), mapY(0), 6, 220, 38, 38);
  drawDot(mapX(2), mapY(4), 6, 220, 38, 38);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB color type
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 6 });
  const pngBuffer = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makePngChunk("IHDR", ihdr),
    makePngChunk("IDAT", compressed),
    makePngChunk("IEND", Buffer.alloc(0)),
  ]);
  return pngBuffer.toString("base64");
}

function is429Error(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const status = (err as { status?: unknown; code?: unknown }).status ??
    (err as { status?: unknown; code?: unknown }).code;
  if (status === 429) return true;
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(msg);
}

function formatErrorLabel(err: unknown): string {
  if (!err || typeof err !== "object") return String(err);
  if (err instanceof Error && err.name === "AbortError") {
    return "TIMEOUT (35s)";
  }
  const status = (err as { status?: unknown }).status;
  const msg = err instanceof Error ? err.message : String(err);
  const shortMsg = msg.replace(/\s+/g, " ").slice(0, 90);
  return status ? `HTTP ${status}: ${shortMsg}` : shortMsg;
}

function computeCosts(
  promptTokens: number,
  cachedTokens: number,
  candidatesTokens: number,
  thoughtsTokens: number
): { cost2026Usd: number; cost2027Usd: number } {
  const uncachedInput = Math.max(0, promptTokens - cachedTokens);
  const outputTokens = candidatesTokens + thoughtsTokens;
  const cost2026Usd =
    (uncachedInput * 0.75 + cachedTokens * 0.075 + outputTokens * 3.75) /
    1_000_000;
  const cost2027Usd =
    (uncachedInput * 1.5 + cachedTokens * 0.15 + outputTokens * 7.5) /
    1_000_000;
  return { cost2026Usd, cost2027Usd };
}

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function percentile(nums: number[], p: number): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

function computeAggregate(label: string, rows: BenchmarkRow[]): GroupAggregate {
  const okRows = rows.filter((r) => r.status === "ok");
  const latencies = okRows.map((r) => r.latencyMs);
  return {
    label,
    total: rows.length,
    succeeded: okRows.length,
    successRatePct: rows.length > 0 ? (okRows.length / rows.length) * 100 : 0,
    retry429Count: rows.filter((r) => r.retried429).length,
    avgLatencyMs: mean(latencies),
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    avgInputTokens: mean(okRows.map((r) => r.promptTokenCount ?? 0)),
    avgOutputTokens: mean(okRows.map((r) => r.candidatesTokenCount ?? 0)),
    avgThinkingTokens: mean(okRows.map((r) => r.thoughtsTokenCount ?? 0)),
    avgCachedTokens: mean(okRows.map((r) => r.cachedContentTokenCount ?? 0)),
    avgCost2026Usd: mean(okRows.map((r) => r.cost2026Usd ?? 0)),
    avgCost2027Usd: mean(okRows.map((r) => r.cost2027Usd ?? 0)),
  };
}

function fmtNum(v: number | null, decimals = 0): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return decimals === 0 ? String(Math.round(v)) : v.toFixed(decimals);
}

function fmtUsd(v: number | null, decimals = 6): string {
  if (v === null || !Number.isFinite(v)) return "N/A";
  return `$${v.toFixed(decimals)}`;
}

function csvCell(val: string | number | boolean | null): string {
  if (val === null) return "";
  const str = String(val);
  if (/[",\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runBenchmark(): Promise<void> {
  const env = loadEnvLocal();
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY missing in .env.local");
  }

  const ai = new GoogleGenAI({ apiKey });
  const sketchPngBase64 = createStudentSketchPngBase64();
  const sketchBytes = Buffer.from(sketchPngBase64, "base64").byteLength;
  console.log(
    `[benchmark] Model=${TARGET_MODEL} | Sketch PNG=${sketchBytes} bytes (1200x800) | Cases=${BENCHMARK_CASES.length}`
  );

  const rows: BenchmarkRow[] = [];

  for (let i = 0; i < BENCHMARK_CASES.length; i += 1) {
    const c = BENCHMARK_CASES[i];
    if (i > 0) {
      console.log(`[benchmark] Waiting ${REQUEST_SPACING_MS / 1000}s before request #${c.requestId}...`);
      await sleep(REQUEST_SPACING_MS);
    }

    const systemInstruction = buildWhiteboardSystemInstruction(c.aiMode, c.topicId);
    const contents = buildWhiteboardUserParts({
      mode: c.aiMode,
      prompt: c.prompt,
      pngBase64: c.mode === "sketch_png" ? sketchPngBase64 : undefined,
    });
    const temperature = c.aiMode === "enhance" ? 0.2 : 0.3;

    const invokeOnce = async (): Promise<{
      response: GenerateContentResponse;
      latencyMs: number;
    }> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      const t0 = Date.now();
      try {
        const response = await ai.models.generateContent({
          model: TARGET_MODEL,
          contents,
          config: {
            systemInstruction,
            temperature,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: whiteboardAiResponseSchema,
            abortSignal: controller.signal,
          },
        });
        return { response, latencyMs: Date.now() - t0 };
      } finally {
        clearTimeout(timeout);
      }
    };

    let retried429 = false;
    let finalRes: { response: GenerateContentResponse; latencyMs: number } | null = null;
    let finalErr: unknown = null;
    let attemptStartMs = Date.now();

    try {
      finalRes = await invokeOnce();
    } catch (err) {
      if (is429Error(err)) {
        retried429 = true;
        console.log(
          `[benchmark] #${c.requestId} hit 429; backing off ${BACKOFF_429_MS / 1000}s before 1 retry...`
        );
        await sleep(BACKOFF_429_MS);
        attemptStartMs = Date.now();
        try {
          finalRes = await invokeOnce();
        } catch (retryErr) {
          finalErr = retryErr;
        }
      } else {
        finalErr = err;
      }
    }

    if (finalRes) {
      const usage = finalRes.response.usageMetadata;
      const promptTokens = usage?.promptTokenCount ?? null;
      const cachedTokens = usage?.cachedContentTokenCount ?? 0;
      const candidatesTokens = usage?.candidatesTokenCount ?? null;
      const thoughtsTokens = usage?.thoughtsTokenCount ?? 0;
      const totalTokens = usage?.totalTokenCount ?? null;

      let validJsonSchema = false;
      try {
        const parsed = JSON.parse(finalRes.response.text ?? "");
        validJsonSchema = whiteboardAiOutputZodSchema.safeParse(parsed).success;
      } catch {
        validJsonSchema = false;
      }

      const costs =
        promptTokens !== null && candidatesTokens !== null
          ? computeCosts(
              promptTokens,
              cachedTokens,
              candidatesTokens,
              thoughtsTokens
            )
          : { cost2026Usd: null, cost2027Usd: null };

      const row: BenchmarkRow = {
        requestId: c.requestId,
        mode: c.mode,
        promptLabel: c.promptLabel,
        status: "ok",
        httpStatusOrError: "200 OK",
        retried429,
        latencyMs: finalRes.latencyMs,
        promptTokenCount: promptTokens,
        cachedContentTokenCount: cachedTokens,
        candidatesTokenCount: candidatesTokens,
        thoughtsTokenCount: thoughtsTokens,
        totalTokenCount: totalTokens,
        validJsonSchema,
        cost2026Usd: costs.cost2026Usd,
        cost2027Usd: costs.cost2027Usd,
      };
      rows.push(row);
      console.log(
        `[benchmark] #${c.requestId} (${c.mode}) OK in ${row.latencyMs}ms | in=${promptTokens} out=${candidatesTokens} think=${thoughtsTokens} total=${totalTokens} valid=${validJsonSchema}`
      );
    } else {
      const errLabel = formatErrorLabel(finalErr);
      const row: BenchmarkRow = {
        requestId: c.requestId,
        mode: c.mode,
        promptLabel: c.promptLabel,
        status: "error",
        httpStatusOrError: errLabel,
        retried429,
        latencyMs: Date.now() - attemptStartMs,
        promptTokenCount: null,
        cachedContentTokenCount: null,
        candidatesTokenCount: null,
        thoughtsTokenCount: null,
        totalTokenCount: null,
        validJsonSchema: false,
        cost2026Usd: null,
        cost2027Usd: null,
      };
      rows.push(row);
      console.log(
        `[benchmark] #${c.requestId} (${c.mode}) ERR (${row.latencyMs}ms, retried429=${retried429}): ${errLabel}`
      );
    }
  }

  const textAgg = computeAggregate(
    "Text-Only (5)",
    rows.filter((r) => r.mode === "text")
  );
  const sketchAgg = computeAggregate(
    "Multimodal Sketch (5)",
    rows.filter((r) => r.mode === "sketch_png")
  );
  const overallAgg = computeAggregate("Overall (10)", rows);

  const cohorts = [100, 500, 1000].map((students) => {
    const reqsPerMonth = students * 10;
    const textReqs = reqsPerMonth * 0.5;
    const sketchReqs = reqsPerMonth * 0.5;
    const monthly2026 =
      textAgg.avgCost2026Usd !== null && sketchAgg.avgCost2026Usd !== null
        ? textReqs * textAgg.avgCost2026Usd + sketchReqs * sketchAgg.avgCost2026Usd
        : null;
    const monthly2027 =
      textAgg.avgCost2027Usd !== null && sketchAgg.avgCost2027Usd !== null
        ? textReqs * textAgg.avgCost2027Usd + sketchReqs * sketchAgg.avgCost2027Usd
        : null;
    return {
      students,
      reqsPerMonth,
      monthly2026Usd: monthly2026,
      monthly2027Usd: monthly2027,
    };
  });

  fs.mkdirSync(path.resolve("benchmarks"), { recursive: true });

  const jsonPayload = {
    generatedAt: new Date().toISOString(),
    model: TARGET_MODEL,
    config: {
      thinkingLevel: "LOW",
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      requestSpacingMs: REQUEST_SPACING_MS,
      backoff429Ms: BACKOFF_429_MS,
      sketchPngBytes: sketchBytes,
    },
    pricingTiersUsdPer1M: {
      rate2026: { uncachedInput: 0.75, cachedInput: 0.075, outputAndThinking: 3.75 },
      rate2027: { uncachedInput: 1.5, cachedInput: 0.15, outputAndThinking: 7.5 },
    },
    requests: rows,
    aggregates: {
      textOnly: textAgg,
      multimodalSketch: sketchAgg,
      overall: overallAgg,
    },
    monthlyProjections: cohorts,
  };

  fs.writeFileSync(
    path.resolve("benchmarks/gemini-3.8-flash-10req.json"),
    JSON.stringify(jsonPayload, null, 2)
  );

  const csvHeaders = [
    "requestId",
    "mode",
    "promptLabel",
    "status",
    "httpStatusOrError",
    "retried429",
    "latencyMs",
    "promptTokenCount",
    "cachedContentTokenCount",
    "candidatesTokenCount",
    "thoughtsTokenCount",
    "totalTokenCount",
    "validJsonSchema",
    "cost2026Usd",
    "cost2027Usd",
  ];
  const csvLines = [
    csvHeaders.join(","),
    ...rows.map((r) =>
      [
        r.requestId,
        r.mode,
        r.promptLabel,
        r.status,
        r.httpStatusOrError,
        r.retried429,
        r.latencyMs,
        r.promptTokenCount,
        r.cachedContentTokenCount,
        r.candidatesTokenCount,
        r.thoughtsTokenCount,
        r.totalTokenCount,
        r.validJsonSchema,
        r.cost2026Usd !== null ? r.cost2026Usd.toFixed(8) : "",
        r.cost2027Usd !== null ? r.cost2027Usd.toFixed(8) : "",
      ]
        .map(csvCell)
        .join(",")
    ),
  ];
  fs.writeFileSync(
    path.resolve("benchmarks/gemini-3.8-flash-10req.csv"),
    csvLines.join("\n") + "\n"
  );

  console.log("\n=== MARKDOWN REPORT ===");
  console.log("\n### 1. Per-Request Results\n");
  console.log(
    "| # | Mode | Prompt | Status | HTTP/Error | 429 Retry | Latency (ms) | Input Tok | Cached Tok | Output Tok | Thinking Tok | Total Tok | Valid Schema | 2026 Cost | 2027 Cost |"
  );
  console.log(
    "|---:|---|---|---|---|:---:|---:|---:|---:|---:|---:|---:|:---:|---:|---:|"
  );
  for (const r of rows) {
    console.log(
      `| ${r.requestId} | ${r.mode} | ${r.promptLabel} | ${r.status} | ${r.httpStatusOrError} | ${r.retried429 ? "Yes" : "No"} | ${r.latencyMs} | ${fmtNum(r.promptTokenCount)} | ${fmtNum(r.cachedContentTokenCount)} | ${fmtNum(r.candidatesTokenCount)} | ${fmtNum(r.thoughtsTokenCount)} | ${fmtNum(r.totalTokenCount)} | ${r.validJsonSchema ? "Yes" : "No"} | ${fmtUsd(r.cost2026Usd)} | ${fmtUsd(r.cost2027Usd)} |`
    );
  }

  console.log("\n### 2. Aggregate Unit Economics\n");
  console.log(
    "| Cohort | Success Rate | 429 Retries | Avg Latency | p50 Latency | p95 Latency | Avg Input | Avg Output | Avg Thinking | Avg Cached | Avg Cost (2026) | Avg Cost (2027) |"
  );
  console.log(
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"
  );
  for (const agg of [textAgg, sketchAgg, overallAgg]) {
    console.log(
      `| ${agg.label} | ${agg.succeeded}/${agg.total} (${agg.successRatePct.toFixed(0)}%) | ${agg.retry429Count} | ${fmtNum(agg.avgLatencyMs)} ms | ${fmtNum(agg.p50LatencyMs)} ms | ${fmtNum(agg.p95LatencyMs)} ms | ${fmtNum(agg.avgInputTokens, 1)} | ${fmtNum(agg.avgOutputTokens, 1)} | ${fmtNum(agg.avgThinkingTokens, 1)} | ${fmtNum(agg.avgCachedTokens, 1)} | ${fmtUsd(agg.avgCost2026Usd)} | ${fmtUsd(agg.avgCost2027Usd)} |`
    );
  }

  console.log("\n### 3. Monthly Cost Projections (10 req/student/mo: 50% text, 50% sketch)\n");
  console.log("| Active Students | Total Req / Mo | 2026 Monthly Cost | 2027 Monthly Cost |");
  console.log("|---:|---:|---:|---:|");
  for (const p of cohorts) {
    console.log(
      `| ${p.students} | ${p.reqsPerMonth} | ${fmtUsd(p.monthly2026Usd, 2)} | ${fmtUsd(p.monthly2027Usd, 2)} |`
    );
  }
}
