# EdMonitor — Stack & Coding Conventions

> Project-specific architecture, security, 3D/CV budgets, docs routing, and verification commands live in [Agents.md](./Agents.md) (auto-loaded alongside this file).

## Tech Stack

- **Framework & Hosting**: Next.js (App Router), React, TypeScript (strict), Tailwind CSS, Vercel
- **3D Rendering**: Three.js, React Three Fiber (`@react-three/fiber`, `@react-three/drei`)
- **Backend & Realtime**: Supabase (Postgres, RLS, Realtime Presence & Broadcast, Guest/Email Auth)
- **Voice & Video**: LiveKit Cloud (`@livekit/components-react`)
- **Client-Side CV**: TensorFlow.js (`@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`), MediaPipe (`@mediapipe/tasks-vision`)
- **AI**: Google Gemini (`@google/genai`) — server-side only

## Coding Conventions

- **TypeScript**: Use strict typing; avoid `any` (prefer `unknown` + narrowing or explicit interfaces/types). Export shared domain types from dedicated type modules.
- **Next.js App Router**:
  - Keep components as Server Components by default; add `"use client"` only to leaf components that need browser APIs, state, or event handlers.
  - Use Route Handlers (`app/api/**/route.ts`) or Server Actions for server-side mutations and all `@google/genai` calls.
  - Validate untrusted request/form inputs at the boundary before DB or AI calls.
- **Styling**: Use Tailwind CSS utility classes; avoid custom CSS files unless defining theme tokens or keyframes in `app/globals.css`.
- **Component & Function Design**:
  - Keep components and helpers small, single-purpose, and shallowly nested with early returns.
  - Extract shared logic into reusable hooks (`hooks/`) or utilities (`lib/`) rather than duplicating code.
  - Clean up browser resources (animation frames, timers, `MediaStream` tracks, Web Audio nodes, Realtime subscriptions) in `useEffect` return callbacks.
- **Naming**:
  - Components: `PascalCase.tsx`
  - Hooks: `useCamelCase.ts`
  - Utilities & server modules: `camelCase.ts` or `kebab-case.ts` (match existing folder style)
  - Route segments: `kebab-case`
- **Verification**: Run `npx tsc --noEmit && npm run lint && npm run build` after code changes.
