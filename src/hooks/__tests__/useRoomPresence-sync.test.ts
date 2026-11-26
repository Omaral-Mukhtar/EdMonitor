import { describe, expect, it } from "vitest";
import {
  buildRoomPresenceKey,
  parseRemoteRoomPresenceMembers,
} from "@/hooks/useRoomPresence";
import type { RoomPresenceState } from "@/types/domain";

describe("useRoomPresence multi-account sync & key safety", () => {
  it("builds Supabase Realtime presence keys without colons", () => {
    const key = buildRoomPresenceKey(
      "a43f5d61-1974-432c-b562-4a59ef3466ee",
      "client-123"
    );
    expect(key).not.toContain(":");
    expect(key).toBe("a43f5d61-1974-432c-b562-4a59ef3466ee_client-123");
  });

  it("parses two distinct userIds in room:math-calculus into remoteMembers + count = 2 and table 2/4", () => {
    const selfState: RoomPresenceState = {
      clientId: "cid-self",
      userId: "user-1",
      displayName: "QA TA",
      isGuest: false,
      avatarColor: "#2563EB",
      tableId: "table-1",
      seatIndex: 0,
      position: [-3.2, 0, -2.5],
      rotationY: 0,
      technique: "pomodoro",
      timerPhase: "focus",
      syncedWithTable: false,
      halo: "green",
      updatedAt: "2026-11-27T00:00:00.000Z",
    };

    const presenceState = {
      user_1_cid_self: [
        {
          clientId: "cid-self",
          userId: "user-1",
          displayName: "QA TA",
          tableId: "table-1",
          seatIndex: 0,
        },
      ],
      user_2_cid_peer: [
        {
          clientId: "cid-peer",
          userId: "user-2",
          displayName: "Sara (QA 2)",
          avatarColor: "#0D9488",
          tableId: "table-1",
          seatIndex: 1,
          // Deliberately omit optional fields to verify safe defaults
        },
      ],
    };

    const remoteMembers = parseRemoteRoomPresenceMembers(
      presenceState,
      "cid-self",
      "user-1"
    );
    expect(remoteMembers).toHaveLength(1);
    expect(remoteMembers[0].userId).toBe("user-2");
    expect(remoteMembers[0].displayName).toBe("Sara (QA 2)");
    expect(remoteMembers[0].halo).toBe("green");
    expect(remoteMembers[0].position).toEqual([0, 0, 4.6]);

    const allMembers = [selfState, ...remoteMembers];
    expect(allMembers).toHaveLength(2);
    const table1Seated = allMembers.filter(
      (member) => member.tableId === "table-1"
    ).length;
    expect(table1Seated).toBe(2);
  });
});
