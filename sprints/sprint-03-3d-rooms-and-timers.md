# Sprint 3 — Procedural 3D Study Rooms (`/campus/[roomSlug]`) & Study Timers

## 1. Goal & Strict Scope

- **Goal:** Build the procedural React Three Fiber 3D Study Rooms (`/campus/[roomSlug]`), bobbing geometric avatars with color selection, click-to-walk/sit table mechanics, `room:{roomSlug}` Presence with 3-state floor halos (`green`/`red`/`yellow`), Study Timers (with optional `timer:sync`), and session persistence APIs.
- **In Scope:**
  - `/campus/[roomSlug]` (`src/app/campus/[roomSlug]/page.tsx`) with procedural low-poly R3F open-cutaway study room (two low walls + matte light-slate floor with subtle grid lines), 3 rounded-edge wooden/drafting study tables (4 minimalist chairs per table), zone-appropriate procedural props (**Math**: geometric prism & coordinate frame; **General Study**: minimalist architectural desk lamp & bookstand — zero Physics or Chemistry props), elevated 3/4 isometric diorama camera (`fov: 38–42°`, constrained `OrbitControls`), warm hemisphere + directional light + `<ContactShadows>`, and zero `.glb`/`.gltf` files.
  - Procedural stylized pawn/meeple avatars (`CapsuleGeometry` torso tinted with `avatarColor`, matte `SphereGeometry` head with dark visor/eye dots, floating pill hands), avatar color picker, sine-wave bobbing walk animation, lowered-Y + forward-lean seated pose, floating `<Html distanceFactor={10}>` single-line HUD pill (`[● HaloDot] Name · Technique`), and procedural floor halo torus/ring (`green`/`red`/`yellow` exact hex & emissive values).
  - `src/hooks/useRoomPresence.ts` managing `room:{roomSlug}` Presence (`<= 4 Hz` throttled moves + discrete sit/stand/technique/halo transitions) and updating `campus:lobby` with the active `roomSlug` and `halo` so `/campus` shows real room counts.
  - `src/lib/study-timer.ts` & `src/components/table/StudyTimer.tsx`: `Pomodoro (25/5)`, `Deep Work (50/10)`, `Feynman`, `Flowtime`, visual states (`idle`, `focus`, `paused_distraction`, `paused_manual`, `break`), `JetBrains Mono` `tabular-nums`, and `"Sync timer with table"` toggle (`timer:sync` Broadcast on `table:{roomSlug}:{tableId}`).
  - `POST /api/sessions` and `PATCH /api/sessions/[sessionId]` validating `roomSlug` + `subject` (`"math" | "general"`, extensible) via `campus-rooms.ts`, calculating `focus_score_pct`, and updating `profiles.current_streak_days` / `last_study_date`.
  - Bottom-center HUD dock (`Stand Up`, `Leave Room`, room mode indicator `Topic · A/V` vs `Silent · No A/V`, plus first-visitor empty room toast and proper Three.js geometry/material disposal on exit).
- **Out of Scope:**
  - `useSharedMedia` webcam capture, LiveKit audio/video calls, Table Chat drawer, or client-side CV focus detection (Sprint 4).
  - Solo Whiteboard or Math Gemini AI SVG/Plotter overlay (Sprint 5).

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — §1 (3D Avatar Virtual Rooms, 3D Avatars & Presence, Table Entry), §2 (Study Techniques), §7 (WebGL GPU Budget).
- `docs/design/ARCHITECTURE.md` — §1 (Room-scoped vs Table-scoped channels, Two-Wing Room Policy), §3 (WebGL GPU Budget State Machine).
- `docs/design/DB_SCHEMA.md` — §1 (`STUDY_SESSIONS`), §3A (`RoomPresenceState`, `FocusHalo`, `StudyTechnique`), §3B (`timer:sync`).
- `docs/design/API_CONTRACT.md` — §3 (`POST /api/sessions`, `PATCH /api/sessions/[sessionId]`).
- `docs/design/UI_UX.md` — §3 Screen 2 (3D Study Room + Table HUD wireframe), §4B (Focus Halo States), §4C (Study Timer Visual States), §4D (3D Study Room empty toast).

---

## 3. Target Files & Modules

- `src/app/campus/[roomSlug]/page.tsx`
- `src/app/api/sessions/route.ts`
- `src/app/api/sessions/[sessionId]/route.ts`
- `src/lib/study-timer.ts` (pure timer state machine + `focus_score_pct` + streak calculation helpers)
- `src/hooks/useRoomPresence.ts`
- `src/components/room3d/StudyRoomScene.tsx`
- `src/components/room3d/ProceduralRoomMesh.tsx`
- `src/components/room3d/ProceduralAvatar.tsx`
- `src/components/room3d/StudyTableCluster.tsx`
- `src/components/table/StudyTimer.tsx`
- `src/components/room3d/RoomHudDock.tsx`
- `src/lib/__tests__/study-timer.test.ts`
- `src/app/api/sessions/__tests__/sessions-route.test.ts`

---

## 4. Ordered Implementation Checklist

- [x] Implement `src/lib/study-timer.ts` pure helpers: technique definitions (`pomodoro` 25/5, `deep_work` 50/10, `feynman` count-up, `flowtime` count-up), `focus_score_pct` formula, and UTC daily streak increment/reset logic.
- [x] Implement `POST /api/sessions` and `PATCH /api/sessions/[sessionId]` (`401` unauthenticated, `403` non-owner, `404` missing session/room, `400` invalid `subject` — accepting `"math" | "general"` via `campus-rooms.ts`, `endSession: true` computing `focusScorePct` and updating `profiles.current_streak_days` & `last_study_date`).
- [x] Implement `src/hooks/useRoomPresence.ts` for `room:{roomSlug}` Presence (`RoomPresenceState`, `<= 4 Hz` throttled move updates, discrete state updates) and synced `campus:lobby` room occupancy reporting.
- [x] Build `ProceduralRoomMesh.tsx` & `StudyTableCluster.tsx`: open-cutaway architectural room (two low walls + matte light-slate floor with subtle grid lines), 3 rounded-edge wooden/drafting study tables with 4 minimalist chairs each, seat occupancy indicators, and zone props (**Math**: geometric prism & coordinate frame; **General Study**: minimalist desk lamp & bookstand — zero Physics/Chemistry props, zero `.glb`/`.gltf` files).
- [x] Build `ProceduralAvatar.tsx`: stylized pawn/meeple (`CapsuleGeometry` torso tinted with `avatarColor`, matte `SphereGeometry` head with dark visor/eye dots for facing direction, small floating pill hands), sine-wave vertical bob when walking, lowered Y-position + slight forward lean when seated, `<Html distanceFactor={10}>` status pill, and 3-state floor halo torus mesh (`green`/`red`/`yellow`).
- [x] Build `StudyRoomScene.tsx` wrapping R3F `<Canvas camera={{ fov: 40 }} frameloop={isTabHidden ? "never" : "always"}>` with elevated 3/4 isometric-style diorama camera, constrained `OrbitControls` (preventing floor/wall clipping), warm hemisphere + directional key light + `<ContactShadows>`, `visibilitychange` listener, and cleanup/disposal on room exit.
- [x] Build `StudyTimer.tsx` (`top-4 right-4 w-72`) with technique selector, Start/Pause/Reset/Break controls, `JetBrains Mono` `tabular-nums`, and `"Sync timer with table"` (`timer:sync` Broadcast on `table:{roomSlug}:{tableId}` when seated).
- [x] Build `RoomHudDock.tsx` (`bottom-5`, `Stand Up` / `Leave Room`) and top-left Room + Mode badge (`Topic · A/V` vs `Silent · No A/V`) + Table badge + first-visitor empty-room toast.
- [x] Write Vitest unit tests for timer transitions, `focus_score_pct` + streak math, and `/api/sessions` auth/ownership/subject validation (`math` & `general`).

---

## 5. Success Criteria (Pass / Fail)

- [x] Entering `/campus/math-calculus` or `/campus/general-quiet-hall` mounts the open-cutaway procedural 3D diorama room (`fov: 38–42°`, constrained `OrbitControls`, `<ContactShadows>`, 3 drafting tables × 4 seats, zone-specific procedural prop) with zero `.glb`/`.gltf` network requests.
- [x] Clicking the floor walks the pawn/meeple avatar with sine-wave bobbing motion and clear visor-facing direction; clicking an open table seat seats the avatar (lowered Y + slight forward lean) and updates `tableId` + `seatIndex` in `room:{roomSlug}` Presence across two browser tabs.
- [x] Switching techniques (`Pomodoro`, `Deep Work`, `Feynman`, `Flowtime`) or entering a break (`yellow` halo) updates both the avatar's floating HUD pill and floor halo mesh immediately.
- [x] Enabling `"Sync timer with table"` broadcasts `timer:sync` to seated tablemates who also have sync enabled, while leaving unsynced peers unaffected.
- [x] Completing or leaving a study block in both `math` and `general` rooms calls `PATCH /api/sessions/[sessionId]` (`endSession: true`), persists `focusedSeconds` and `focusScorePct`, updates `currentStreakDays`, and shows up in Sprint 2's Progress Sheet under `Math` / `General Study`.
- [x] Leaving `/campus/[roomSlug]` back to `/campus` unmounts `<Canvas>`, removes Presence, and leaves `/campus` counts accurate.

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` covering:
    - Timer state transitions (`idle` -> `focus` -> `break`, count-down vs count-up modes, manual pause `yellow` halo).
    - `focus_score_pct` clamping (`0..100`) and streak increment/same-day idempotency/reset logic.
    - `/api/sessions` & `/api/sessions/[sessionId]` ownership (`403`), validation (`400`), and `math` / `general` persistence.
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
- **Browser / runtime checks:**
  - Open `/campus/math-calculus` in 2 browser tabs: verify first-visitor toast on tab 1, walk & sit at `table-1` in tab 1 and `table-1` seat 2 in tab 2, verify both avatars and halo colors sync across tabs.
  - Open `/campus/general-quiet-hall` and verify General Study procedural props and `Silent · No A/V` badge render cleanly.
  - Test `"Sync timer with table"` on both tabs and verify independent timer on tab 2 when toggle is OFF.
  - Complete a short focus block, return to `/campus`, open Progress Sheet, and confirm the new session & minutes appear.

---

## 7. HARD STOP GATE

**DO NOT begin the next sprint automatically.** Before finishing Sprint 3:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 3's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all files created/modified and report the exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser/runtime verification results.
4. **STOP** and wait for explicit user approval before starting Sprint 4.
