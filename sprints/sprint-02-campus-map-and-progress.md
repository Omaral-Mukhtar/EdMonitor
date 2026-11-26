# Sprint 2 — 2D Campus Map (`/campus`) & Progress Sheet

## 1. Goal & Strict Scope

- **Goal:** Build the 2-Wing 2D Campus Map (`/campus`) showing **General Study (Silent)** and **Math (Topic A/V)** zones, room cards with `Silent · No A/V` vs `Topic · A/V` badges and live `campus:lobby` Presence counts, and the Progress Sheet drawer powered by `GET /api/progress` (aggregating `math` and `general` minutes extensibly).
- **In Scope:**
  - Additive Postgres migration (`supabase/migrations/202611260005_study_sessions_allow_general.sql`) allowing `'general'` in `study_sessions.subject` (`check (subject in ('math', 'general', 'physics', 'chemistry'))`) without modifying Sprint 0 migrations or Sprint 1 `courses`.
  - Static campus room catalog (`src/lib/campus-rooms.ts`) defining the **2 active zones** (`general` and `math`, structured cleanly so future subject wings can be added without refactoring), `allowAudioVideo` flag per room, architectural room code tags (`G-101`, `G-102`, `M-101`, `M-102`, `M-103`), and 5 study rooms (3 tables × 4 seats = 12 capacity per room):
    - **General Study (Silent, `allowAudioVideo: false`, `Silent · No A/V` badge)**: `general-quiet-hall` (`G-101`), `general-deep-focus` (`G-102`).
    - **Math (Topic A/V, `allowAudioVideo: true`, `Topic · A/V` badge)**: `math-calculus` (`M-101`), `math-2-integrals` (`M-102`), `math-linear-algebra` (`M-103`).
    - Zero Physics or Chemistry rooms on `/campus` or in `campus-rooms.ts`.
  - Extensible campus subject typing in `src/types/domain.ts` (keep `Subject = "math" | "physics" | "chemistry"` intact for Sprint 1 `/ta-scheduler`; add `CampusSubject = "general" | "math"` and extensible `Record<string, number>` for `minutesBySubject`).
  - `src/hooks/useCampusPresence.ts` subscribing to `campus:lobby` Presence to display live member counts per room and campus-wide `studying` / `focused (green)` totals in the central **Campus Quad** summary badge.
  - `src/app/campus/page.tsx` and `src/components/campus/*`: Architectural Blueprint Map Hybrid (`24px` CSS dot-grid background + lightweight non-interactive inline `<svg>` walkways from the Campus Quad badge to the 2 Campus Wings), DOM-based room nodes via CSS Grid (`max-w-7xl`, `grid-cols-1 lg:grid-cols-2 gap-6`, zero pan/zoom JS), room code tags, `Silent · No A/V` / `Topic · A/V` badges, Slate/Cobalt wall bars, live table occupancy dots, and `[Enter Room]` link to `/campus/[roomSlug]`.
  - `GET /api/progress` (`src/app/api/progress/route.ts`) aggregating `profiles.current_streak_days`, `totalFocusedMinutes`, `averageFocusScorePct`, `minutesBySubject` (`math` and `general`, extensible for future subjects), `distractionBreakdown` (`cell_phone`/`face_absent`/`look_away`), and `recentSessions`.
  - `ProgressSheet.tsx` slide-over drawer triggered from `[Streak: Xd | Progress]` in `TopNav`.
- **Out of Scope:**
  - 3D R3F room rendering (`/campus/[roomSlug]`), avatars, or study timers (Sprint 3).
  - LiveKit audio/video, `useSharedMedia`, or CV focus guard (Sprint 4).
  - Solo Whiteboard & Math Gemini AI SVG/Plotter overlay (Sprint 5).

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — §1 (2D Campus Map), §3 (Progress Dashboard).
- `docs/design/UI_UX.md` — §3 Screen 1 (2D Campus Map wireframe) & Progress Sheet Drawer spec, §4A (Core Surface & Subject Palette).
- `docs/design/API_CONTRACT.md` — §3 (`GET /api/progress`).
- `docs/design/DB_SCHEMA.md` — §1 (`PROFILES`, `STUDY_SESSIONS`, `DISTRACTION_LOGS`, additive migration), §3 (`campus:lobby` Presence).

---

## 3. Target Files & Modules

- `supabase/migrations/202611260005_study_sessions_allow_general.sql`
- `src/types/domain.ts` (add `CampusSubject`, `RoomModeBadge` / extensible progress types without breaking Sprint 1 `Subject`)
- `src/lib/campus-rooms.ts`
- `src/lib/progress.ts` (pure aggregation helper for `GET /api/progress`)
- `src/app/api/progress/route.ts`
- `src/hooks/useCampusPresence.ts`
- `src/app/campus/page.tsx`
- `src/components/campus/CampusMapClient.tsx`
- `src/components/campus/SubjectZoneCard.tsx`
- `src/components/campus/TopicRoomCard.tsx`
- `src/components/campus/ProgressSheet.tsx`
- `src/components/layout/TopNav.tsx` (wire `[Streak | Progress]` trigger)
- `src/lib/__tests__/progress.test.ts`

---

## 4. Ordered Implementation Checklist

- [x] Add `supabase/migrations/202611260005_study_sessions_allow_general.sql` updating `study_sessions_subject_check` to allow `'general'` alongside `'math'` (and existing `'physics'`, `'chemistry'`), and apply it to Supabase.
- [x] Create `src/lib/campus-rooms.ts` with extensible zone/room definitions for the 2 active zones (`general` Slate `#475569` with `allowAudioVideo: false`; `math` Cobalt `#2563EB` with `allowAudioVideo: true`), room codes (`G-101`, `G-102`, `M-101`, `M-102`, `M-103`), and 5 rooms (`general-quiet-hall`, `general-deep-focus`, `math-calculus`, `math-2-integrals`, `math-linear-algebra`) — zero Physics or Chemistry rooms.
- [x] Implement `src/lib/progress.ts` and `GET /api/progress` (`days` query param default `30`, max `90`, `401` if unauthenticated, `400` if invalid `days`), initializing `minutesBySubject: { math: 0, general: 0 }` and aggregating any subject keys extensibly.
- [x] Build `src/hooks/useCampusPresence.ts` joining `campus:lobby` Realtime Presence and aggregating per-room counts + total `green` focused counts cleanly without memory leaks on unmount.
- [x] Build `SubjectZoneCard.tsx`, `TopicRoomCard.tsx`, and `CampusMapClient.tsx` matching `UI_UX.md` Screen 1: `24px` CSS dot-grid background, lightweight non-interactive inline `<svg>` walkways connecting the central **Campus Quad** summary badge to the 2 Wings, DOM-based CSS Grid room cards (`max-w-7xl`, `grid-cols-1 lg:grid-cols-2 gap-6`, zero pan/zoom JS) with room code tags (`G-101`..`M-103`), `Silent · No A/V` / `Topic · A/V` badges, Slate/Cobalt wall bars, occupancy dots, `0/12 active` states, and `[Enter Room]` links.
- [x] Build `ProgressSheet.tsx` (`Sheet` drawer) rendering daily streak, total focused minutes, average focus score %, **Math** & **General Study** minute breakdown bars (rendered from an extensible subject metadata map), `cell_phone`/`face_absent`/`look_away` distraction counts, recent sessions list, and empty state when `0` sessions exist.
- [x] Connect `TopNav.tsx` `[Streak | Progress]` button to open `ProgressSheet.tsx` on `/campus`.
- [x] Write Vitest tests for `src/lib/progress.ts` aggregation math (`math` + `general` + extensible subject handling), `days` query validation, and `campus-rooms.ts` metadata integrity (confirming `allowAudioVideo` flags and absence of Physics/Chemistry rooms).

---

## 5. Success Criteria (Pass / Fail)

- [x] `/campus` renders inside a single `max-w-7xl` desktop viewport (zero pan/zoom JS) with a `24px` CSS dot-grid background, inline `<svg>` blueprint walkways from the **Campus Quad** summary badge to the **2 DOM Wings** (**General Study (Silent)** and **Math (Topic A/V)**), room code tags (`G-101`..`M-103`), `Silent · No A/V` and `Topic · A/V` badges, Slate/Cobalt wall bars, and `0/12` occupancy dots. Zero Physics/Chemistry rooms appear.
- [x] Two browser tabs subscribed to `campus:lobby` reflect live member count updates within ~1–2 seconds and decrement cleanly when a tab closes.
- [x] `GET /api/progress` returns `401` when unauthenticated and returns exact `minutesBySubject` (`math` and `general`), `distractionBreakdown`, `averageFocusScorePct`, `currentStreakDays`, and `recentSessions` matching `API_CONTRACT.md` §3 when authenticated.
- [x] Opening the Progress Sheet from `TopNav` displays all 4 required metric groups (focused minutes for Math & General Study, focus score %, distraction breakdown, daily streak) and handles the zero-session empty state cleanly.
- [x] All unit tests, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass (with Sprint 1 `/ta-scheduler` tests unaffected).

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` covering:
    - `progress.ts` aggregation (empty sessions -> `math: 0, general: 0` / `0%`, multi-subject minutes rounding, weighted/average focus score %, distraction reason counts, extensible extra subject handling).
    - `GET /api/progress` auth guard (`401`) and `days` clamping/validation (`400` on invalid `days`).
    - `campus-rooms.ts` catalog validation (2 zones, 5 rooms, `allowAudioVideo` false for General & true for Math).
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
- **Browser / runtime checks:**
  - Sign in on `/` with verified email, land on `/campus`, verify 2 zones and 5 room cards render cleanly on desktop and mobile widths.
  - Open Progress Sheet from `[Streak: Xd | Progress]` -> verify empty state or seeded session stats render without console errors.
  - Open `/campus` in 2 tabs and verify `campus:lobby` Presence count updates cleanly.

---

## 7. HARD STOP GATE

**DO NOT begin the next sprint automatically.** Before finishing Sprint 2:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 2's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all files created/modified and report the exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser/runtime verification results.
4. **STOP** and wait for explicit user approval before starting Sprint 3.
