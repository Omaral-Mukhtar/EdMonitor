import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingDialog } from "@/components/ta-scheduler/BookingDialog";
import { TaSchedulerShell } from "@/components/ta-scheduler/TaSchedulerShell";
import type { TaScheduleMetadataResponse } from "@/types/ta-schedule";

const METADATA: TaScheduleMetadataResponse = {
  courses: [
    { id: "c-math", code: "MATH101", subject: "math", title: "Calculus I" },
    {
      id: "c-phys",
      code: "PHYS101",
      subject: "physics",
      title: "Mechanics & Waves",
    },
  ],
  cohorts: [
    {
      id: "coh-a",
      code: "Y1-STEM-A",
      label: "Year 1 STEM - Group A",
      studentCount: 40,
    },
  ],
  cohortCourses: [
    { cohortId: "coh-a", courseId: "c-math" },
    { cohortId: "coh-a", courseId: "c-phys" },
  ],
  tas: [
    {
      id: "ta-ali",
      courseId: "c-math",
      displayName: "TA Ali",
      email: "ali@edmonitor.edu",
    },
    {
      id: "ta-mai",
      courseId: "c-phys",
      displayName: "TA Mai",
      email: "mai@edmonitor.edu",
    },
  ],
  rooms: [
    {
      id: "room-104",
      code: "DISC-104",
      label: "Discussion Room 104",
      capacity: 45,
    },
    {
      id: "room-201",
      code: "LAB-B201",
      label: "STEM Studio B201",
      capacity: 45,
    },
  ],
};

describe("TA Scheduler UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("toggles between Student View and TA View and displays empty state CTA", () => {
    render(
      <TaSchedulerShell
        metadata={METADATA}
        initialBookings={[]}
        initialWeekStart="2026-11-23"
        campusTz="UTC"
      />
    );

    expect(
      screen.getByText("No TA discussions scheduled for this cohort this week.")
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Schedule Discussion" })
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /TA View/i }));

    expect(
      screen.getByRole("button", { name: "Schedule Discussion" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Schedule First Session/i })
    ).toBeTruthy();
  });

  it("renders 409 conflict explanation, applies 1-click suggested slot, and submits to 201", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "BOOKING_CONFLICT",
            message: "Slot blocked due to 1 overlapping constraint(s).",
            conflicts: [
              {
                dimension: "cohort",
                bookingId: "b-1",
                courseCode: "MATH101",
                topic: "Calculus Review",
                startsAt: "2026-11-26T14:00:00.000Z",
                endsAt: "2026-11-26T15:00:00.000Z",
              },
            ],
            suggestions: [
              {
                startsAt: "2026-11-26T15:30:00.000Z",
                endsAt: "2026-11-26T16:30:00.000Z",
                roomId: "room-201",
                roomCode: "LAB-B201",
              },
            ],
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            booking: {
              id: "b-2",
              courseId: "c-math",
              cohortId: "coh-a",
              taId: "ta-ali",
              roomId: "room-201",
              topic: "Vector Calculus",
              status: "scheduled",
              startsAt: "2026-11-26T15:30:00.000Z",
              endsAt: "2026-11-26T16:30:00.000Z",
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        )
      );

    vi.stubGlobal("fetch", fetchMock);
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <BookingDialog
        open={true}
        openKey={1}
        onOpenChange={onOpenChange}
        metadata={METADATA}
        campusTz="UTC"
        initialDate="2026-11-26"
        initialStartTime="14:00"
        initialEndTime="15:00"
        onCreated={onCreated}
      />
    );

    fireEvent.change(screen.getByLabelText("Discussion Topic"), {
      target: { value: "Vector Calculus" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /Schedule Discussion/i })
    );

    const conflictBanner = await screen.findByRole("alert");
    expect(conflictBanner.textContent).toContain("Cohort conflict");
    expect(conflictBanner.textContent).toContain("MATH101");

    const suggestionButton = screen.getByRole("button", {
      name: /15:30–16:30 · LAB-B201/i,
    });
    fireEvent.click(suggestionButton);

    expect(
      screen.getByText(/Applied 2026-11-26 15:30–16:30 in LAB-B201/i)
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /Schedule Discussion/i })
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(onCreated).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    const secondCallBody = JSON.parse(
      (fetchMock.mock.calls[1]?.[1] as { body: string }).body
    );
    expect(secondCallBody.startsAt).toBe("2026-11-26T15:30:00.000Z");
    expect(secondCallBody.endsAt).toBe("2026-11-26T16:30:00.000Z");
    expect(secondCallBody.roomId).toBe("room-201");
  });
});
