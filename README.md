# EdMonitor

A collaborative virtual study platform for STEM students combining 2D/3D study spaces, real-time table collaboration, client-side webcam focus tracking, AI whiteboard visualizations, and conflict-free TA scheduling.

## Features

- **2D Campus & 3D Study Rooms** — Browse Math, Physics, and Chemistry zones on a 2D map and step into procedural 3D rooms with live avatars and status halos.
- **Real-Time Table Collaboration** — Sit at a study table to join scoped voice/video calls, live chat, and a shared whiteboard, using individual or table-synced study timers (*Pomodoro*, *Deep Work*, *Feynman*, *Flowtime*).
- **Client-Side Focus Tracking** — 100% in-browser webcam detection for phone usage and desk absence/look-away (~3s grace period) that alerts the user, auto-pauses timers, updates avatar focus halos, and tracks progress metrics.
- **AI Visualization Enhancer** — Sketch on the whiteboard to get step-by-step explanations and clean SVG overlays, or generate annotated STEM diagrams directly from text prompts.
- **TA Discussion Scheduling** — Standalone module with 1-click TA/Student views, hard-blocked 3-way conflict prevention (cohort, TA, and room), and smart next-slot suggestions.

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend & Hosting** | Next.js (App Router), TypeScript, Tailwind CSS, Vercel |
| **3D Rendering** | Three.js, React Three Fiber (`@react-three/fiber`, `@react-three/drei`) |
| **Backend & Realtime** | Supabase (Postgres, Realtime Presence & Broadcast, Guest/Email Auth) |
| **Voice & Video** | LiveKit Cloud (`@livekit/components-react`) |
| **Computer Vision** | TensorFlow.js (`coco-ssd`), MediaPipe Face Landmarker (self-hosted WASM/weights) |
| **AI** | Google Gemini API (`@google/genai`) |

## Documentation

- [Project Requirements](./REQUIREMENTS.md) — Detailed functional specs and runtime constraints.
- [Learner Persona](./LEARNER_PERSONA.md) — Target user profile, goals, and pain points.

## Team

- **Omar Mokhtar** — Technical & Software Development
- **Abdulrahman Hani** — Business Aspects & Research
