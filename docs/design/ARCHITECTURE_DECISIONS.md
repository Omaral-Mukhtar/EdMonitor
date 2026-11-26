# EdMonitor — Architecture Decision Rationale

This document explains **why** each architectural choice in [`ARCHITECTURE.md`](./ARCHITECTURE.md) was made, linking technical trade-offs directly to our target learner's hardware constraints ([`LEARNER_PERSONA.md`](../../LEARNER_PERSONA.md) — standard university laptop, ~200–400 MB RAM budget, shared dorm/library Wi-Fi, no dedicated GPU) and platform security/reliability requirements ([`REQUIREMENTS.md`](../REQUIREMENTS.md)).

---

## Executive Summary Matrix

| Area | Architectural Decision | Alternative Rejected | Primary Driver |
| :--- | :--- | :--- | :--- |
| **CV Execution** | 100% in-browser (`coco-ssd` + MediaPipe) | Streaming webcam frames to a Python/GPU backend | Student privacy, zero inference server cost, zero network lag |
| **CV Model Delivery** | Self-hosted weights & WASM in `/public/models/*` | Fetching weights from public CDNs at runtime | Dorm/campus Wi-Fi reliability, no third-party CDN blocks, instant cache |
| **Webcam Access** | Single `useSharedMedia` hook + `track.clone()` | Separate `getUserMedia` calls or raw shared track | Avoids OS hardware camera locks (`NotReadableError`) and premature `stop()` |
| **CV Sampling & Trigger** | 3–5 FPS timer loop + 3s continuous grace machine | 60 FPS `requestAnimationFrame` + instant alert | >90% CPU/GPU savings and zero false-positive alert fatigue |
| **Realtime Topology** | Room-level Presence vs. Table-level Broadcast & SFU | Single room-wide WebSocket & audio channel | Prevents O(N²) stroke/audio fan-out while preserving room social presence |
| **3D Assets & GPU Budget** | Procedural R3F primitives + `frameloop="never"` pause | External `.glb` models + unmounting `<Canvas>` | Fast load, low VRAM, zero WebGL context loss or shader recompilation |
| **Whiteboard & AI Layer** | Native HTML5 `<canvas>` + layered `<svg>` overlay | Heavy third-party canvas SDKs or raster AI images | Lightweight bundle, crisp scalable STEM diagrams, non-destructive ink |
| **SVG Security** | Double sanitization (Server Route + Client `DOMPurify`) | Server-only sanitization or raw `innerHTML` | Closes both LLM prompt-injection XSS and peer Broadcast WebSocket XSS |
| **TA Scheduling** | Standalone route + Postgres `btree_gist` constraints | Mounting inside 3D app + UI/API `SELECT` checks | Zero 3D/webcam overhead for scheduling; atomic race-free 3-way conflict block |

---

## 1. System Context & Trust Boundaries

### 1.1 Why 100% Client-Side Computer Vision (Zero Server Frame Uploads)
- **Decision:** Run TensorFlow.js (`coco-ssd` for `cell phone` detection) and MediaPipe Face Landmarker (for desk absence and prolonged look-away) entirely inside the browser via WebGL/WASM.
- **Why we chose it:**
  1. **Uncompromising Student Privacy:** Webcam frames for focus monitoring never leave the user's device. Students are far more willing to enable focus tracking in a dorm room when surveillance video is provably never uploaded or stored on a server.
  2. **Zero Cloud GPU Cost & Linear Scaling:** Server-side video inference requires expensive GPU instances and WebRTC/WebSocket frame ingestion pipelines that bottleneck under concurrent classroom load. Client-side inference scales for free with every student's browser.
  3. **Sub-Second Local Feedback:** Local inference avoids round-trip network latency when pausing timers or updating focus halos on flaky connections.
- **Alternative rejected:** Streaming 3–5 FPS JPEG snapshots to a Python FastAPI/GPU microservice (rejected due to privacy risk, bandwidth drain alongside LiveKit calls, and hosting cost).

### 1.2 Why Self-Hosted CV Weights & WASM (`/public/models/*`)
- **Decision:** Bundle and serve model weights and MediaPipe WASM binaries (~15–20 MB) directly from Next.js static assets (`/public/models/*`) rather than default Google/jsDelivr CDNs.
- **Why we chose it:** University and library networks routinely throttle or firewall external storage buckets (`storage.googleapis.com`, `cdn.jsdelivr.net`). Serving models from the same Vercel origin guarantees deterministic startup, avoids CORS/CSP fragility, and lets browser HTTP caching make subsequent study sessions load instantaneously.

### 1.3 Why Strict Browser vs. Server Trust Split (Next.js Route Handlers)
- **Decision:** Keep Vercel serverless Route Handlers thin and stateless (`POST /api/livekit/token`, `POST /api/ai/whiteboard`, `/api/ta-schedule`), holding `GEMINI_API_KEY` and `LIVEKIT_API_SECRET` strictly on the server while keeping stateful realtime traffic direct between browser, Supabase Realtime, and LiveKit Cloud.
- **Why we chose it:**
  - Never exposing AI or SFU signing keys in `"use client"` bundles prevents quota theft and unauthorized LiveKit room Minting.
  - Offloading persistent WebSockets and WebRTC media routing to Supabase Realtime and LiveKit Cloud avoids Vercel Function execution timeouts and connection-pooling bottlenecks.

### 1.4 Why Two-Tier Realtime Scoping (`room:{roomSlug}` vs. `table:{roomSlug}:{tableId}`)
- **Decision:** Split realtime communication into two distinct granularities:
  - **Room-scoped Presence (`room:{roomSlug}`):** Low-frequency state (`≤ 4 Hz` movement, study technique, `green`/`red`/`yellow` focus halo).
  - **Table-scoped Broadcast & SFU (`table:{roomSlug}:{tableId}`):** High-frequency whiteboard strokes (`30–50 ms` batches), AI SVG overlays, chat, and LiveKit audio/video.
- **Why we chose it:**
  - **Ambient Accountability Without Noise:** Students walking into a Physics room should *see* 15 peers studying with green Pomodoro halos (motivating peer accountability for solo learners), without hearing 15 open microphones or downloading whiteboard strokes from tables they aren't sitting at.
  - **Bandwidth Protection:** Scoping heavy Broadcast payloads and WebRTC tracks to a 4-seat study table caps per-client network and CPU decode overhead regardless of total room population.

### 1.5 Why a Standalone TA Discussion Scheduling Module
- **Decision:** Isolate `/ta-scheduler` completely from the 3D `<Canvas>`, `useSharedMedia`, and CV providers, and enforce 3-way conflict blocking (cohort, TA, room) inside Postgres using `btree_gist` exclusion constraints (`tstzrange` with `'[)'` bounds).
- **Why we chose it:**
  - **Zero Unnecessary Hardware Tax:** A TA or student opening the scheduler on mobile or between classes just needs fast calendar CRUD—mounting Three.js shaders or prompting for webcam permissions would add ~200 MB of wasted memory and friction.
  - **Database-Level Atomicity Over Application Checks:** Checking conflicts in React or via a `SELECT`-before-`INSERT` query in an API route creates a classic Time-of-Check to Time-of-Use (TOCTOU) race condition when two TAs book the same STEM cohort simultaneously. Postgres `EXCLUDE USING gist` rejects overlapping intervals atomically with SQLSTATE `23P01`, and half-open `'[)'` ranges allow back-to-back sessions (`10:00–11:00` and `11:00–12:00`) cleanly.

---

## 2. Shared Media & Client-Side CV Sequence

### 2.1 Why `useSharedMedia` + `baseVideoTrack.clone()`
- **Decision:** Centralize `navigator.mediaDevices.getUserMedia` inside a single `useSharedMedia` hook, feed the base `MediaStream` to a hidden `<video>` element for CV, and pass `baseVideoTrack.clone()` to LiveKit when sitting at a table.
- **Why we chose it:** Dual-consumer webcam usage in browsers fails in two subtle ways if left unmanaged:
  1. **OS Camera Hardware Lock (`NotReadableError`):** On Windows laptops, if CV owns a camera stream and LiveKit calls `getUserMedia` independently when joining a table, the OS driver frequently rejects the second request because the hardware device is locked.
  2. **Destructive Track Teardown on Table Exit:** WebRTC SDKs (including LiveKit) call `MediaStreamTrack.stop()` when disconnecting from a call. If LiveKit and CV shared the *exact same* `MediaStreamTrack` instance, standing up from a table would permanently kill the CV video track—breaking focus tracking while the user is still inside the study room. Conversely, `track.clone()` gives LiveKit an independent lifecycle handle backed by the same single hardware capture session, while explicit room-exit cleanup stops the base track so the physical webcam LED turns off reliably.

### 2.2 Why 3–5 FPS Interval Sampling Instead of `requestAnimationFrame`
- **Decision:** Drive the CV inference loop via bounded `setTimeout`/`setInterval` every `200–333 ms` (3–5 FPS) rather than `requestAnimationFrame` (60 FPS).
- **Why we chose it:** Picking up a phone or walking away from a desk occurs on multi-second human timescales. Running object detection and facial landmark extraction 60 times per second yields **zero** UX improvement over 4 times per second, while consuming ~12–20× more GPU/CPU compute, causing laptop fans to spin up and starving LiveKit video encoding and WebGL frame pacing.

### 2.3 Why a 3-Second Continuous Grace Machine & Break Exemption
- **Decision:** Require `≥ 3000 ms` of uninterrupted distraction samples before firing the Web Audio API beep, pausing the study timer, logging a distraction, and turning the avatar halo `red`—and disable distraction triggers entirely when the timer enters a scheduled break (`halo = "yellow"`).
- **Why we chose it:**
  - **Eliminating False-Positive Alert Fatigue:** Real STEM study involves glancing down at paper notebooks, reaching for a calculator, or shifting posture. Instantaneous alerts punish normal studying behavior, frustrating students into turning focus tracking off. A 3-second sliding state machine filters transient head turns while reliably catching genuine phone scrolling or desk departures.
  - **Honoring Structured Study Cycles:** Pomodoro and Deep Work rely on guilt-free rest intervals. Exempting `yellow` break phases lets students check their phone or stretch during breaks without polluting their focus score.

---

## 3. WebGL GPU Budget State Machine

### 3.1 Why Procedural 3D Primitives (Zero `.glb`/`.gltf` Models)
- **Decision:** Construct all study rooms, furniture, and bobbing avatars procedurally from Three.js / React Three Fiber / Drei geometric primitives.
- **Why we chose it:** External 3D asset pipelines introduce multi-megabyte network payloads, texture decompression spikes in VRAM, and licensing/asset-loading failures on slow connections. Procedural low-poly geometry keeps bundle weight tiny, guarantees visual consistency across Math/Physics/Chemistry rooms, and stays well inside integrated-GPU memory budgets.

### 3.2 Why Toggling `<Canvas frameloop="never">` Instead of Unmounting `<Canvas>`
- **Decision:** Keep the R3F `<Canvas>` mounted while the student is inside a 3D room, and toggle `frameloop={is3DPaused ? "never" : "always"}` whenever the whiteboard, AI overlay, or browser tab backgrounding (`visibilitychange`) occurs.
- **Why we chose it:**
  - **Preventing Multi-Workload Thermal Throttling:** When a student opens the collaborative whiteboard or AI visualizer at a table, the browser is already running LiveKit WebRTC audio/video, 3–5 FPS CV inference, and high-frequency HTML5 `<canvas>` pointer rendering. Continuing to render a hidden 60 FPS 3D room behind a full-screen overlay wastes GPU budget and causes sluggish pen input.
  - **Avoiding WebGL Context Churn:** If we freed GPU cycles by *unmounting* `<Canvas>` every time the whiteboard opened, Three.js would destroy the WebGL context, discard compiled shaders, reset orbital camera state, and risk hitting browser WebGL context creation limits on repeated open/close cycles. `frameloop="never"` drops 3D frame rendering cost to zero instantaneously while keeping GPU buffers warm—and because Supabase Presence keeps mutating in-memory refs while paused, closing the whiteboard resumes on frame 1 with zero lag and up-to-date peer positions.

---

## 4. AI Whiteboard Enhancement & Double SVG Sanitization

### 4.1 Why Native HTML5 `<canvas>` + Layered `<svg>` Overlay
- **Decision:** Build the table board as a lightweight two-layer stack: a bottom HTML5 `<canvas>` for freehand strokes/shapes and a synchronized `<svg>` overlay layer above it for Gemini-generated STEM diagrams (`@google/genai` Flash with structured JSON `responseSchema`).
- **Why we chose it:**
  - **Best Representation for Each Medium:** Freehand student sketches map naturally to fast 2D `<canvas>` paths and export cleanly via `toDataURL("image/png")` for multimodal Gemini vision analysis. Conversely, AI-generated physics free-body diagrams, geometric proofs, and chemical structures are far crisper, smaller over WebSockets, and easier to reveal step-by-step as structured vector `<svg>` than raster images.
  - **Non-Destructive Collaboration:** Separating the AI `<svg>` overlay from the `<canvas>` layer lets students step forward/backward through AI explanation stages or toggle the overlay off without erasing their original handwritten work underneath.
  - **Bundle Discipline:** Avoids multi-megabyte third-party whiteboard frameworks whose internal scene graphs conflict with custom Realtime Broadcast batching and AI step overlays.

### 4.2 Why Double SVG Sanitization (Server Route + Every Receiving Client)
- **Decision:** Strip dangerous SVG constructs (`<script>`, `<foreignObject>`, `<iframe/object/embed>`, `on*` event attributes, `javascript:` / external `href` URLs) **twice**: first on the server inside `POST /api/ai/whiteboard`, and again on **every client** (both requester and table peers) via `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: false } })` immediately before rendering.
- **Why we chose it:** Unlike PNG/JPEG images, inline SVG is live DOM markup capable of executing arbitrary JavaScript (Stored/Reflected XSS). Our collaborative flow has **two separate untrusted boundaries**:
  1. **Untrusted LLM Output Boundary:** Prompt injection (e.g., adversarial text written on a canvas sketch or typed into a topic prompt) could coax the model into emitting `<svg onload="...">` or `<foreignObject>`. Server-side stripping ensures unsafe markup never leaves our API boundary.
  2. **Untrusted Peer Broadcast Boundary:** Supabase Realtime Broadcast is a low-latency peer-published pub/sub channel—messages do **not** pass through our Next.js server before reaching tablemates. If we relied solely on server-side sanitization, a malicious user at a table could open browser DevTools and publish a crafted `whiteboard:ai_overlay` broadcast event directly to `table:{roomSlug}:{tableId}`, executing XSS in every tablemate's browser. Mandatory client-side `DOMPurify` enforcement before DOM injection neutralizes both vectors completely.
