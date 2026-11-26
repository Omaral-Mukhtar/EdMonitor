import type {
  CampusSubject,
  CampusZoneAccent,
  RoomModeBadge,
} from "@/types/domain";

export interface CampusZoneConfig {
  id: CampusSubject;
  codePrefix: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  accent: CampusZoneAccent;
  accentHex: string;
  barClass: string;
  badgeClass: string;
  dotActiveClass: string;
  allowAudioVideo: boolean;
  modeBadge: RoomModeBadge;
}

export interface CampusRoomConfig {
  slug: string;
  code: string;
  name: string;
  description: string;
  subject: CampusSubject;
  allowAudioVideo: boolean;
  modeBadge: RoomModeBadge;
  tableCount: number;
  seatsPerTable: number;
  capacity: number;
}

export interface SubjectProgressMeta {
  key: string;
  label: string;
  accentHex: string;
  barClass: string;
  badgeClass: string;
}

export const CAMPUS_ZONES: readonly CampusZoneConfig[] = [
  {
    id: "general",
    codePrefix: "G",
    title: "General Study Wing",
    shortTitle: "General Study (Silent)",
    subtitle: "Silent Focus",
    description:
      "Quiet drafting tables with webcam focus guard, timers, and solo whiteboard.",
    accent: "slate",
    accentHex: "#475569",
    barClass: "bg-slate-600",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
    dotActiveClass: "bg-slate-600",
    allowAudioVideo: false,
    modeBadge: "Silent · No A/V",
  },
  {
    id: "math",
    codePrefix: "M",
    title: "Math Wing",
    shortTitle: "Math (Topic A/V)",
    subtitle: "Topic Collaboration",
    description:
      "Table-scoped LiveKit voice & video, table chat, timers, and Math AI whiteboard.",
    accent: "cobalt",
    accentHex: "#2563EB",
    barClass: "bg-blue-600",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
    dotActiveClass: "bg-blue-600",
    allowAudioVideo: true,
    modeBadge: "Topic · A/V",
  },
] as const;

export const CAMPUS_ROOMS: readonly CampusRoomConfig[] = [
  {
    slug: "general-quiet-hall",
    code: "G-101",
    name: "Quiet Study Hall",
    description: "Silent individual focus across three shared drafting tables.",
    subject: "general",
    allowAudioVideo: false,
    modeBadge: "Silent · No A/V",
    tableCount: 3,
    seatsPerTable: 4,
    capacity: 12,
  },
  {
    slug: "general-deep-focus",
    code: "G-102",
    name: "Deep Focus Hall",
    description: "Long uninterrupted blocks with private CV focus protection.",
    subject: "general",
    allowAudioVideo: false,
    modeBadge: "Silent · No A/V",
    tableCount: 3,
    seatsPerTable: 4,
    capacity: 12,
  },
  {
    slug: "math-calculus",
    code: "M-101",
    name: "Calculus I",
    description: "Limits, derivatives, optimization, and collaborative problem sets.",
    subject: "math",
    allowAudioVideo: true,
    modeBadge: "Topic · A/V",
    tableCount: 3,
    seatsPerTable: 4,
    capacity: 12,
  },
  {
    slug: "math-2-integrals",
    code: "M-102",
    name: "Math 2 · Integrals & Areas",
    description: "Definite integrals, area between curves, and dx/dy slice plots.",
    subject: "math",
    allowAudioVideo: true,
    modeBadge: "Topic · A/V",
    tableCount: 3,
    seatsPerTable: 4,
    capacity: 12,
  },
  {
    slug: "math-linear-algebra",
    code: "M-103",
    name: "Linear Algebra",
    description: "Vector spaces, matrices, eigenvalues, and linear maps.",
    subject: "math",
    allowAudioVideo: true,
    modeBadge: "Topic · A/V",
    tableCount: 3,
    seatsPerTable: 4,
    capacity: 12,
  },
] as const;

export const SUBJECT_PROGRESS_META: Record<string, SubjectProgressMeta> = {
  math: {
    key: "math",
    label: "Math",
    accentHex: "#2563EB",
    barClass: "bg-blue-600",
    badgeClass: "border-blue-200 bg-blue-50 text-blue-700",
  },
  general: {
    key: "general",
    label: "General Study",
    accentHex: "#475569",
    barClass: "bg-slate-600",
    badgeClass: "border-slate-200 bg-slate-100 text-slate-700",
  },
  physics: {
    key: "physics",
    label: "Physics",
    accentHex: "#0D9488",
    barClass: "bg-teal-600",
    badgeClass: "border-teal-200 bg-teal-50 text-teal-700",
  },
  chemistry: {
    key: "chemistry",
    label: "Chemistry",
    accentHex: "#7C3AED",
    barClass: "bg-violet-600",
    badgeClass: "border-violet-200 bg-violet-50 text-violet-700",
  },
};

export function getCampusZoneById(
  zoneId: CampusSubject
): CampusZoneConfig | undefined {
  return CAMPUS_ZONES.find((zone) => zone.id === zoneId);
}

export function getCampusRoomsByZone(
  zoneId: CampusSubject
): CampusRoomConfig[] {
  return CAMPUS_ROOMS.filter((room) => room.subject === zoneId);
}

export function getCampusRoomBySlug(slug: string): CampusRoomConfig | undefined {
  return CAMPUS_ROOMS.find((room) => room.slug === slug);
}

export function getSubjectProgressMeta(subject: string): SubjectProgressMeta {
  const normalized = subject.trim().toLowerCase();
  const known = SUBJECT_PROGRESS_META[normalized];
  if (known) {
    return known;
  }

  const label = normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Other";

  return {
    key: normalized || "other",
    label,
    accentHex: "#0284C7",
    barClass: "bg-sky-600",
    badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
  };
}
