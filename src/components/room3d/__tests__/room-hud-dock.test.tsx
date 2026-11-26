import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RoomHudDock } from "@/components/room3d/RoomHudDock";
import { TableChatSheet } from "@/components/table/TableChatSheet";
import { getCampusRoomBySlug } from "@/lib/campus-rooms";

describe("RoomHudDock & TableChatSheet policy + XSS safety", () => {
  it("hides Mic/Cam/Chat buttons in General Study silent rooms and shows them in Math Topic rooms", () => {
    const silentRoom = getCampusRoomBySlug("general-quiet-hall")!;
    const topicRoom = getCampusRoomBySlug("math-calculus")!;

    const { rerender } = render(
      <RoomHudDock
        room={silentRoom}
        tableId="table-1"
        isLeaving={false}
        isMicOn={false}
        isCamOn={false}
        isCameraAvailable={true}
        isChatOpen={false}
        unreadChatCount={0}
        onToggleMic={vi.fn()}
        onToggleCam={vi.fn()}
        onToggleChat={vi.fn()}
        onStandUp={vi.fn()}
        onLeaveRoom={vi.fn()}
      />
    );

    expect(screen.queryByTestId("dock-mic-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dock-cam-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dock-chat-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("dock-silent-badge")).toHaveTextContent(
      "Silent · No A/V"
    );

    rerender(
      <RoomHudDock
        room={topicRoom}
        tableId="table-1"
        isLeaving={false}
        isMicOn={false}
        isCamOn={false}
        isCameraAvailable={true}
        isChatOpen={false}
        unreadChatCount={3}
        onToggleMic={vi.fn()}
        onToggleCam={vi.fn()}
        onToggleChat={vi.fn()}
        onStandUp={vi.fn()}
        onLeaveRoom={vi.fn()}
      />
    );

    expect(screen.getByTestId("dock-mic-button")).toBeInTheDocument();
    expect(screen.getByTestId("dock-cam-button")).toBeInTheDocument();
    expect(screen.getByTestId("dock-chat-button")).toBeInTheDocument();
    expect(screen.getByTestId("dock-chat-unread-badge")).toHaveTextContent(
      "3"
    );
  });

  it("renders table chat messages strictly as escaped plain text (no HTML injection)", () => {
    const xssPayload = '<img src=x onerror="alert(1)"><script>evil()</script>';
    const { container } = render(
      <TableChatSheet
        open={true}
        tableId="table-1"
        currentUserId="user-1"
        messages={[
          {
            id: "msg-1",
            authorId: "user-2",
            displayName: "Sara",
            avatarColor: "#2563EB",
            text: xssPayload,
            sentAt: "2026-11-26T20:00:00.000Z",
          },
        ]}
        callStatus="connected"
        callNote={null}
        onSendMessage={vi.fn(() => true)}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByTestId("table-chat-message-item")).toHaveTextContent(
      xssPayload
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });
});
