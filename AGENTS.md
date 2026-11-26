# EdMonitor — Agent Guide

Collaborative STEM study platform built with **Next.js (App Router, TypeScript, Tailwind CSS)** on **Vercel**, **React Three Fiber** (`three`, `@react-three/fiber`, `@react-three/drei`), **Supabase** (Postgres, Realtime Presence/Broadcast, Verified Email Auth), **LiveKit Cloud** (`@livekit/components-react`), client-side CV (`@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@mediapipe/tasks-vision`), and **Google Gemini** (`@google/genai`).

## Core Coding Conventions

- **Strict TypeScript**: Avoid `any`; use `unknown` + narrowing or explicit interfaces in `src/types/`.
- **App Router & Server Boundaries**: Keep components as Server Components by default (`"use client"` only on interactive leaves). Call `@google/genai` and read `GEMINI_API_KEY` / `LIVEKIT_API_SECRET` / `SUPABASE_SERVICE_ROLE_KEY` exclusively in Route Handlers or Server Actions.
- **Implementation Contracts**: Strictly follow [`docs/design/API_CONTRACT.md`](docs/design/API_CONTRACT.md) and [`docs/design/PROJECT_STRUCTURE.md`](docs/design/PROJECT_STRUCTURE.md) during implementation.
- **Critical Runtime Invariants**:
  - Zero external 3D models (`.glb`/`.gltf`); procedural R3F primitives only, and pause `<Canvas frameloop="never">` when overlays open.
  - 100% client-side CV (3–5 FPS, ~3s grace period, `green`/`red`/`yellow` halos) using self-hosted `/public/models/*` and a single `useSharedMedia` camera stream (`track.clone()` for LiveKit).
  - Double-sanitize all AI SVG (server + client `isomorphic-dompurify`) before DOM render.
  - Keep `/ta-scheduler` (`src/app/ta-scheduler/page.tsx`) standalone (zero WebGL/CV imports) with Postgres `btree_gist` 3-way conflict blocking.
- **Sprint Execution Protocol**: Work on only ONE sprint file at a time. Never begin the next sprint until the current sprint passes all verification checks and the user explicitly approves moving forward.
- **Verification**: Run `npm test && npx tsc --noEmit && npm run lint && npm run build` after code changes. Use `exa`, `supabase_mcp`, `vercel`, and `gemini-api-docs` MCPs instead of guessing SDKs.

## Documentation Index (Read On Demand)

| File | When to Consult |
| :--- | :--- |
| `README.md` | Checking project overview, feature list, or team summary |
| `LEARNER_PERSONA.md` | Making UX, onboarding, focus-alert, or visual-clarity decisions |
| `GEMINI.md` | Checking stack & coding conventions auto-loaded for Gemini agents |
| `docs/REQUIREMENTS.md` | Checking functional requirements, constraints, and acceptance scope |
| `docs/MARKET_ANALYSIS.md` | Checking competitors, positioning, pricing anchors, or business model |
| `docs/design/ARCHITECTURE.md` | Checking system boundaries, `useSharedMedia`/CV loop, WebGL pause, or AI SVG flow |
| `docs/design/ARCHITECTURE_DECISIONS.md` | Checking architectural rationale, trade-offs, and rejected alternatives |
| `docs/design/DB_SCHEMA.md` | Checking Postgres tables, RLS policies, 3-way TA exclusion rules, or Realtime payloads |
| `docs/design/UI_UX.md` | Checking screen wireframes, HUD placement, color tokens, or fallback states |
| `docs/design/API_CONTRACT.md` | Implementing or calling any `/api/*` endpoint, auth rule, or error/409 payload |
| `docs/design/AI_PROMPTS.md` | Implementing Gemini whiteboard prompts, `responseSchema`, routing, or fallbacks |
| `docs/design/PROJECT_STRUCTURE.md` | Placing files/routes, configuring `.env.local`, or running CLI commands |
| `sprints/README.md` | Tracking active sprint status, dependencies, and hard stop gates |

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
