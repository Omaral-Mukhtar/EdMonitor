import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CampusMapClient } from "@/components/campus/CampusMapClient";
import type { UserProfile } from "@/types/domain";

vi.mock("next/navigation", () => ({
  usePathname: () => "/campus",
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/hooks/useCampusPresence", () => ({
  useCampusPresence: vi.fn(() => ({
    totalActive: 7,
    focusedGreenCount: 6,
    roomCounts: {
      "general-quiet-hall": 2,
      "general-deep-focus": 1,
      "math-calculus": 3,
      "math-2-integrals": 1,
      "math-linear-algebra": 0,
    },
    zoneCounts: {
      general: 3,
      math: 4,
    },
    isConnected: true,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => ({
    auth: { signOut: vi.fn() },
  })),
}));

const TEST_PROFILE: UserProfile = {
  id: "user-123",
  displayName: "Youssef",
  avatarColor: "#2563EB",
  isGuest: false,
  currentStreakDays: 4,
  lastStudyDate: "2026-11-26",
  createdAt: "2026-11-25T18:00:00.000Z",
};

describe("CampusMapClient & ProgressSheet UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders 2 wings, 5 room cards with badges/codes/counts, and zero physics/chemistry rooms", () => {
    render(<CampusMapClient profile={TEST_PROFILE} />);

    const quadText = screen.getByTestId("campus-quad-badge").textContent ?? "";
    expect(quadText).toContain("Campus Quad");
    expect(quadText).toContain("2 Active Zones");
    expect(quadText).toContain("5 Rooms");
    expect(quadText).toContain("7 Studying");
    expect(screen.getByTestId("campus-live-summary").textContent).toContain(
      "Live across campus: 7 studying · 6 focused (green)"
    );

    expect(screen.getByText("General Study Wing")).toBeTruthy();
    expect(screen.getByText("Math Wing")).toBeTruthy();

    expect(screen.getByText("G-101")).toBeTruthy();
    expect(screen.getByText("G-102")).toBeTruthy();
    expect(screen.getByText("M-101")).toBeTruthy();
    expect(screen.getByText("M-102")).toBeTruthy();
    expect(screen.getByText("M-103")).toBeTruthy();

    expect(screen.getAllByText("Silent · No A/V").length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.getAllByText("Topic · A/V").length).toBeGreaterThanOrEqual(3);

    expect(screen.getByText("3 tables · 2/12 active")).toBeTruthy();
    expect(screen.getByText("3 tables · 3/12 active")).toBeTruthy();
    expect(screen.getByText("3 tables · 0/12 active")).toBeTruthy();

    expect(screen.queryByText(/Physics/i)).toBeNull();
    expect(screen.queryByText(/Chemistry/i)).toBeNull();
  });

  it("opens ProgressSheet from TopNav and displays metrics as well as empty state", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          currentStreakDays: 4,
          totalFocusedMinutes: 135,
          averageFocusScorePct: 92,
          minutesBySubject: {
            math: 90,
            general: 45,
          },
          distractionBreakdown: {
            cell_phone: 2,
            face_absent: 1,
            look_away: 0,
          },
          recentSessions: [
            {
              id: "sess-1",
              subject: "math",
              roomSlug: "math-2-integrals",
              technique: "pomodoro",
              focusedSeconds: 1800,
              distractionCount: 1,
              focusScorePct: 92,
              startedAt: "2026-11-26T14:00:00.000Z",
              endedAt: "2026-11-26T14:30:00.000Z",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CampusMapClient profile={TEST_PROFILE} />);

    fireEvent.click(screen.getByTestId("open-progress-button"));

    await waitFor(() => {
      expect(screen.getByText("135m")).toBeTruthy();
    });

    expect(screen.getByText("4d")).toBeTruthy();
    expect(screen.getByText("92%")).toBeTruthy();
    expect(screen.getByText("90 min")).toBeTruthy();
    expect(screen.getByText("45 min")).toBeTruthy();
    expect(screen.getByText("Phone detected")).toBeTruthy();
    expect(screen.getByText("Left desk / face absent")).toBeTruthy();
    expect(screen.getByText("Prolonged look-away")).toBeTruthy();
    expect(screen.getByText("30 min")).toBeTruthy();
  });

  it("renders zero-session empty state in ProgressSheet when user has no sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          currentStreakDays: 0,
          totalFocusedMinutes: 0,
          averageFocusScorePct: 0,
          minutesBySubject: {
            math: 0,
            general: 0,
          },
          distractionBreakdown: {
            cell_phone: 0,
            face_absent: 0,
            look_away: 0,
          },
          recentSessions: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<CampusMapClient profile={{ ...TEST_PROFILE, currentStreakDays: 0 }} />);
    fireEvent.click(screen.getByTestId("open-progress-button"));

    await waitFor(() => {
      expect(
        screen.getByText("No study sessions recorded yet.")
      ).toBeTruthy();
    });
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getAllByText("0 min").length).toBeGreaterThanOrEqual(2);
  });
});
