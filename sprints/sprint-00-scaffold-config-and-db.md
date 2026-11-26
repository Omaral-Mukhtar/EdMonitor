# Sprint 0 — Scaffold, Config & Database Foundation

## 1. Goal & Strict Scope

- **Goal:** Establish the Next.js (`--src-dir`, TypeScript strict, Tailwind CSS) project scaffold, `shadcn/ui` base primitives, Vitest test setup, Supabase Postgres schema (tables, indexes, RLS, `btree_gist` 3-way constraints, STEM seed data), Verified Email Auth gate (`/auth/callback`), `/api/profile`, and shared top navigation shell.
- **In Scope:**
  - Next.js App Router scaffold (`--src-dir`), Tailwind CSS, `Plus Jakarta Sans` + `JetBrains Mono`, `shadcn/ui` setup.
  - `.env.example` with all required public and server-only environment variables (`CAMPUS_TZ` included).
  - Vitest + React Testing Library / Zod validation test configuration (`npm test`).
  - Supabase SQL migrations in `supabase/migrations/` for all 9 tables, indexes, non-anonymous RLS policies, `btree_gist` exclusion constraints, and pre-seeded STEM courses/cohorts/TAs/rooms.
  - Supabase client helpers (`src/lib/supabase/client.ts`, `server.ts`, `admin.ts`), middleware/proxy session refresh & verified-email guard, shared domain types (`src/types/domain.ts`, `src/types/ta-schedule.ts`).
  - Auth landing page (`src/app/page.tsx`) supporting Verified Email Sign-In & Sign-Up + `/auth/callback` verification, `GET /api/profile`, `PATCH /api/profile`, and shared top navigation bar.
- **Out of Scope:**
  - TA Scheduler UI or `/api/ta-schedule*` routes (Sprint 1).
  - 2D Campus Map zone grid, `campus:lobby` Presence, or Progress Sheet (Sprint 2).
  - 3D R3F study rooms, timers, LiveKit calls, CV focus guard, or Whiteboard/Gemini AI (Sprints 3–5).

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — §5 (Roles & Setup), §6 (Tech Stack), §7 (Runtime & Technical Constraints).
- `docs/design/PROJECT_STRUCTURE.md` — §1 (Directory Tree), §2 (Required Environment Variables), §3 (Exact CLI Commands).
- `docs/design/DB_SCHEMA.md` — §1 (ERD, Core Postgres & RLS Rules), §2 (Postgres Exclusion Constraints).
- `docs/design/API_CONTRACT.md` — §1 (Conventions, Auth & Standard Error Format), §2 (`GET /api/profile`, `PATCH /api/profile`).
- `docs/design/UI_UX.md` — §1 (Design Direction, Typography, Color Separation), §4A (Core Surface Palette), §4D (Auth Entry fallback).

---

## 3. Target Files & Modules

- `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`
- `supabase/migrations/202611260001_initial_schema.sql`
- `supabase/migrations/202611260002_seed_stem_data.sql`
- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/app/page.tsx`
- `src/app/api/profile/route.ts`
- `src/components/layout/TopNav.tsx`
- `src/components/auth/AuthGateForm.tsx`
- `src/components/ui/*` (`button.tsx`, `card.tsx`, `dialog.tsx`, `sheet.tsx`, `badge.tsx`, `input.tsx`, `select.tsx`, `switch.tsx`, `tabs.tsx`)
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/middleware.ts`
- `src/proxy.ts` (or `src/middleware.ts` if scaffolded on Next.js 15 — Supabase SSR session cookie refresh)
- `src/lib/api-errors.ts` (standard JSON error helper matching `API_CONTRACT.md` §1)
- `src/types/domain.ts`, `src/types/ta-schedule.ts`
- `src/app/campus/page.tsx` (minimal authenticated placeholder linking back until Sprint 2)
- `src/app/ta-scheduler/page.tsx` (minimal standalone placeholder until Sprint 1)
- `src/lib/__tests__/profile-validation.test.ts`

---

## 4. Ordered Implementation Checklist

- [x] Scaffold Next.js App Router project (`--src-dir`, TypeScript strict, Tailwind CSS, ESLint) and install core dependencies (`@supabase/supabase-js`, `@supabase/ssr`, `zod`, `lucide-react`, `vitest`, `@vitejs/plugin-react`).
- [x] Initialize `shadcn/ui` and add required base primitives (`button`, `card`, `dialog`, `sheet`, `badge`, `input`, `select`, `switch`, `tabs`).
- [x] Create `.env.example` documenting `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `GEMINI_API_KEY`, `GEMINI_MODEL`, and `CAMPUS_TZ`.
- [x] Configure `src/app/layout.tsx` and `src/app/globals.css` with `Plus Jakarta Sans`, `JetBrains Mono` (`tabular-nums`), and `#F8FAFC` daylight drafting canvas tokens.
- [x] Write `supabase/migrations/202611260001_initial_schema.sql` with all 9 tables, FK indexes, `(user_id, started_at DESC)` index, RLS policies (`(select auth.uid()) = user_id`), `btree_gist` extension, and the 3 `ta_bookings` exclusion constraints.
- [x] Write `supabase/migrations/202611260002_seed_stem_data.sql` seeding `courses` (`MATH101`, `PHYS101`, `CHEM101`), `cohorts` (`Y1-STEM-A`, `Y1-STEM-B`), `cohort_courses`, `tas`, and `ta_rooms`.
- [x] Apply migrations to Supabase and verify RLS + constraints + seed rows via SQL check.
- [x] Implement `src/types/domain.ts`, `src/types/ta-schedule.ts`, `src/lib/api-errors.ts`, and `src/lib/supabase/{client,server,admin,middleware}.ts`.
- [x] Add `src/proxy.ts` (or `src/middleware.ts` matching the installed Next.js version) calling Supabase `@supabase/ssr` `updateSession` so Guest Anonymous and Email auth cookies refresh and persist across page reloads.
- [x] Implement `GET /api/profile` and `PATCH /api/profile` with Zod input validation (`displayName` 1–32 trimmed chars, `avatarColor` hex preset).
- [x] Build `src/app/page.tsx` + `AuthGateForm.tsx` (instant Guest Anonymous Sign-In by nickname + collapsible Email Login) and `TopNav.tsx` (links to `/campus` and `/ta-scheduler`, streak pill, avatar badge, sign-out).
- [x] Add unit tests for profile Zod validation, standard API error payloads, and Supabase schema/seed sanity.
- [x] Update `AGENTS.md` and `docs/design/PROJECT_STRUCTURE.md` once `package.json` is created (remove the pre-scaffold note and document `npm test`).

---

## 5. Success Criteria (Pass / Fail)

- [x] `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` all exit `0` with zero TypeScript `any` violations.
- [x] All 9 Postgres tables exist with RLS enabled, all FK indexes present, and `excl_ta_booking_{cohort,ta,room}_overlap` exclusion constraints active.
- [x] Pre-seeded STEM courses (`MATH101`, `PHYS101`, `CHEM101`), cohorts (`Y1-STEM-A`, `Y1-STEM-B`), TAs, and rooms are queryable.
- [x] Entering a nickname on `/` triggers Supabase Anonymous Sign-In, upserts `public.profiles` via `PATCH /api/profile`, and redirects to `/campus` with the user's name visible in `TopNav`.
- [x] Unauthenticated calls to `GET /api/profile` and `PATCH /api/profile` return `401 UNAUTHORIZED` matching `API_CONTRACT.md` §1.
- [x] Invalid `PATCH /api/profile` payloads (empty/over-32-char `displayName`, invalid hex `avatarColor`) return `400 VALIDATION_ERROR`.

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` covering:
    - `PATCH /api/profile` Zod schema & handler unit tests (`401`, `400`, `200`).
    - `api-errors.ts` standard error serialization (`VALIDATION_ERROR`, `UNAUTHORIZED`, etc.).
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
- **Browser / runtime checks:**
  - Verify `/` renders Guest Nickname primary CTA + collapsible Email login using `Plus Jakarta Sans` & `#F8FAFC`.
  - Sign in as Guest `"Youssef"`, verify `public.profiles` row (`is_guest = true`) is created, reload `/campus` to confirm session cookie persistence, and verify clicking `TA Scheduler` navigates cleanly to `/ta-scheduler`.
  - Verify `GET /api/profile` returns `401` when logged out and `200` when signed in.

---

## 7. HARD STOP GATE

**DO NOT begin the next sprint automatically.** Before finishing Sprint 0:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 0's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all files created/modified and report the exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser/runtime verification results.
4. **STOP** and wait for explicit user approval before starting Sprint 1.
