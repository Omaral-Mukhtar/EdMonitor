import { randomUUID } from "node:crypto";
import { GoogleGenAI, ThinkingLevel, type GenerateContentResponse } from "@google/genai";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isValidMathExpression } from "@/lib/ai/math-eval";
import {
  buildWhiteboardSystemInstruction,
  buildWhiteboardUserParts,
  diagnosticCheckOutputZodSchema,
  diagnosticCheckResponseSchema,
  MAX_DIAGNOSE_OUTPUT_TOKENS,
  MAX_WHITEBOARD_PNG_BYTES,
  MAX_WHITEBOARD_PROMPT_CHARS,
  whiteboardAiOutputZodSchema,
  whiteboardAiResponseSchema,
  whiteboardAiWithGapsResponseSchema,
} from "@/lib/ai/prompts";
import { checkAiRateLimit } from "@/lib/ai/rate-limit";
import { sanitizeSvgServer } from "@/lib/ai/sanitizeSvg";
import { apiError } from "@/lib/api-errors";
import { isVerifiedEmailUser } from "@/lib/auth-user";
import { getCampusRoomBySlug } from "@/lib/campus-rooms";
import { createClient } from "@/lib/supabase/server";
import type {
  DiagnosticCheckResponse,
  MathPlotSpec,
  WhiteboardAiResponse,
  WhiteboardAiStep,
} from "@/types/whiteboard";

const PRIMARY_GEMINI_TIMEOUT_MS = 7_000;
const FALLBACK_GEMINI_TIMEOUT_MS = 18_000;
const MAX_WHITEBOARD_OUTPUT_TOKENS = 3200;
const TRANSIENT_RETRY_DELAY_MS = 500;
const EMPTY_SAFE_SVG =
  '<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>';

const diagnosticAnswerInputSchema = z.object({
  conceptTag: z.string().trim().min(1).max(80),
  question: z.string().trim().min(1).max(300),
  studentAnswer: z.string().trim().min(1).max(300),
});

const whiteboardRequestSchema = z
  .object({
    mode: z.enum([
      "enhance",
      "generate",
      "enhance_sketch",
      "explain_topic",
      "diagnose",
    ]),
    subject: z.string().trim(),
    roomSlug: z.string().trim().min(1, "roomSlug is required."),
    tableId: z.string().trim().max(32).nullable().optional(),
    topicId: z.string().trim().max(64).nullable().optional(),
    prompt: z
      .string()
      .trim()
      .max(
        MAX_WHITEBOARD_PROMPT_CHARS,
        `prompt must be at most ${MAX_WHITEBOARD_PROMPT_CHARS} characters.`
      )
      .optional(),
    canvasPngBase64: z.string().trim().optional(),
    diagnosticAnswers: z.array(diagnosticAnswerInputSchema).max(5).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.subject !== "math") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["subject"],
        message:
          "AI Whiteboard Tutor is strictly scoped to Mathematics (subject must be 'math').",
      });
    }
    const isGenerateLike =
      data.mode === "generate" ||
      data.mode === "explain_topic" ||
      data.mode === "diagnose";
    if (isGenerateLike && (!data.prompt || data.prompt.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["prompt"],
        message: `prompt is required when mode is '${data.mode}'.`,
      });
    }
    const isEnhanceLike =
      data.mode === "enhance" || data.mode === "enhance_sketch";
    if (
      isEnhanceLike &&
      (!data.canvasPngBase64 || data.canvasPngBase64.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["canvasPngBase64"],
        message: `canvasPngBase64 is required when mode is '${data.mode}'.`,
      });
    }
  });

function stripPngDataUrlPrefix(raw: string): {
  base64: string;
  validMime: boolean;
} {
  const trimmed = raw.trim();
  if (trimmed.startsWith("data:")) {
    const match = /^data:(image\/png);base64,([A-Za-z0-9+/=\s]+)$/i.exec(trimmed);
    if (!match) {
      return { base64: "", validMime: false };
    }
    return { base64: match[2].replace(/\s+/g, ""), validMime: true };
  }
  return {
    base64: trimmed.replace(/\s+/g, ""),
    validMime: /^[A-Za-z0-9+/=]+$/.test(trimmed.replace(/\s+/g, "")),
  };
}

function sanitizePlotSpec(spec: MathPlotSpec | null | undefined): MathPlotSpec | null {
  if (!spec) {
    return null;
  }

  const validCurves = spec.curves.filter((curve) => {
    const variable = curve.orientation === "y_of_x" ? "x" : "y";
    return isValidMathExpression(curve.expression, variable);
  });

  const validRegions = (spec.shadedRegions ?? []).filter((region) => {
    const variable = region.orientation === "dx" ? "x" : "y";
    return (
      isValidMathExpression(region.upperExpr, variable) &&
      isValidMathExpression(region.lowerExpr, variable)
    );
  });

  const validSlices = (spec.slices ?? []).filter((slice) => {
    const variable = slice.orientation === "dx" ? "x" : "y";
    return (
      isValidMathExpression(slice.fromExpr, variable) &&
      isValidMathExpression(slice.toExpr, variable)
    );
  });

  const hasContent =
    validCurves.length > 0 ||
    validRegions.length > 0 ||
    validSlices.length > 0 ||
    (spec.intersections?.length ?? 0) > 0 ||
    (spec.asymptotes?.length ?? 0) > 0 ||
    (spec.holes?.length ?? 0) > 0 ||
    (spec.verticalAsymptotes?.length ?? 0) > 0;

  if (!hasContent) {
    return null;
  }

  return {
    domain: spec.domain,
    curves: validCurves,
    shadedRegions: validRegions.length > 0 ? validRegions : null,
    slices: validSlices.length > 0 ? validSlices : null,
    intersections: spec.intersections ?? null,
    asymptotes: spec.asymptotes ?? null,
    ...(spec.holes && spec.holes.length > 0 ? { holes: spec.holes } : {}),
    ...(spec.verticalAsymptotes && spec.verticalAsymptotes.length > 0
      ? { verticalAsymptotes: spec.verticalAsymptotes }
      : {}),
  };
}

function isTransientUpstreamError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const maybeStatus = (err as { status?: unknown; code?: unknown }).status ??
    (err as { status?: unknown; code?: unknown }).code;
  if (maybeStatus === 429 || maybeStatus === 503) {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|503|rate limit|unavailable|resource_exhausted)\b/i.test(message);
}

function isAbortError(err: unknown, signal: AbortSignal): boolean {
  if (signal.aborted) {
    return true;
  }
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /abort/i.test(err.message))
  );
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !isVerifiedEmailUser(user)) {
    return apiError(
      401,
      "UNAUTHORIZED",
      "Verified email authentication required."
    );
  }

  const rateLimit = checkAiRateLimit(user.id);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMITED",
        message: "Too many AI tutor requests. Please wait a moment before retrying.",
        details: { retryAfterSeconds: rateLimit.retryAfterSeconds },
      },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "VALIDATION_ERROR", "Invalid JSON request body.");
  }

  // Check raw PNG size early before full Zod validation
  if (
    body &&
    typeof body === "object" &&
    "canvasPngBase64" in body &&
    typeof (body as { canvasPngBase64?: unknown }).canvasPngBase64 === "string"
  ) {
    const rawPng = (body as { canvasPngBase64: string }).canvasPngBase64;
    if (rawPng.trim().length > 0) {
      const { base64, validMime } = stripPngDataUrlPrefix(rawPng);
      if (!validMime || !base64) {
        return apiError(
          400,
          "VALIDATION_ERROR",
          "canvasPngBase64 must be a valid base64-encoded PNG image."
        );
      }
      const decodedBytes = Buffer.from(base64, "base64").byteLength;
      if (decodedBytes > MAX_WHITEBOARD_PNG_BYTES) {
        return apiError(
          413,
          "PAYLOAD_TOO_LARGE",
          "Whiteboard PNG exceeds the 2 MB limit.",
          { maxBytes: MAX_WHITEBOARD_PNG_BYTES, actualBytes: decodedBytes }
        );
      }
    }
  }

  const parsed = whiteboardRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid AI whiteboard request.",
      { fieldErrors: parsed.error.flatten().fieldErrors }
    );
  }

  const {
    mode,
    roomSlug,
    topicId,
    prompt,
    canvasPngBase64,
    diagnosticAnswers,
  } = parsed.data;
  const room = getCampusRoomBySlug(roomSlug);
  if (!room) {
    return apiError(404, "NOT_FOUND", `Study room '${roomSlug}' was not found.`);
  }

  let cleanPngBase64: string | undefined;
  if (canvasPngBase64) {
    const stripped = stripPngDataUrlPrefix(canvasPngBase64);
    if (!stripped.validMime || !stripped.base64) {
      return apiError(
        400,
        "VALIDATION_ERROR",
        "canvasPngBase64 must be a valid base64-encoded PNG image."
      );
    }
    const decodedBytes = Buffer.from(stripped.base64, "base64").byteLength;
    if (decodedBytes > MAX_WHITEBOARD_PNG_BYTES) {
      return apiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "Whiteboard PNG exceeds the 2 MB limit."
      );
    }
    cleanPngBase64 = stripped.base64;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const model = process.env.GEMINI_MODEL?.trim() ?? "";
  const fallbackModel = process.env.GEMINI_FALLBACK_MODEL?.trim() ?? "";
  if (!apiKey || !model) {
    return apiError(
      500,
      "INTERNAL_ERROR",
      "Gemini AI server configuration is missing."
    );
  }

  const isDiagnose = mode === "diagnose";
  const isEnhance = mode === "enhance" || mode === "enhance_sketch";
  const effectiveDiagnosticAnswers =
    !isDiagnose && !isEnhance && diagnosticAnswers && diagnosticAnswers.length > 0
      ? diagnosticAnswers
      : undefined;
  const hasDiagnosticAnswers = Boolean(effectiveDiagnosticAnswers?.length);

  const ai = new GoogleGenAI({ apiKey });
  const systemInstruction = buildWhiteboardSystemInstruction(mode, topicId, {
    hasDiagnosticAnswers,
  });
  const contents = buildWhiteboardUserParts({
    mode,
    prompt,
    pngBase64: cleanPngBase64,
    diagnosticAnswers: effectiveDiagnosticAnswers,
  });
  const temperature = isEnhance || isDiagnose ? 0.2 : 0.3;
  const maxOutputTokens = isDiagnose
    ? MAX_DIAGNOSE_OUTPUT_TOKENS
    : MAX_WHITEBOARD_OUTPUT_TOKENS;
  const responseSchema = isDiagnose
    ? diagnosticCheckResponseSchema
    : hasDiagnosticAnswers
      ? whiteboardAiWithGapsResponseSchema
      : whiteboardAiResponseSchema;

  const invokeWithTimeout = async (
    targetModel: string,
    timeoutMs: number
  ): Promise<GenerateContentResponse> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    try {
      return await ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          temperature,
          maxOutputTokens,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema,
          abortSignal: controller.signal,
        },
      });
    } catch (err) {
      if (isAbortError(err, controller.signal)) {
        const abortErr = new Error(`Gemini request timed out after ${timeoutMs}ms`);
        abortErr.name = "AbortError";
        throw abortErr;
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const requestStartMs = Date.now();
  let modelUsed = model;
  let fallbackReason: string | null = null;
  let response: GenerateContentResponse;

  try {
    try {
      response = await invokeWithTimeout(model, PRIMARY_GEMINI_TIMEOUT_MS);
    } catch (firstErr) {
      const hasFallback = Boolean(fallbackModel) && fallbackModel !== model;
      const timedOut =
        firstErr instanceof Error && firstErr.name === "AbortError";
      const transient = isTransientUpstreamError(firstErr);

      if (hasFallback && (timedOut || transient)) {
        fallbackReason = timedOut
          ? "primary_timeout"
          : `primary_transient_${
              (firstErr as { status?: unknown })?.status ?? "error"
            }`;
        modelUsed = fallbackModel;
        response = await invokeWithTimeout(
          fallbackModel,
          FALLBACK_GEMINI_TIMEOUT_MS
        );
      } else if (!hasFallback && transient) {
        fallbackReason = "primary_transient_retry";
        await new Promise((resolve) =>
          setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS)
        );
        response = await invokeWithTimeout(model, PRIMARY_GEMINI_TIMEOUT_MS);
      } else {
        throw firstErr;
      }
    }
  } catch (err) {
    const latencyMs = Date.now() - requestStartMs;
    const timedOut = err instanceof Error && err.name === "AbortError";
    console.warn("[ai/whiteboard] upstream failure", {
      mode,
      roomSlug,
      modelUsed,
      fallbackReason,
      latencyMs,
      timedOut,
      errorName: err instanceof Error ? err.name : "unknown",
    });

    if (timedOut) {
      return apiError(
        504,
        "UPSTREAM_TIMEOUT",
        "Math AI tutor request timed out. Please try again."
      );
    }
    return apiError(
      502,
      "UPSTREAM_AI_ERROR",
      "Failed to generate a Math AI response from Gemini."
    );
  }

  const latencyMs = Date.now() - requestStartMs;
  const usage = response.usageMetadata;
  console.info("[ai/whiteboard] completed", {
    mode,
    roomSlug,
    modelUsed,
    fallbackReason,
    latencyMs,
    promptTokens: usage?.promptTokenCount ?? null,
    candidatesTokens: usage?.candidatesTokenCount ?? null,
    thoughtsTokens: usage?.thoughtsTokenCount ?? null,
    totalTokens: usage?.totalTokenCount ?? null,
  });

  const rawText = response.text;

  if (!rawText) {
    return apiError(
      502,
      "UPSTREAM_AI_ERROR",
      "Gemini returned an empty response."
    );
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    return apiError(
      502,
      "UPSTREAM_AI_ERROR",
      "Gemini returned malformed JSON."
    );
  }

  if (isDiagnose) {
    const validatedDiagnostic =
      diagnosticCheckOutputZodSchema.safeParse(parsedJson);
    if (!validatedDiagnostic.success) {
      return apiError(
        502,
        "UPSTREAM_AI_ERROR",
        "Gemini diagnostic response did not match the required schema."
      );
    }

    const diagnosticPayload: DiagnosticCheckResponse = {
      mode: "diagnose",
      subject: "math",
      topicSummary: validatedDiagnostic.data.topicSummary,
      questions: validatedDiagnostic.data.questions.map((q) => ({
        id: q.id,
        conceptTag: q.conceptTag,
        question: q.question,
        options: q.options.slice(0, 3),
      })),
    };

    return NextResponse.json(diagnosticPayload, { status: 200 });
  }

  const validatedOutput = whiteboardAiOutputZodSchema.safeParse(parsedJson);
  if (!validatedOutput.success) {
    return apiError(
      502,
      "UPSTREAM_AI_ERROR",
      "Gemini response did not match the required step schema."
    );
  }

  const sanitizedSteps: WhiteboardAiStep[] = validatedOutput.data.steps.map(
    (step) => {
      const cleanedSvg = sanitizeSvgServer(step.svg);
      return {
        title: step.title,
        explanation: step.explanation,
        flaggedMistake: step.flaggedMistake ?? null,
        svg: cleanedSvg || EMPTY_SAFE_SVG,
        plotSpec: sanitizePlotSpec(step.plotSpec ?? null),
      };
    }
  );

  const responseMode: WhiteboardAiResponse["mode"] =
    mode === "explain_topic" || mode === "enhance_sketch"
      ? mode
      : isEnhance
        ? "enhance"
        : "generate";

  const payload: WhiteboardAiResponse = {
    overlayId: randomUUID(),
    mode: responseMode,
    subject: "math",
    ...(validatedOutput.data.conceptGaps &&
    validatedOutput.data.conceptGaps.length > 0
      ? { conceptGaps: validatedOutput.data.conceptGaps }
      : {}),
    steps: sanitizedSteps,
  };

  return NextResponse.json(payload, { status: 200 });
}
