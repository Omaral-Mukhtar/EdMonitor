// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAiRateLimitStore } from "@/lib/ai/rate-limit";

const mockGetUser = vi.fn();
const mockGenerateContent = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@google/genai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@google/genai")>();
  return {
    ...actual,
    GoogleGenAI: vi.fn(function MockGoogleGenAI() {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    }),
  };
});

import { POST } from "@/app/api/ai/whiteboard/route";

const verifiedUser = {
  id: "user-math-1111-1111-111111111111",
  is_anonymous: false,
  email: "qa-ta@edmonitor.test",
  email_confirmed_at: "2026-11-26T00:05:00.000Z",
};

describe("POST /api/ai/whiteboard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAiRateLimitStore();
    process.env.GEMINI_API_KEY = "test-gemini-api-key";
    process.env.GEMINI_MODEL = "gemini-3.8-flash";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 401 UNAUTHORIZED when user is unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "math",
          roomSlug: "math-2-integrals",
          prompt: "Area between y = x^2 and y = 2x",
        }),
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR for non-math subjects", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "physics",
          roomSlug: "math-2-integrals",
          prompt: "Draw a free body diagram",
        }),
      })
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("VALIDATION_ERROR");
  });

  it("returns 413 PAYLOAD_TOO_LARGE when canvasPngBase64 exceeds 2 MB", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const oversizedBase64 = Buffer.alloc(2 * 1024 * 1024 + 64, 1).toString(
      "base64"
    );

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "enhance",
          subject: "math",
          roomSlug: "math-2-integrals",
          canvasPngBase64: `data:image/png;base64,${oversizedBase64}`,
        }),
      })
    );

    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.error).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns 429 RATE_LIMITED after 10 requests in one minute", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        steps: [
          {
            title: "Plot curves",
            explanation: "Plot y = x^2 and y = 2x.",
            flaggedMistake: null,
            svg: '<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>',
            plotSpec: null,
          },
        ],
      }),
    });

    for (let i = 0; i < 10; i += 1) {
      const okRes = await POST(
        new NextRequest("http://localhost:3000/api/ai/whiteboard", {
          method: "POST",
          body: JSON.stringify({
            mode: "generate",
            subject: "math",
            roomSlug: "math-2-integrals",
            prompt: `Problem ${i}`,
          }),
        })
      );
      expect(okRes.status).toBe(200);
    }

    const limitedRes = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "math",
          roomSlug: "math-2-integrals",
          prompt: "Problem 11",
        }),
      })
    );

    expect(limitedRes.status).toBe(429);
    const json = await limitedRes.json();
    expect(json.error).toBe("RATE_LIMITED");
  });

  it("returns 504 UPSTREAM_TIMEOUT when Gemini call aborts", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const abortErr = new Error("Request aborted");
    abortErr.name = "AbortError";
    mockGenerateContent.mockRejectedValueOnce(abortErr);

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "math",
          roomSlug: "math-2-integrals",
          prompt: "Area between curves",
        }),
      })
    );

    expect(res.status).toBe(504);
    const json = await res.json();
    expect(json.error).toBe("UPSTREAM_TIMEOUT");
  });

  it("returns 502 UPSTREAM_AI_ERROR when Gemini returns malformed JSON", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockGenerateContent.mockResolvedValueOnce({ text: "{not-valid-json" });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "math",
          roomSlug: "math-2-integrals",
          prompt: "Area between curves",
        }),
      })
    );

    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.error).toBe("UPSTREAM_AI_ERROR");
  });

  it("returns 200 OK with syllabus-guided plotSpec and server-sanitized SVG", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        steps: [
          {
            title: "Find intersections & slice",
            explanation:
              "Set x^2 = 2x to get x = 0 and x = 2, then integrate top minus bottom.",
            flaggedMistake: null,
            svg: '<svg viewBox="0 0 1200 800" onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>evil()</script><text x="120" y="90">A = 4/3</text></svg>',
            plotSpec: {
              domain: { xMin: -1, xMax: 3, yMin: -1, yMax: 5 },
              curves: [
                {
                  id: "line",
                  orientation: "y_of_x",
                  expression: "2*x",
                  label: "y = 2x",
                },
                {
                  id: "parabola",
                  orientation: "y_of_x",
                  expression: "x^2",
                  label: "y = x^2",
                },
              ],
              shadedRegions: [
                {
                  id: "r1",
                  orientation: "dx",
                  upperExpr: "2*x",
                  lowerExpr: "x^2",
                  from: 0,
                  to: 2,
                  label: "Area",
                },
              ],
              slices: [
                {
                  orientation: "dx",
                  at: 1,
                  fromExpr: "x^2",
                  toExpr: "2*x",
                  label: "dx",
                },
              ],
              intersections: [
                { x: 0, y: 0, label: "(0, 0)" },
                { x: 2, y: 4, label: "(2, 4)" },
              ],
            },
          },
        ],
      }),
    });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "math",
          roomSlug: "math-2-integrals",
          topicId: "math2-area-between-curves",
          prompt: "Find the area enclosed by y = x^2 and y = 2x",
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.subject).toBe("math");
    expect(json.steps).toHaveLength(1);
    expect(json.steps[0].svg).not.toContain("<script");
    expect(json.steps[0].svg).not.toContain("onload");
    expect(json.steps[0].svg).toContain("A = 4/3");
    expect(json.steps[0].plotSpec.curves).toHaveLength(2);

    // Verify Gemini was called with GEMINI_MODEL, bounded thinking/output config, and syllabus constraints
    const callArg = mockGenerateContent.mock.calls[0]?.[0];
    expect(callArg.model).toBe("gemini-3.8-flash");
    expect(callArg.config.maxOutputTokens).toBe(3200);
    expect(callArg.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(callArg.config.systemInstruction).toContain("math2-area-between-curves");
    expect(callArg.config.systemInstruction).toContain("forbiddenMethods");
  });

  it("retries with GEMINI_FALLBACK_MODEL using a fresh AbortController when primary times out or returns 503", async () => {
    process.env.GEMINI_FALLBACK_MODEL = "gemini-4-hydrogen";
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const abortErr = new Error("Primary timed out");
    abortErr.name = "AbortError";

    mockGenerateContent
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce({
        text: JSON.stringify({
          steps: [
            {
              title: "Fallback step",
              explanation: "Solved via fallback model with fresh signal.",
              flaggedMistake: null,
              svg: '<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>',
              plotSpec: null,
            },
          ],
        }),
      });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "generate",
          subject: "math",
          roomSlug: "math-2-integrals",
          prompt: "Area between y = x^2 and y = 2x",
        }),
      })
    );

    expect(res.status).toBe(200);
    const primaryCall = mockGenerateContent.mock.calls[0]?.[0];
    const fallbackCall = mockGenerateContent.mock.calls[1]?.[0];
    expect(primaryCall?.model).toBe("gemini-3.8-flash");
    expect(fallbackCall?.model).toBe("gemini-4-hydrogen");
    expect(fallbackCall?.config?.abortSignal).toBeDefined();
    expect(fallbackCall?.config?.abortSignal).not.toBe(
      primaryCall?.config?.abortSignal
    );
    expect(fallbackCall?.config?.abortSignal?.aborted).toBe(false);
  });

  it("handles mode='diagnose' with 2-3 valid questions and rejects non-math subjects with 400", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    const badRes = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "diagnose",
          subject: "general",
          roomSlug: "general-quiet-hall",
          topicId: "math2-area-between-curves",
          prompt: "Summarize World War II causes",
        }),
      })
    );

    expect(badRes.status).toBe(400);
    const badJson = await badRes.json();
    expect(badJson.error).toBe("VALIDATION_ERROR");

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        topicSummary:
          "Find the total enclosed area between y = x^3 and y = x over [-1, 1].",
        questions: [
          {
            id: "q1",
            conceptTag: "Crossing Curves",
            question: "Do y = x^3 and y = x cross inside (-1, 1)?",
            options: [
              "Yes, they cross at x = 0 so we split at 0",
              "No, y = x is always above y = x^3",
              "They only touch at x = 1",
            ],
          },
          {
            id: "q2",
            conceptTag: "Top vs Bottom on [-1, 0]",
            question: "Which curve is on top on the interval [-1, 0]?",
            options: [
              "y = x^3 is above y = x",
              "y = x is above y = x^3",
              "Both curves are equal on [-1, 0]",
            ],
          },
        ],
      }),
    });

    const okRes = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "diagnose",
          subject: "math",
          roomSlug: "math-2-integrals",
          topicId: "math2-area-between-curves",
          prompt: "Find the area enclosed by y = x^3 and y = x on [-1, 1]",
        }),
      })
    );

    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(json.mode).toBe("diagnose");
    expect(json.subject).toBe("math");
    expect(json.topicSummary).toContain("y = x^3");
    expect(json.questions).toHaveLength(2);
    expect(json.questions[0].options).toHaveLength(3);

    const callArg = mockGenerateContent.mock.calls[0]?.[0];
    expect(callArg.config.maxOutputTokens).toBe(900);
    expect(callArg.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
    expect(callArg.config.systemInstruction).toContain("math2-area-between-curves");
  });

  it("handles mode='explain_topic' with diagnosticAnswers returning conceptGaps and valid plotSpec", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: verifiedUser },
      error: null,
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        conceptGaps: [
          {
            concept: "Crossing Curves",
            status: "solid",
            note: "Correctly spotted the crossing at x = 0 requiring two integrals.",
          },
          {
            concept: "Top vs Bottom on [-1, 0]",
            status: "gap",
            note: "For x = -0.5, (-0.5)^3 = -0.125 > -0.5, so y = x^3 is on top.",
          },
        ],
        steps: [
          {
            title: "Split at x = 0 and plot regions",
            explanation:
              "Because x^3 > x on [-1, 0] and x > x^3 on [0, 1], split the integral at x = 0.",
            flaggedMistake: null,
            svg: '<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>',
            plotSpec: {
              domain: { xMin: -1.5, xMax: 1.5, yMin: -1.5, yMax: 1.5 },
              curves: [
                {
                  id: "cubic",
                  orientation: "y_of_x",
                  expression: "x^3",
                  label: "y = x^3",
                },
                {
                  id: "line",
                  orientation: "y_of_x",
                  expression: "x",
                  label: "y = x",
                },
              ],
              shadedRegions: [
                {
                  id: "left-region",
                  orientation: "dx",
                  upperExpr: "x^3",
                  lowerExpr: "x",
                  from: -1,
                  to: 0,
                  label: "[-1, 0]",
                },
                {
                  id: "right-region",
                  orientation: "dx",
                  upperExpr: "x",
                  lowerExpr: "x^3",
                  from: 0,
                  to: 1,
                  label: "[0, 1]",
                },
              ],
              intersections: [
                { x: -1, y: -1, label: "(-1, -1)" },
                { x: 0, y: 0, label: "(0, 0)" },
                { x: 1, y: 1, label: "(1, 1)" },
              ],
            },
          },
        ],
      }),
    });

    const res = await POST(
      new NextRequest("http://localhost:3000/api/ai/whiteboard", {
        method: "POST",
        body: JSON.stringify({
          mode: "explain_topic",
          subject: "math",
          roomSlug: "math-2-integrals",
          topicId: "math2-area-between-curves",
          prompt: "Find the area enclosed by y = x^3 and y = x on [-1, 1]",
          diagnosticAnswers: [
            {
              conceptTag: "Crossing Curves",
              question: "Do y = x^3 and y = x cross inside (-1, 1)?",
              studentAnswer: "Yes, they cross at x = 0 so we split at 0",
            },
            {
              conceptTag: "Top vs Bottom on [-1, 0]",
              question: "Which curve is on top on the interval [-1, 0]?",
              studentAnswer: "I'm not sure",
            },
          ],
        }),
      })
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.mode).toBe("explain_topic");
    expect(json.conceptGaps).toHaveLength(2);
    expect(json.conceptGaps[1].status).toBe("gap");
    expect(json.steps[0].plotSpec.shadedRegions).toHaveLength(2);

    const callArg = mockGenerateContent.mock.calls[0]?.[0];
    expect(callArg.config.maxOutputTokens).toBe(3200);
    expect(callArg.config.systemInstruction).toContain("conceptGaps");
    expect(callArg.config.systemInstruction).toContain("forbiddenMethods");
    expect(callArg.contents[0].text).toContain("untrusted student input");
    expect(callArg.contents[0].text).toContain("I'm not sure");
  });
});
