# Project Requirements

A collaborative virtual study platform combining a 2D campus overview, 3D avatar study rooms, real-time voice/video calls in topic rooms, client-side webcam focus tracking, a Math-only AI visualization enhancer & deterministic Cartesian plotter, and conflict-free TA discussion scheduling.

## Team

- **Omar Mokhtar** — Technical & Software Development
- **Abdulrahman Hani** — Business Aspects & Research

---

## 1. 2D Campus Map & 3D Avatar Study Rooms

- **2D Campus Map (Macro View — 2-Wing Campus)**: Clean, clickable 2D vector overview displaying **2 active zones** (structured cleanly so additional subjects can be added later):
  - **General Study (Silent)**: Quiet study rooms (`general-quiet-hall` `G-101`, `general-deep-focus` `G-102`) with `allowAudioVideo: false` and a `Silent · No A/V` badge.
  - **Math (Topic A/V)**: Math topic rooms (`math-calculus` `M-101`, `math-2-integrals` `M-102`, `math-linear-algebra` `M-103`) with `allowAudioVideo: true` and a `Topic · A/V` badge.
  - Displays live member counts and table occupancy dots per room.
- **3D Avatar Virtual Rooms (Micro View)**: Clicking a room enters a compact, procedural **low-poly 3D room** built in **React Three Fiber** (`@react-three/fiber`, `@react-three/drei`) with zero external Blender/GLB dependencies and zone-appropriate procedural props (Math geometric prism / coordinate frame; General Study architectural desk lamp / bookstand).
- **3D Avatars & Presence**: Simple code-built geometric avatars with color selection, bobbing walk/sit movement across study tables, and floating HUD badges (name, study technique, and focus status halo).
- **Table Entry**: Moving to a study table inside a Math Topic (`allowAudioVideo: true`) room connects the user to that table's LiveKit voice/video call, table chat, optional timer sync, and their personal solo whiteboard. Inside General Study (`allowAudioVideo: false`) rooms, LiveKit voice/video and table chat are disabled while local webcam CV focus tracking, study timers, and the solo whiteboard remain active.

---

## 2. Collaboration & Study Techniques

- **Voice & Video Calls (Topic Rooms Only)**: Table-scoped calls powered by **LiveKit Cloud** (`@livekit/components-react`) in rooms with `allowAudioVideo: true`, enforced both in the UI and server-side in `POST /api/livekit/token` (`403 FORBIDDEN` for `allowAudioVideo === false`).
- **Table Chat (Topic Rooms Only)**: Real-time plain-text table chat synced over Supabase Realtime (`table:{roomSlug}:{tableId}`) in Topic A/V rooms; hidden in General Study silent rooms.
- **Solo (Student-Only) Whiteboard**: Lightweight **HTML5 Canvas whiteboard** (pen, line, rect, circle, eraser, colors, stroke width, undo, clear) running strictly in **local client state** (no multiplayer stroke or AI overlay broadcasting).
- **Study Techniques**:
  - Users in the same room can use the same or different techniques: **Pomodoro (25/5)**, **Deep Work (50/10)**, **Feynman**, or **Flowtime**.
  - Active technique and state are shown live on each avatar.
  - Optional **"Sync timer with table"** toggle (`timer:sync` Broadcast) for groups studying on the same cycle.

---

## 3. Webcam Distraction Detection & Progress

- **Detection Signals (100% Client-Side, No Training Required)**:
  - **Distracting Devices**: Pretrained TensorFlow.js `coco-ssd` detecting `cell phone` in frame.
  - **Presence & Attention**: Pretrained MediaPipe Face Landmarker detecting desk absence or prolonged look-away.
- **Trigger Behavior**:
  - Samples webcam frames at **3–5 FPS**.
  - **~3-second grace period** before triggering to avoid false positives.
  - On distraction: plays a **Web Audio API beep**, auto-pauses the study timer, logs the distraction, and updates the live 3D avatar halo (**green** = focused, **red** = distracted, **yellow** = break).
  - Runs identically in both **Math (Topic A/V)** and **General Study (Silent)** rooms.
- **Progress Dashboard**: Tracks focused minutes by active campus subject/zone (`math` and `general`, structured cleanly to support future subjects), focus score %, distraction breakdown, and daily streak.

---

## 4. Math-Only AI Visualization Enhancer & Deterministic Plotter

Powered by the **Google Gemini API** (`@google/genai`), integrated directly with the **solo** student whiteboard via a `1200 × 800` **SVG overlay layer** and strictly scoped to **Math topics**:

1. **Syllabus Guardrails (`src/lib/ai/math-syllabus.ts`)**: Enforces `allowedFormulas` (including a complete starter entry for **Math 2 Area Between Curves** plus `TODO` placeholders for remaining Math topics), `forbiddenMethods`, and `requiredStepOrder` so Gemini stays strictly inside the student's approved curriculum.
2. **Explain & Enhance Drawings**: Exports the student's solo canvas PNG snapshot + optional Math prompt → AI diagnoses conceptual or geometric errors (`flaggedMistake`), gives syllabus-aligned step-by-step explanations, and returns clean SVG annotations and/or a deterministic `MathPlotSpec`.
3. **Explain Math Topics & Deterministic Math 2 Plotter**: User enters a Math prompt → AI returns structured JSON with syllabus-aligned explanation steps, optional SVG annotations, and optional `MathPlotSpec` rendered deterministically onto the `1200 × 800` SVG overlay using a strictly allowlisted `mathjs` evaluator—supporting `y = f(x)` and `x = g(y)` curves, asymptote/domain path breaks, intersection points, `shadedRegions[]` (array for crossing curves), and `dx`/`dy` representative slices. Auto-dims the student's freehand canvas when an AI plot is active (with a manual toggle).

---

## 5. TA Discussion Scheduling (Standalone Module)

A dedicated scheduling module separate from the 3D virtual campus to prevent conflicting Teaching Assistant discussion times:

- **Roles & Setup**: Pre-seeded STEM courses and student cohorts (e.g., Year 1 STEM taking Math, Physics, and Chemistry) with a **1-click TA / Student role toggle**.
- **3-Way Conflict Prevention (Hard-Blocked)**: Prevents scheduling overlapping sessions for:
  1. The same **student cohort** across subjects (e.g., Math TA and Physics TA booking the same cohort at the same time).
  2. The same **TA**.
  3. The same **room**.
- **Smart Slot Suggestions**: When a conflict occurs, automatically suggests the **next conflict-free time slots**.

---

## 6. Tech Stack

- **Framework & Hosting**: Next.js (App Router, TypeScript, Tailwind CSS) on **Vercel**.
- **3D Rendering**: `three`, `@react-three/fiber`, `@react-three/drei`.
- **Auth, Database & Realtime**: **Supabase** (Postgres for sessions/metrics/TA schedules, Realtime Presence for campus/rooms, Broadcast for `timer:sync` and topic-room `chat:message`, **verified email authentication** required before entering the app).
- **Calls**: **LiveKit Cloud** (Topic A/V rooms only).
- **Client-Side CV**: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@mediapipe/tasks-vision`.
- **AI & Math Plotting**: **Google Gemini API** (`@google/genai`, `GEMINI_MODEL=gemini-3.8-flash`), `mathjs` (allowlisted expression evaluation for deterministic SVG plots), and `isomorphic-dompurify` (double SVG sanitization).

---

## 7. Runtime & Technical Constraints

- **Client Hardware**: Standard laptop with a modern browser (Chrome/Edge/Firefox/Safari) and webcam; runs via WebGL with WASM/CPU fallback (~200–400 MB RAM, no dedicated GPU or Python required).
- **WebGL GPU Budget**: Auto-pause the 3D render loop (`<Canvas frameloop="never">`) whenever the solo whiteboard/AI overlay is open so CV focus tracking and LiveKit remain smooth.
- **HTTPS**: Required by browsers for webcam access (`localhost` in dev, automatic on Vercel).
- **Shared Camera Stream**: Reuse one webcam stream (`useSharedMedia`) between CV and LiveKit (`baseVideoTrack.clone()` only when seated in an `allowAudioVideo: true` room; never cloned in General Study silent rooms) to prevent OS camera lock conflicts.
- **Offline/Wi-Fi Reliability**: Self-host CV model weights/WASM (~15–20 MB) in `public/models/`.
- **Security**: Double-sanitize all AI-generated and plotted SVG markup (`isomorphic-dompurify` on both server and client) before rendering in the DOM, and restrict `mathjs` plot evaluation to an explicit math-only allowlist.
