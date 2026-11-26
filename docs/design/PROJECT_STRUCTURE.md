# EdMonitor — Project Structure, Env & CLI Commands

Concise repository layout, environment variables, and exact CLI commands.

---

## 1. Directory Tree

```text
.
├── AGENTS.md                         # Lean agent instructions & docs index
├── CLAUDE.md                         # Points Claude Code to AGENTS.md
├── GEMINI.md                         # Stack & coding conventions
├── LEARNER_PERSONA.md                # Target learner profile & UX criteria
├── README.md                         # Project overview & feature summary
├── docs/
│   ├── MARKET_ANALYSIS.md            # Competitor & positioning research
│   ├── REQUIREMENTS.md               # Functional & runtime requirements
│   └── design/
│       ├── AI_PROMPTS.md             # Gemini prompts, schema & fallback spec
│       ├── API_CONTRACT.md           # REST API routes & JSON schemas
│       ├── ARCHITECTURE.md           # System boundaries, CV & WebGL state
│       ├── ARCHITECTURE_DECISIONS.md # Architectural rationale & trade-offs
│       ├── DB_SCHEMA.md              # Postgres ERD, 3-way rules & Realtime
│       ├── PROJECT_STRUCTURE.md      # This file
│       └── UI_UX.md                  # Wireframes, tokens & HUD specs
├── public/
│   └── models/                       # Self-hosted TF.js & MediaPipe WASM/weights
├── supabase/
│   └── migrations/                   # SQL schema, btree_gist constraints, RLS & seeds
├── src/                              # Next.js --src-dir application source
│   ├── app/
│   │   ├── layout.tsx                # Fonts (Plus Jakarta Sans, JetBrains Mono) & globals
│   │   ├── page.tsx                  # Landing / Guest Nickname & Email Auth Gate
│   │   ├── campus/
│   │   │   ├── page.tsx              # 2D Campus Map + Progress Sheet
│   │   │   └── [roomSlug]/
│   │   │       └── page.tsx          # 3D Study Room + Table HUD + Whiteboard Overlay
│   │   ├── ta-scheduler/
│   │   │   └── page.tsx              # Standalone TA Scheduler (Zero WebGL/CV)
│   │   └── api/
│   │       ├── profile/route.ts
│   │       ├── sessions/
│   │       │   ├── route.ts
│   │       │   └── [sessionId]/
│   │       │       ├── route.ts
│   │       │       └── distractions/route.ts
│   │       ├── progress/route.ts
│   │       ├── livekit/token/route.ts
│   │       ├── ai/whiteboard/route.ts
│   │       └── ta-schedule/
│   │           ├── route.ts
│   │           ├── metadata/route.ts
│   │           └── [bookingId]/route.ts
│   ├── components/
│   │   ├── campus/                   # 2D map, zone cards, progress drawer
│   │   ├── room3d/                   # Procedural R3F room, avatars, focus halos
│   │   ├── table/                    # LiveKit A/V strip, chat, study timer
│   │   ├── whiteboard/               # HTML5 canvas, sanitized SVG overlay, AI panel
│   │   └── ta-scheduler/             # Weekly timetable grid, role toggle, conflict modal
│   ├── hooks/
│   │   ├── useSharedMedia.ts         # Single getUserMedia + clone() for LiveKit/CV
│   │   ├── useFocusGuard.ts          # 3-5 FPS TF.js/MediaPipe loop + 3s grace machine
│   │   ├── useRoomPresence.ts        # room:{roomSlug} & campus:lobby Presence
│   │   └── useTableBroadcast.ts      # table:{roomSlug}:{tableId} Broadcast sync
│   ├── lib/
│   │   ├── supabase/                 # Browser, server (@supabase/ssr), and admin clients
│   │   ├── ai/
│   │   │   ├── prompts.ts            # Prompt templates & responseSchema (server-only)
│   │   │   └── sanitizeSvg.ts        # Server + DOMPurify SVG sanitization helpers
│   │   ├── livekit.ts                # Server-only token minting helper
│   │   └── ta-conflicts.ts           # Conflict query & 30m-step slot suggestion engine
│   └── types/
│       ├── domain.ts                 # Shared Campus, Session, Timer, Halo, AI types
│       └── ta-schedule.ts            # TA scheduling & 409 conflict types
```

---

## 2. Required Environment Variables

Create `.env.local` for local development (never commit real secrets):

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase anonymous/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Supabase service role key for validated server writes |
| `NEXT_PUBLIC_LIVEKIT_URL` | Public | LiveKit Cloud WebSocket URL (`wss://...`) |
| `LIVEKIT_API_KEY` | Server-only | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | Server-only | LiveKit Cloud API secret for minting table JWTs |
| `GEMINI_API_KEY` | Server-only | Google Gemini API key (`@google/genai`) |
| `GEMINI_MODEL` | Server-only | Active Gemini Flash model ID (e.g. `gemini-2.5-flash`) |

---

## 3. Exact CLI Commands

```bash
# 1. Install dependencies
npm install

# 2. Run local development server (localhost satisfies HTTPS webcam requirement)
npm run dev

# 3. Run unit/integration test suite (Vitest)
npm test

# 4. Typecheck, lint, and production build verification
npx tsc --noEmit && npm run lint && npm run build
```
