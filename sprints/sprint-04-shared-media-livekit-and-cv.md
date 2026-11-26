# Sprint 4 — Shared Camera, LiveKit Topic Calls & Client-Side CV Focus Guard

## 1. Goal & Strict Scope

- **Goal:** Wire the single shared webcam pipeline (`useSharedMedia` + conditional `baseVideoTrack.clone()`), LiveKit table-scoped voice/video calls and Table Chat **strictly in Topic A/V rooms (`allowAudioVideo === true`)**, server-side `403 FORBIDDEN` enforcement in `POST /api/livekit/token` for General Study silent rooms (`allowAudioVideo === false`), and 100% client-side 3–5 FPS CV focus tracking (`coco-ssd` + MediaPipe Face Landmarker) across **all** rooms (including General Study silent rooms) with the 3-second grace state machine, Web Audio beep, auto-pause, distraction logging, and permission-denied fallback.
- **In Scope:**
  - Self-hosted CV model weights & WASM binaries in `public/models/` (`coco-ssd` + MediaPipe Face Landmarker), served strictly from same origin (zero external CDN model fetches).
  - `src/hooks/useSharedMedia.ts` (single `getUserMedia`, hidden `<video>` for CV, `baseVideoTrack.clone()` **only** when `allowAudioVideo === true` and seated at a table, full base track teardown on room exit, permission-denied non-blocking fallback).
  - `POST /api/livekit/token` (`src/app/api/livekit/token/route.ts` + `src/lib/livekit.ts`) minting table-scoped JWTs (`roomName = "${roomSlug}:${tableId}"`) for `allowAudioVideo === true` rooms, and returning **`403 FORBIDDEN`** whenever `room.allowAudioVideo === false` (`404 NOT_FOUND` if unknown `roomSlug`).
  - `src/components/table/LiveKitTableCall.tsx`, `TableChatSheet.tsx`, & `src/hooks/useTableBroadcast.ts`:
    - When `allowAudioVideo === true` (Math Topic rooms): render Mic/Cam/Chat dock buttons, compact peer video strip, and plain-text `chat:message` Broadcast on `table:{roomSlug}:{tableId}` + `timer:sync`.
    - When `allowAudioVideo === false` (General Study Silent rooms): **hide** LiveKit A/V UI, Mic/Cam buttons, and Table Chat drawer completely, never clone `baseVideoTrack`, and only subscribe to `timer:sync` when `"Sync timer with table"` is used (zero `chat:message` subscription).
  - `src/lib/focus-grace.ts` (pure 3-second continuous grace state machine + `yellow` break exemption) and `src/lib/web-audio-alert.ts` (`440 Hz -> 330 Hz`, `180 ms` beep).
  - `src/hooks/useFocusGuard.ts` (3–5 FPS `setTimeout`/`setInterval` inference loop, never `rAF`) running normally in both Math Topic and General Study Silent rooms.
  - `POST /api/sessions/[sessionId]/distractions` (`src/app/api/sessions/[sessionId]/distractions/route.ts`).
  - Top-center Distraction Alert Banner + top-left CV sensor status pill (`Loading focus models locally...`, `● CV Guard: Focused`, `Camera off · Manual timer mode`).
- **Out of Scope:**
  - Solo HTML5 `<canvas>` whiteboard, R3F `frameloop="never"` whiteboard pause, or Math Gemini AI SVG / Plotter overlay (Sprint 5).

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — §2 (Voice & Video Calls, Table Chat), §3 (Webcam distraction detection), §7 (Client Hardware, HTTPS, Shared Camera Stream, Offline/Wi-Fi Reliability).
- `docs/design/ARCHITECTURE.md` — §1 (Trust Boundaries, Two-Wing Room Policy), §2 (Shared Media & Client-Side CV Sequence).
- `docs/design/ARCHITECTURE_DECISIONS.md` — §1.1, §1.2, §2.1, §2.2, §2.3.
- `docs/design/API_CONTRACT.md` — §3 (`POST /api/sessions/[sessionId]/distractions`), §4 (`POST /api/livekit/token` `403 FORBIDDEN` rule).
- `docs/design/DB_SCHEMA.md` — §1 (`DISTRACTION_LOGS`), §3B (`chat:message`, `timer:sync`).
- `docs/design/UI_UX.md` — §3 Screen 2 (Top-left CV pill, Top-center Distraction Alert Banner, Right Slide-Over Chat/Video Sheet, Bottom Dock), §4C (`paused_distraction`), §4D (CV Models loading & Webcam Permission fallback).

---

## 3. Target Files & Modules

- `public/models/coco-ssd/*` & `public/models/mediapipe/*` (self-hosted weights & WASM)
- `src/app/api/livekit/token/route.ts`
- `src/app/api/sessions/[sessionId]/distractions/route.ts`
- `src/lib/livekit.ts`
- `src/lib/focus-grace.ts`
- `src/lib/web-audio-alert.ts`
- `src/hooks/useSharedMedia.ts`
- `src/hooks/useFocusGuard.ts`
- `src/hooks/useTableBroadcast.ts` (`timer:sync` + topic-room `chat:message` only; no whiteboard events)
- `src/components/table/LiveKitTableCall.tsx`
- `src/components/table/TableChatSheet.tsx`
- `src/components/room3d/FocusStatusPill.tsx`
- `src/components/room3d/DistractionAlertBanner.tsx`
- `src/lib/__tests__/focus-grace.test.ts`
- `src/app/api/livekit/__tests__/livekit-token.test.ts`

---

## 4. Ordered Implementation Checklist

- [ ] Download and vendor `@tensorflow-models/coco-ssd` weights and `@mediapipe/tasks-vision` WASM + `face_landmarker.task` into `public/models/` (verify zero external CDN requests during CV init).
- [ ] Implement `src/lib/livekit.ts` and `POST /api/livekit/token` (`livekit-server-sdk`, server-only `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`, `roomName = "${roomSlug}:${tableId}"`, `401` if unauthenticated, `404` if unknown `roomSlug`, and **`403 FORBIDDEN`** if `room.allowAudioVideo === false`).
- [ ] Implement `POST /api/sessions/[sessionId]/distractions` (`401`/`403`/`404` checks, inserts into `distraction_logs`, validates `reason` and `durationMs >= 0`).
- [ ] Implement `src/lib/focus-grace.ts` (3000 ms continuous distraction threshold, immediate recovery on `FOCUSED`, break-phase exemption when `timerPhase === "break"`) and `src/lib/web-audio-alert.ts`.
- [ ] Implement `src/hooks/useSharedMedia.ts` acquiring a single base `MediaStream` on room entry, cloning `baseVideoTrack.clone()` for LiveKit **only** when `allowAudioVideo === true` and seated, never calling `clone()` in General Study silent rooms (`allowAudioVideo === false`), stopping only the clone on `Stand Up`, and stopping all base tracks on room exit.
- [ ] Implement `src/hooks/useFocusGuard.ts` loading models from `/models/*` (`Loading focus models locally...`), sampling the hidden `<video>` at 3–5 FPS (`250 ms` interval), and driving `focus-grace.ts` -> beep + auto-pause timer (`paused_distraction`) + `POST .../distractions` + `halo = "red"` Presence update in both Math and General Study rooms.
- [ ] Build `src/hooks/useTableBroadcast.ts` (`timer:sync` + topic-room `chat:message` only), `LiveKitTableCall.tsx`, and `TableChatSheet.tsx` (`w-80` slide-over drawer with compact video tiles, plain-text `chat:message` capped at `1000` chars, unread counter on bottom dock), conditionally rendered **only** when `room.allowAudioVideo === true`.
- [ ] Wire `FocusStatusPill.tsx`, `DistractionAlertBanner.tsx`, and permission-denied fallback (`Camera off · Manual timer mode` + `[Enable Camera]` retry) into `/campus/[roomSlug]`.
- [ ] Write Vitest unit tests for `focus-grace.ts` (`< 3000 ms` transient glance ignored, `>= 3000 ms` triggers once, `break` exemption suppresses alert), `/api/livekit/token` (including **`403 FORBIDDEN`** on `general-quiet-hall` and `200 OK` on `math-calculus`), and `/api/sessions/[sessionId]/distractions`.

---

## 5. Success Criteria (Pass / Fail)

- [ ] Browser Network tab confirms zero model/WASM requests to external CDNs (`storage.googleapis.com`, `cdn.jsdelivr.net`, `tfhub.dev`) and zero webcam frames sent to Next.js/Gemini servers.
- [ ] In **Math Topic rooms (`allowAudioVideo === true`)**: sitting at a table connects LiveKit using `baseVideoTrack.clone()`; clicking `Stand Up` disconnects LiveKit and stops the cloned track while the CV focus loop continues running uninterrupted.
- [ ] In **General Study Silent rooms (`allowAudioVideo === false`)**: LiveKit and Table Chat UI/buttons are completely hidden, `baseVideoTrack.clone()` is never called, `POST /api/livekit/token` returns `403 FORBIDDEN`, and local webcam CV Focus Guard still runs normally.
- [ ] Clicking `Leave Room` stops the base `MediaStream` tracks so the OS webcam indicator turns off completely.
- [ ] Brief look-aways (`< 3s`) do not trigger alerts; holding a `cell phone` or looking away for `>= 3s` during a focus block plays the Web Audio beep, pauses the timer, sets `halo = "red"`, shows the top-center banner, and persists a `distraction_logs` row.
- [ ] During a scheduled `break` (`halo = "yellow"`), holding a phone or leaving the desk does not trigger distraction alerts or log distractions.
- [ ] Denying webcam permission leaves the 3D room, Topic A/V audio/chat, and manual study timers 100% functional with the `Camera off · Manual timer mode` pill.
- [ ] Table chat renders all `chat:message` payloads as plain text (HTML/script strings escaped) and scopes messages strictly to `table:{roomSlug}:{tableId}` in Topic A/V rooms.

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` covering:
    - `focus-grace.ts` state transitions (`< 3000 ms` transient glance, `>= 3000 ms` trigger, no duplicate triggers while distracted, reset on `FOCUSED`, break-mode suppression).
    - `POST /api/livekit/token` (`401`, `400`, `404`, **`403 FORBIDDEN` when `allowAudioVideo === false`**, valid JWT claims for `math-calculus:table-1`).
    - `POST /api/sessions/[sessionId]/distractions` (`401`, `403`, `400`, `201`).
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
- **Browser / runtime checks:**
  - In `/campus/math-calculus`: allow webcam -> verify `● CV Guard: Focused` pill appears -> hold phone for 4s -> verify beep, timer pause, red halo, banner, and Progress Sheet distraction increment; sit at `table-1` across 2 tabs -> verify LiveKit audio/video and `Table Chat` work -> click `Stand Up` -> verify LiveKit disconnects while CV pill stays active -> click `Leave Room` -> verify webcam LED turns off.
  - In `/campus/general-quiet-hall`: sit at `table-1` -> verify Mic/Cam/Chat UI are hidden, zero LiveKit token calls are made, CV Focus Guard still triggers on phone/look-away, and `POST /api/livekit/token` returns `403 FORBIDDEN`.
  - Block webcam permission in browser -> reload room -> verify non-blocking `Camera off · Manual timer mode` fallback works cleanly.

---

## 7. HARD STOP GATE

**DO NOT begin the next sprint automatically.** Before finishing Sprint 4:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 4's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all files created/modified and report the exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser/runtime verification results.
4. **STOP** and wait for explicit user approval before starting Sprint 5.
