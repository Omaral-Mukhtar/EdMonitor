export type Subject = "math" | "physics" | "chemistry";

export type CampusSubject = "general" | "math";

export type RoomModeBadge = "Silent · No A/V" | "Topic · A/V";

export type CampusZoneAccent = "slate" | "cobalt";

export type StudyTechnique = "pomodoro" | "deep_work" | "feynman" | "flowtime";

export type FocusHalo = "green" | "red" | "yellow";

export type DistractionReason = "cell_phone" | "face_absent" | "look_away";

export type TimerPhase = "focus" | "break" | "paused" | "idle";

export type StudyTimerVisualState =
  | "idle"
  | "focus"
  | "paused_distraction"
  | "paused_manual"
  | "break";

export interface TimerSyncPayload {
  hostId: string;
  technique: StudyTechnique;
  phase: "focus" | "break" | "paused";
  phaseEndsAt: string | null;
  remainingMs: number;
}

export interface TableChatMessage {
  id: string;
  authorId: string;
  displayName: string;
  avatarColor: string;
  text: string;
  sentAt: string;
}

export interface DistractionLogRecord {
  id: string;
  sessionId: string;
  reason: DistractionReason;
  durationMs: number;
  triggeredAt: string;
}

export interface StudySessionRecord {
  id: string;
  userId: string;
  subject: string;
  roomSlug: string;
  tableId: string | null;
  technique: StudyTechnique;
  syncedWithTable: boolean;
  focusedSeconds: number;
  distractionCount: number;
  focusScorePct: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface StudySessionCreateResponse {
  session: StudySessionRecord;
}

export interface StudySessionPatchResponse {
  session: {
    id: string;
    focusedSeconds: number;
    distractionCount: number;
    focusScorePct: number | null;
    endedAt: string | null;
  };
  streak: {
    currentStreakDays: number;
    lastStudyDate: string | null;
  };
}

export interface UserProfile {
  id: string;
  displayName: string;
  avatarColor: string;
  isGuest: boolean;
  currentStreakDays: number;
  lastStudyDate: string | null;
  createdAt: string;
}

export interface RoomPresenceState {
  clientId?: string;
  userId: string;
  displayName: string;
  isGuest: boolean;
  avatarColor: string;
  tableId: string | null;
  seatIndex: number | null;
  position: [number, number, number];
  rotationY: number;
  technique: StudyTechnique;
  timerPhase: TimerPhase;
  syncedWithTable: boolean;
  halo: FocusHalo;
  updatedAt: string;
}

export interface CampusLobbyPresenceState {
  userId: string;
  roomSlug: string | null;
  halo: FocusHalo;
  updatedAt: string;
}

export interface ProgressRecentSession {
  id: string;
  subject: string;
  roomSlug: string;
  technique: StudyTechnique;
  focusedSeconds: number;
  distractionCount: number;
  focusScorePct: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface ProgressDistractionBreakdown {
  cell_phone: number;
  face_absent: number;
  look_away: number;
}

export interface ProgressResponse {
  currentStreakDays: number;
  totalFocusedMinutes: number;
  averageFocusScorePct: number;
  minutesBySubject: Record<string, number>;
  distractionBreakdown: ProgressDistractionBreakdown;
  recentSessions: ProgressRecentSession[];
}

export const AVATAR_COLOR_PRESETS = [
  "#2563EB", // Cobalt
  "#0D9488", // Teal
  "#7C3AED", // Iris
  "#0284C7", // Sky Slate
  "#475569", // Architectural Slate
] as const;
