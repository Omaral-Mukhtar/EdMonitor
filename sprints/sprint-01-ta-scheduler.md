# Sprint 1 — Standalone TA Discussion Scheduler (`/ta-scheduler`)

## 1. Goal & Strict Scope

- **Goal:** Build the completely standalone TA Discussion Scheduling module (`/ta-scheduler`) with a 1-click TA/Student role toggle, weekly timetable grid, atomic Postgres 3-way conflict blocking (`409 Conflict`), and `CAMPUS_TZ`-aware smart slot suggestions.
- **In Scope:**
  - `GET /api/ta-schedule/metadata`, `GET /api/ta-schedule`, `POST /api/ta-schedule`, `PATCH /api/ta-schedule/[bookingId]`.
  - `src/lib/ta-conflicts.ts` (relational validation, Postgres `23P01` error mapping, conflict query across `cohort`/`ta`/`room`, and 30-minute-step forward slot suggestion engine in `CAMPUS_TZ` within `08:00–20:00`).
  - `src/app/ta-scheduler/page.tsx` and `src/components/ta-scheduler/*`: 1-click `Student View | TA View` switch, cohort/room/subject filters, weekly Mon–Fri/Sat timetable grid (`08:00–20:00`), booking creation modal, inline `409 Conflict` explanation + 1-click suggested slot buttons, cancel booking action, and empty state.
- **Out of Scope:**
  - Any R3F, Three.js, LiveKit, TensorFlow.js, MediaPipe, or webcam imports inside `/ta-scheduler` (strict isolation invariant).
  - 2D Campus Map `/campus` or Progress Sheet (Sprint 2).
  - 3D study rooms, CV focus guard, or AI whiteboard (Sprints 3–5).

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — §5 (TA Discussion Scheduling).
- `docs/design/DB_SCHEMA.md` — §2 (Hard-Blocked 3-Way TA Conflict Logic, `TaBookingConflictResponse`).
- `docs/design/API_CONTRACT.md` — §6 (`GET /api/ta-schedule/metadata`, `GET /api/ta-schedule`, `POST /api/ta-schedule`, `PATCH /api/ta-schedule/[bookingId]`).
- `docs/design/UI_UX.md` — §3 Screen 4 (TA Discussion Scheduler wireframe), §4A (Subject Palette), §4D (TA Timetable empty state).
- `docs/design/ARCHITECTURE.md` — §1 (Standalone TA Scheduling boundary).

---

## 3. Target Files & Modules

- `src/app/ta-scheduler/page.tsx`
- `src/app/api/ta-schedule/metadata/route.ts`
- `src/app/api/ta-schedule/route.ts`
- `src/app/api/ta-schedule/[bookingId]/route.ts`
- `src/lib/ta-conflicts.ts`
- `src/components/ta-scheduler/TaSchedulerShell.tsx`
- `src/components/ta-scheduler/WeeklyTimetableGrid.tsx`
- `src/components/ta-scheduler/BookingDialog.tsx`
- `src/components/ta-scheduler/ConflictResolutionBanner.tsx`
- `src/lib/__tests__/ta-conflicts.test.ts`
- `src/app/api/ta-schedule/__tests__/ta-schedule-route.test.ts`

---

## 4. Ordered Implementation Checklist

- [x] Implement `src/lib/ta-conflicts.ts` with:
  - Zod schema + business-rule checks (`endsAt > startsAt`, study hours `08:00–20:00` in `CAMPUS_TZ`, TA teaches selected course, cohort enrolled in selected course).
  - Conflict breakdown builder querying overlapping `status = 'scheduled'` bookings on `cohort_id`, `ta_id`, or `room_id`.
  - Candidate 30-minute-step forward slot suggestion finder (up to 3 slots matching requested duration within `08:00–20:00` in `CAMPUS_TZ`, preferring requested room first and alternate free room if only `room` conflicted).
- [x] Implement `GET /api/ta-schedule/metadata` returning `courses`, `cohorts`, `cohortCourses`, `tas`, and `rooms`.
- [x] Implement `GET /api/ta-schedule` supporting `cohortId`, `taId`, `roomId`, `courseId`, `weekStart`, and `status` filters.
- [x] Implement `POST /api/ta-schedule` returning `201 Created` on success, `400 VALIDATION_ERROR` on invalid input/relational mismatch, and `409 BOOKING_CONFLICT` (`TaBookingConflictResponse`) on Postgres `23P01`.
- [x] Implement `PATCH /api/ta-schedule/[bookingId]` to cancel a scheduled booking (`status: "cancelled"`), freeing slots immediately.
- [x] Build `TaSchedulerShell.tsx` with 1-click `Student View | TA View` segmented switch, Cohort / Room / Subject filters, week navigation, and `[+ Schedule Discussion]` CTA (visible in `TA View`).
- [x] Build `WeeklyTimetableGrid.tsx` (`Mon–Fri` / `Sat`, `08:00–20:00` 30-minute rows, color-coded Math Cobalt / Physics Teal / Chemistry Iris blocks, empty state copy, and cancel action in `TA View`).
- [x] Build `BookingDialog.tsx` + `ConflictResolutionBanner.tsx` showing exact conflict dimensions (`cohort`, `ta`, `room`) and 1-click Suggested Slot chips that immediately populate `startsAt`, `endsAt`, and `roomId`.
- [x] Write Vitest unit & route integration tests for 3-way conflict blocking, back-to-back `[)` range allowance, `CAMPUS_TZ` boundary hours, and smart slot suggestions.

---

## 5. Success Criteria (Pass / Fail)

- [x] Booking overlapping sessions for the same **cohort** (even across different subjects/TAs/rooms), same **TA**, or same **room** returns HTTP `409` with `error: "BOOKING_CONFLICT"`, accurate `conflicts[]` dimensions, and up to 3 valid `suggestions[]`.
- [x] Back-to-back bookings (`10:00–11:00` and `11:00–12:00` on the same cohort/TA/room) succeed with HTTP `201`.
- [x] Cancelling a booking via `PATCH /api/ta-schedule/[bookingId]` immediately frees the slot for re-booking with HTTP `201`.
- [x] Clicking a Suggested Slot button in the `BookingDialog` updates the form fields and submits cleanly to `201`.
- [x] `/ta-scheduler` route imports zero Three.js, `@react-three/*`, `@livekit/*`, `@tensorflow/*`, or `@mediapipe/*` packages (verified by bundle/static grep check).
- [x] All unit/integration tests, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` covering:
    - Half-open `[)` back-to-back non-collision vs overlap detection.
    - All 3 conflict dimensions (`cohort`, `ta`, `room`) + multi-dimension simultaneous conflicts.
    - `CAMPUS_TZ` study-hours (`08:00–20:00`) validation & 30-minute-step suggestion generation (same room vs alternate room fallback).
    - `POST /api/ta-schedule` Zod + relational validation (`TA`/`cohort` course mismatch -> `400`).
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
  - Verify `src/app/ta-scheduler/` and `src/components/ta-scheduler/` contain zero WebGL/CV/LiveKit imports.
- **Browser / runtime checks:**
  - Open `/ta-scheduler` unauthenticated (and as Guest): verify 1-click toggle switches between `Student View` and `TA View`.
  - Book `MATH101` for `Y1-STEM-A` in `DISC-104` at `14:00–15:00` -> appears immediately in Cobalt on the timetable.
  - Attempt booking `PHYS101` for `Y1-STEM-A` at `14:30–15:30` -> observe inline `409` conflict alert, click a suggested slot, submit -> succeeds (`201`).
  - Switch Cohort filter to an empty cohort -> verify empty state copy + `[Schedule First Session]` CTA in `TA View`.

---

## 7. HARD STOP GATE

**DO NOT begin the next sprint automatically.** Before finishing Sprint 1:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 1's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all files created/modified and report the exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser/runtime verification results.
4. **STOP** and wait for explicit user approval before starting Sprint 2.
