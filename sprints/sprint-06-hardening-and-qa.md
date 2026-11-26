# Sprint 6 — Hardening, Integration QA & Production Readiness

## 1. Goal & Strict Scope

- **Goal:** Perform full-stack end-to-end QA, security/RLS/XSS/expression-allowlist auditing, WebGL & camera resource-cleanup verification, bundle isolation checks, and final build readiness across all EdMonitor modules before launch.
- **In Scope:**
  - End-to-end verification of every requirement in `docs/REQUIREMENTS.md` and every contract in `docs/design/*.md`.
  - Security & privacy audit: Supabase RLS boundary verification, server-only secret inspection (`GEMINI_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` never in client bundles), `POST /api/livekit/token` `403 FORBIDDEN` enforcement on `allowAudioVideo === false` rooms, double `isomorphic-dompurify` SVG XSS checks, chat plain-text HTML-injection tests, allowlisted `mathjs` expression-sandbox tests, and API rate-limit/payload-cap checks.
  - Resource & performance audit: `/ta-scheduler` bundle check (zero Three.js/CV/LiveKit code), R3F `frameloop="never"` draw-call pause check, webcam `track.clone()` isolation (cloned only in `allowAudioVideo === true` rooms) + room-exit LED teardown check, and self-hosted `/models/*` offline/no-CDN check.
  - Bug fixes strictly scoped to regressions or gaps uncovered during QA.
  - Final documentation/sprint status updates.
- **Out of Scope:**
  - Adding net-new features or redesigning agreed contracts outside fixing verified QA defects.

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — Full checklist (§1–§7).
- `docs/design/ARCHITECTURE.md` — Critical Boundary Invariants (§1–§4).
- `docs/design/DB_SCHEMA.md` — RLS & 3-way constraint rules (§1–§2) & Realtime Broadcast rules (§3).
- `docs/design/API_CONTRACT.md` — All endpoint status codes & error shapes (§1–§6).
- `docs/design/AI_PROMPTS.md` — Math-only syllabus guardrails, `mathjs` allowlist, and double SVG sanitization.
- `docs/design/UI_UX.md` — All wireframes, color tokens, and fallback states (§3–§4).

---

## 3. Target Files & Modules

- All `src/**`, `supabase/migrations/**`, `public/models/**`, and `sprints/README.md` (audit + targeted bug fixes only where QA reveals an issue).
- `src/__tests__/integration-contracts.test.ts` (cross-module contract & security regression tests if any gaps remain).

---

## 4. Ordered Implementation Checklist

- [ ] Run full Vitest test suite (`npm test`) and verify 100% pass rate with zero skipped assertions.
- [ ] Run `npx tsc --noEmit && npm run lint && npm run build` and inspect Next.js build output:
  - Confirm `/ta-scheduler` client chunks contain zero `three`, `@react-three/*`, `@tensorflow/*`, `@mediapipe/*`, or `@livekit/*` modules.
  - Confirm no server-only env vars (`GEMINI_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) appear in `.next/static/`.
- [ ] Audit Supabase RLS policies and Postgres constraints (`profiles`, `study_sessions` including `general` + `math`, `distraction_logs`, `ta_bookings` 3-way `btree_gist` constraints).
- [ ] Run end-to-end QA walkthrough across all 5 core user flows:
  1. Verified email sign-in -> `/campus` 2-Wing Campus Map (`General Study Silent` + `Math Topic A/V`, live `campus:lobby` Presence counts) -> Progress Sheet (`math` & `general` minutes).
  2. `/campus/[roomSlug]` procedural 3D room (Math & General props) -> walk/sit -> study timers + `timer:sync` -> session end & streak update.
  3. **Topic A/V vs Silent Room split + CV Focus Guard**:
     - In `math-calculus` (`allowAudioVideo: true`): LiveKit call (`track.clone()`) + plain-text `chat:message` + 3–5 FPS CV focus guard (`cell_phone`, `face_absent`/`look_away`, 3s grace, break exemption, `Stand Up` vs `Leave Room` camera cleanup, denied-camera fallback).
     - In `general-quiet-hall` (`allowAudioVideo: false`): LiveKit & Table Chat UI hidden, zero `track.clone()` calls, `POST /api/livekit/token` returns `403 FORBIDDEN`, and CV focus guard still operates normally.
  4. **Solo Whiteboard + Math AI & Plotter**: `1200 × 800` solo local canvas + R3F `frameloop="never"` pause + Math-only Gemini `enhance` & `generate` (`GEMINI_MODEL=gemini-3.8-flash`) + `math-syllabus.ts` enforcement + deterministic `MathPlotSpec` plots (`y = f(x)`, `x = g(y)`, asymptote breaks, crossing `shadedRegions[]`, `dx`/`dy` slices, auto-dim canvas toggle) + double `isomorphic-dompurify` SVG sanitization + zero `whiteboard:*` Broadcast events.
  5. Standalone `/ta-scheduler` -> 1-click TA/Student toggle -> 3-way `409 Conflict` blocking + 1-click suggested slot booking + cancellation.
- [ ] Fix any defects discovered during QA and re-run the full verification gate after the final edit.
- [ ] Update `sprints/README.md` status once user confirms sign-off.

---

## 5. Success Criteria (Pass / Fail)

- [ ] Every requirement in `docs/REQUIREMENTS.md` (§1–§7) passes end-to-end in the running application.
- [ ] Zero XSS execution on AI/plotted SVG or chat messages; zero unsafe `mathjs` expression evaluation; `POST /api/livekit/token` blocks silent rooms (`403`); zero server secrets in client bundles; RLS prevents cross-user `study_sessions` / `distraction_logs` reads or writes.
- [ ] `/ta-scheduler` ships zero WebGL/CV client bundles; `/campus/[roomSlug]` loads CV assets strictly from `/models/*`, pauses R3F on solo whiteboard open, and turns off the webcam LED on room exit.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly with zero warnings/errors blocking production deployment.

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` (full suite across all modules).
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
  - Inspect `.next/static/` for leaked secrets or WebGL/CV in `/ta-scheduler`.
- **Browser / runtime checks:**
  - Complete the 5-flow E2E browser walkthrough above against `npm run start` (production build) and confirm zero uncaught runtime errors, zero console hydration warnings, zero `whiteboard:*` Broadcast traffic, and full cleanup on navigation/exit.

---

## 7. HARD STOP GATE

**DO NOT proceed with any further changes automatically.** Before finishing Sprint 6:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 6's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all audit findings, fixes applied, and exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and E2E runtime verification results.
4. **STOP** and present final production readiness sign-off to the user.
