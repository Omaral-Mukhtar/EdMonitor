import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RoomHudDock } from "@/components/room3d/RoomHudDock";
import { SvgOverlayLayer } from "@/components/whiteboard/SvgOverlayLayer";
import { WhiteboardOverlay } from "@/components/whiteboard/WhiteboardOverlay";
import { getCampusRoomBySlug } from "@/lib/campus-rooms";

beforeAll(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WhiteboardOverlay, RoomHudDock & SvgOverlayLayer", () => {
  it("renders My Whiteboard & AI button in both silent and topic rooms", () => {
    const silentRoom = getCampusRoomBySlug("general-quiet-hall")!;
    const topicRoom = getCampusRoomBySlug("math-2-integrals")!;

    const { rerender } = render(
      <RoomHudDock
        room={silentRoom}
        tableId={null}
        isLeaving={false}
        isMicOn={false}
        isCamOn={false}
        isCameraAvailable={false}
        isChatOpen={false}
        isWhiteboardOpen={false}
        unreadChatCount={0}
        onToggleMic={vi.fn()}
        onToggleCam={vi.fn()}
        onToggleChat={vi.fn()}
        onToggleWhiteboard={vi.fn()}
        onStandUp={vi.fn()}
        onLeaveRoom={vi.fn()}
      />
    );

    expect(screen.getByTestId("dock-whiteboard-button")).toBeInTheDocument();

    rerender(
      <RoomHudDock
        room={topicRoom}
        tableId="table-1"
        isLeaving={false}
        isMicOn={false}
        isCamOn={false}
        isCameraAvailable={true}
        isChatOpen={false}
        isWhiteboardOpen={true}
        unreadChatCount={0}
        onToggleMic={vi.fn()}
        onToggleCam={vi.fn()}
        onToggleChat={vi.fn()}
        onToggleWhiteboard={vi.fn()}
        onStandUp={vi.fn()}
        onLeaveRoom={vi.fn()}
      />
    );

    expect(screen.getByTestId("dock-whiteboard-button")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("shows 'Math topics only' notice in General Study rooms and keeps solo canvas active", () => {
    const silentRoom = getCampusRoomBySlug("general-quiet-hall")!;
    const mathRoom = getCampusRoomBySlug("math-2-integrals")!;

    const { rerender } = render(
      <WhiteboardOverlay
        open={true}
        room={silentRoom}
        tableId="table-1"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.getByTestId("general-room-math-only-notice")
    ).toHaveTextContent("Math topics only");
    expect(screen.getByTestId("whiteboard-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("whiteboard-3d-paused-badge")).toHaveTextContent(
      "3D Paused"
    );

    rerender(
      <WhiteboardOverlay
        open={true}
        room={mathRoom}
        tableId="table-1"
        onClose={vi.fn()}
      />
    );

    expect(
      screen.queryByTestId("general-room-math-only-notice")
    ).not.toBeInTheDocument();
  });

  it("double-sanitizes AI SVG and renders deterministic MathPlotSpec in SvgOverlayLayer", () => {
    const { container } = render(
      <SvgOverlayLayer
        visible={true}
        step={{
          title: "Step 1",
          explanation: "Plot parabola.",
          flaggedMistake: null,
          svg: '<svg viewBox="0 0 1200 800" onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><text x="100" y="100">y = x^2</text></svg>',
          plotSpec: {
            domain: { xMin: -2, xMax: 2, yMin: 0, yMax: 4 },
            curves: [
              {
                id: "parabola",
                orientation: "y_of_x",
                expression: "x^2",
                label: "y = x^2",
              },
            ],
          },
        }}
      />
    );

    expect(screen.getByTestId("svg-overlay-mathplot")).toBeInTheDocument();
    expect(screen.getByTestId("svg-overlay-ai")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onload");
  });

  it("closes on Escape key press", () => {
    const onClose = vi.fn();
    const mathRoom = getCampusRoomBySlug("math-2-integrals")!;

    render(
      <WhiteboardOverlay
        open={true}
        room={mathRoom}
        tableId={null}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("runs the 2-phase Socratic Diagnostic flow (Diagnose -> Answer/Not sure -> Concept Check + Plot)", async () => {
    const mathRoom = getCampusRoomBySlug("math-2-integrals")!;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          mode: "diagnose",
          subject: "math",
          topicSummary:
            "Determine intersections and top/bottom curves for y = x^3 and y = x on [-1, 1].",
          questions: [
            {
              id: "q1",
              conceptTag: "Crossing Points",
              question: "Where do y = x^3 and y = x intersect on [-1, 1]?",
              options: ["x = -1, 0, 1", "Only x = 0", "They do not intersect"],
            },
            {
              id: "q2",
              conceptTag: "Upper Curve on [-1, 0]",
              question: "Which curve is higher on [-1, 0]?",
              options: ["y = x^3", "y = x", "They overlap"],
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          overlayId: "overlay-diag-1",
          mode: "explain_topic",
          subject: "math",
          conceptGaps: [
            {
              concept: "Crossing Points",
              status: "solid",
              note: "Great job identifying x = -1, 0, and 1.",
            },
            {
              concept: "Upper Curve on [-1, 0]",
              status: "gap",
              note: "Test x = -0.5: (-0.5)^3 = -0.125 > -0.5, so y = x^3 is on top.",
            },
          ],
          steps: [
            {
              title: "Split integral at x = 0",
              explanation:
                "Integrate (x^3 - x) on [-1, 0] and (x - x^3) on [0, 1].",
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
                    id: "r1",
                    orientation: "dx",
                    upperExpr: "x^3",
                    lowerExpr: "x",
                    from: -1,
                    to: 0,
                  },
                ],
              },
            },
          ],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <WhiteboardOverlay
        open={true}
        room={mathRoom}
        tableId="table-1"
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId("ai-prompt-input"), {
      target: {
        value: "Find the area enclosed by y = x^3 and y = x on [-1, 1]",
      },
    });

    fireEvent.click(screen.getByTestId("ai-submit-button"));

    await waitFor(() => {
      expect(screen.getByTestId("diagnostic-check-section")).toBeInTheDocument();
    });

    expect(screen.getByTestId("diagnostic-concept-tag-0")).toHaveTextContent(
      "Crossing Points"
    );
    expect(screen.getByTestId("diagnostic-concept-tag-1")).toHaveTextContent(
      "Upper Curve on [-1, 0]"
    );
    expect(screen.getByTestId("ai-analyze-gaps-button")).toBeDisabled();

    // Select an option for Q1 and "I'm not sure" for Q2
    fireEvent.click(screen.getByText("x = -1, 0, 1"));
    const notSureButtons = screen.getAllByRole("button", {
      name: "I'm not sure",
    });
    fireEvent.click(notSureButtons[1]);

    expect(screen.getByTestId("ai-analyze-gaps-button")).toBeEnabled();
    fireEvent.click(screen.getByTestId("ai-analyze-gaps-button"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-concept-check-summary")).toBeInTheDocument();
    });

    expect(screen.getByTestId("concept-solid-badge-0")).toHaveTextContent(
      "Crossing Points"
    );
    expect(screen.getByTestId("concept-gap-badge-1")).toHaveTextContent(
      "Upper Curve on [-1, 0]"
    );
    expect(screen.getByTestId("ai-step-card-0")).toHaveTextContent(
      "Split integral at x = 0"
    );
    expect(screen.getByTestId("svg-overlay-mathplot")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(firstBody.mode).toBe("diagnose");
    expect(secondBody.mode).toBe("explain_topic");
    expect(secondBody.diagnosticAnswers).toEqual([
      {
        conceptTag: "Crossing Points",
        question: "Where do y = x^3 and y = x intersect on [-1, 1]?",
        studentAnswer: "x = -1, 0, 1",
      },
      {
        conceptTag: "Upper Curve on [-1, 0]",
        question: "Which curve is higher on [-1, 0]?",
        studentAnswer: "I'm not sure",
      },
    ]);
  });

  it("supports the 'Skip & Plot Directly' path bypassing diagnostics", async () => {
    const mathRoom = getCampusRoomBySlug("math-2-integrals")!;
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        overlayId: "overlay-skip-1",
        mode: "explain_topic",
        subject: "math",
        steps: [
          {
            title: "Plot curves directly",
            explanation: "Skipped diagnostics and plotted y = x^2 and y = 2x.",
            flaggedMistake: null,
            svg: '<svg viewBox="0 0 1200 800" xmlns="http://www.w3.org/2000/svg"></svg>',
            plotSpec: {
              domain: { xMin: -1, xMax: 3, yMin: -1, yMax: 5 },
              curves: [
                {
                  id: "line",
                  orientation: "y_of_x",
                  expression: "2*x",
                  label: "y = 2x",
                },
              ],
            },
          },
        ],
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    render(
      <WhiteboardOverlay
        open={true}
        room={mathRoom}
        tableId="table-1"
        onClose={vi.fn()}
      />
    );

    fireEvent.change(screen.getByTestId("ai-prompt-input"), {
      target: { value: "Find the area enclosed by y = x^2 and y = 2x" },
    });

    fireEvent.click(screen.getByTestId("ai-skip-diagnose-button"));

    await waitFor(() => {
      expect(screen.getByTestId("ai-step-card-0")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("ai-concept-check-summary")
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("svg-overlay-mathplot")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.mode).toBe("explain_topic");
    expect(body.diagnosticAnswers).toBeUndefined();
  });

  it("defaults Syllabus Topic and example chips to Math 1 Limits in math-calculus and Math 2 Areas in math-2-integrals", () => {
    const calculusRoom = getCampusRoomBySlug("math-calculus")!;
    const integralsRoom = getCampusRoomBySlug("math-2-integrals")!;

    const { unmount } = render(
      <WhiteboardOverlay
        open={true}
        room={calculusRoom}
        tableId="table-1"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId("ai-topic-select")).toHaveValue("math1-limits");
    expect(screen.getByTestId("ai-example-chip-0")).toHaveTextContent(
      "Find lim as x -> 1 of (x^2 - 1) / (x - 1)"
    );
    expect(screen.getByTestId("ai-example-chip-1")).toHaveTextContent(
      "Analyze lim as x -> 2 of 1 / (x - 2)"
    );

    unmount();

    render(
      <WhiteboardOverlay
        open={true}
        room={integralsRoom}
        tableId="table-1"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId("ai-topic-select")).toHaveValue(
      "math2-area-between-curves"
    );
  });
});
