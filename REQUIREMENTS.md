# Project Requirements

A collaborative virtual study platform combining a 2D campus overview, 3D avatar study rooms, real-time voice/video calls, client-side webcam focus tracking, an AI visualization enhancer for Math, Physics, and Chemistry, and conflict-free TA discussion scheduling.

## Team

- **Omar Mokhtar** — Technical & Software Development
- **Abdulrahman Hani** — Business Aspects & Research

---

## 1. 2D Campus Map & 3D Avatar Study Rooms

- **2D Campus Map (Macro View)**: Clean, clickable 2D vector overview displaying **3 subject zones** (**Math**, **Physics**, **Chemistry**), **2–3 topic rooms** per zone, and live member counts.
- **3D Avatar Virtual Rooms (Micro View)**: Clicking a room enters a compact, procedural **low-poly 3D room** built in **React Three Fiber** (`@react-three/fiber`, `@react-three/drei`) with zero external Blender/GLB dependencies.
- **3D Avatars & Presence**: Simple code-built geometric avatars with color selection, bobbing walk/sit movement across study tables, and floating HUD badges (name, study technique, and focus status halo).
- **Table Entry**: Moving to a study table inside a 3D room connects the user to that table's voice/video call, chat, and shared whiteboard.

---

## 2. Collaboration & Study Techniques

- **Voice & Video Calls**: Table-scoped calls powered by **LiveKit Cloud** (`@livekit/components-react`).
- **Shared Workspace**: Real-time table chat and a custom lightweight **HTML5 Canvas whiteboard** (pen, shapes, colors, eraser, undo) synced over Supabase Realtime.
- **Study Techniques**:
  - Users in the same room can use the same or different techniques: **Pomodoro (25/5)**, **Deep Work (50/10)**, **Feynman**, or **Flowtime**.
  - Active technique and state are shown live on each avatar.
  - Optional **"Sync timer with table"** toggle for groups studying on the same cycle.

---

## 3. Webcam  distraction detection & Progress

- **Detection Signals (100% Client-Side, No Training Required)**:
  - **Distracting Devices**: Pretrained TensorFlow.js `coco-ssd` detecting `cell phone` in frame.
  - **Presence & Attention**: Pretrained MediaPipe Face Landmarker detecting desk absence or prolonged look-away.
- **Trigger Behavior**:
  - Samples webcam frames at **3–5 FPS**.
  - **~3-second grace period** before triggering to avoid false positives.
  - On distraction: plays a **Web Audio API beep**, auto-pauses the study timer, logs the distraction, and updates the live 3D avatar halo (**green** = focused, **red** = distracted, **yellow** = break).
- **Progress Dashboard**: Tracks focused minutes per subject, focus score %, distraction breakdown, and daily streak.

---

## 4. AI Visualization Enhancer

Powered by the **Google Gemini API** (`@google/genai`), integrated directly with the shared whiteboard via an **SVG overlay layer**:

1. **Explain & Enhance Drawings**: Exports a canvas PNG snapshot + subject context → AI returns a step-by-step explanation (flagging mistakes) and a clean, labeled SVG version to overlay/replace the sketch.
2. **Explain Topics with Drawings**: User enters a Math, Physics, or Chemistry prompt → AI returns structured JSON with synchronized explanation steps and step-by-step annotated SVG diagrams rendered onto the shared board.

---

## 5. TA Discussion Scheduling (Standalone Module)

A dedicated scheduling module separate from the 3D virtual campus to prevent conflicting Teaching Assistant discussion times:

- **Roles & Setup**: Pre-seeded courses and student cohorts (e.g., Year 1 STEM taking Math, Physics, and Chemistry) with a **1-click TA / Student role toggle**.
- **3-Way Conflict Prevention (Hard-Blocked)**: Prevents scheduling overlapping sessions for:
  1. The same **student cohort** across subjects (e.g., Math TA and Physics TA booking the same cohort at the same time).
  2. The same **TA**.
  3. The same **room**.
- **Smart Slot Suggestions**: When a conflict occurs, automatically suggests the **next conflict-free time slots**.

---

## 6. Tech Stack

- **Framework & Hosting**: Next.js (App Router, TypeScript, Tailwind CSS) on **Vercel**.
- **3D Rendering**: `three`, `@react-three/fiber`, `@react-three/drei`.
- **Auth, Database & Realtime**: **Supabase** (Postgres for sessions/metrics/TA schedules, Realtime Presence & Broadcast for avatars/chat/whiteboard, instant **Guest/Nickname join** + optional email login).
- **Calls**: **LiveKit Cloud**.
- **Client-Side CV**: `@tensorflow/tfjs`, `@tensorflow-models/coco-ssd`, `@mediapipe/tasks-vision`.
- **AI**: **Google Gemini API** (active Flash model configured via environment variable).

---

## 7. Runtime & Technical Constraints

- **Client Hardware**: Standard laptop with a modern browser (Chrome/Edge/Firefox/Safari) and webcam; runs via WebGL with WASM/CPU fallback (~200–400 MB RAM, no dedicated GPU or Python required).
- **WebGL GPU Budget**: Auto-pause the 3D render loop whenever the whiteboard/AI overlay is open so CV focus tracking and LiveKit remain smooth.
- **HTTPS**: Required by browsers for webcam access (`localhost` in dev, automatic on Vercel).
- **Shared Camera Stream**: Reuse one webcam stream between LiveKit and the CV loop to prevent OS camera lock conflicts.
- **Offline/Wi-Fi Reliability**: Self-host CV model weights/WASM (~15–20 MB) in `public/models/`.
- **Security**: Sanitize all AI-generated SVG markup before rendering in the DOM.
