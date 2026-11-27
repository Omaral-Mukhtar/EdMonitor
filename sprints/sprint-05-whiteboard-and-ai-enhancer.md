# Sprint 5 — Solo Whiteboard, R3F Pause, Math-Only AI & Deterministic Math 2 Plotter

## 1. Goal & Strict Scope

- **Goal:** Build the **strictly student-only (solo)** `1200 × 800` HTML5 `<canvas>` whiteboard in local state, R3F `frameloop="never"` GPU pause when the solo whiteboard/AI overlay is open, `POST /api/ai/whiteboard` (`@google/genai`, `GEMINI_MODEL=gemini-3.8-flash`) scoped strictly to **Math** with `src/lib/ai/math-syllabus.ts` guardrails, deterministic `MathPlotSpec` Cartesian SVG plotting via an allowlisted `mathjs` evaluator, auto-dimming student canvas when a plot is active (with toggle), and double SVG sanitization using `isomorphic-dompurify`.
- **In Scope:**
  - **Strictly Solo Whiteboard (Zero Whiteboard Broadcast)**:
    - All strokes, undo history, clear state, active AI steps, and rendered `MathPlotSpec` overlays live in **local component/hook state only**.
    - Do **NOT** add `whiteboard:stroke`, `whiteboard:undo`, `whiteboard:clear`, `whiteboard:ai_overlay`, `whiteboard:ai_step`, or late-joiner whiteboard snapshot sync to `useTableBroadcast.ts` or Supabase Broadcast (`useTableBroadcast.ts` keeps only `timer:sync` and topic-room `chat:message`).
  - `src/components/whiteboard/WhiteboardOverlay.tsx` (`z-40 fixed inset-3` modal): sets `isWhiteboardOpen = true` so R3F `<Canvas frameloop="never">` immediately on open and resumes `frameloop="always"` on close.
  - `src/components/whiteboard/WhiteboardCanvas.tsx`: native HTML5 `<canvas>` mapped to a fixed `1200 × 800` virtual coordinate space (`Pen`, `Line`, `Rect`, `Circle`, `Eraser`, 5 STEM ink swatches, stroke width, `Undo`, `Clear`, empty watermark), plus **auto-dimming opacity** when an AI plot/overlay is active (controlled with a `[Dim Sketch: ON/OFF]` toggle).
  - `src/lib/ai/math-syllabus.ts`: structured syllabus config containing `allowedFormulas` (**1 complete starter entry for Math 2 Area Between Curves** + `TODO` placeholders for remaining Math topics), `forbiddenMethods`, and `requiredStepOrder`.
  - `src/lib/ai/math-eval.ts` & `src/lib/ai/math-plotter.ts`: strictly allowlisted `mathjs` AST validator/evaluator and deterministic `MathPlotSpec` -> `1200 × 800` SVG renderer supporting `y = f(x)` (`y_of_x`) and `x = g(y)` (`x_of_y`) curves, asymptote/domain discontinuity path breaks, intersection points, `shadedRegions[]` array (for crossing curves), and `dx`/`dy` representative slices.
  - `src/lib/ai/prompts.ts` & `src/lib/ai/sanitizeSvg.ts`: Math-only `@google/genai` `responseSchema` (including `plotSpec`), `process.env.GEMINI_MODEL` (`gemini-3.8-flash`), and **double SVG sanitization** with `isomorphic-dompurify` on both server (`sanitizeSvgServer`) and client (`sanitizeSvgClient`).
  - `POST /api/ai/whiteboard` (`src/app/api/ai/whiteboard/route.ts`): `enhance` & `generate` modes, Math-only validation (`subject === "math"`, `400 VALIDATION_ERROR` otherwise), Zod validation (`2 MB` PNG cap, `1000` char prompt cap), 10 req/min/user rate limiter (`429`), 25s `AbortController` timeout (`504`), single retry on `429`/`503`, `502` on invalid AI output, and server-side `sanitizeSvgServer`.
  - `src/components/whiteboard/AiEnhancerPanel.tsx` & `SvgOverlayLayer.tsx`: `Explain & Enhance Sketch` / `Explain Math Topic & Plot` tabs, syllabus topic selector, skeleton loading + `[Cancel]`, `flaggedMistake` amber callout, overlay/dim toggles, and local step navigation (`< Prev Step`, `Next Step >`).
- **Out of Scope:**
  - Multiplayer whiteboard stroke or AI step sync (explicitly excluded — solo only).
  - Changes to `/ta-scheduler` or `/campus` map.
  - Full E2E cross-sprint QA audit (Sprint 6).

---

## 2. Docs to Read First

- `docs/REQUIREMENTS.md` — §2 (Solo Whiteboard), §4 (Math-Only AI Visualization Enhancer & Deterministic Plotter), §7 (WebGL GPU Budget, Security).
- `docs/design/ARCHITECTURE.md` — §3 (WebGL GPU Budget State Machine), §4 (Solo AI Whiteboard Enhancement, MathPlot & Double SVG Sanitization).
- `docs/design/AI_PROMPTS.md` — §1–§6 (Math-Only Persona, `math-syllabus.ts`, `MathPlotSpec` & allowlisted `mathjs`, `1200x800` SVG Rules, `responseSchema`, `gemini-3.8-flash`, Double Sanitization).
- `docs/design/API_CONTRACT.md` — §5 (`POST /api/ai/whiteboard`).
- `docs/design/DB_SCHEMA.md` — §3 (Solo Whiteboard Isolation note; `timer:sync` + topic-room `chat:message` only).
- `docs/design/UI_UX.md` — §3 Screen 3 (Solo Whiteboard + Math AI Enhancer & Plotter Overlay wireframe), §4D (Whiteboard Canvas & AI Enhancer Panel fallbacks).

---

## 3. Target Files & Modules

- `src/app/api/ai/whiteboard/route.ts`
- `src/lib/ai/math-syllabus.ts`
- `src/lib/ai/math-eval.ts` (strictly allowlisted `mathjs` parser/evaluator)
- `src/lib/ai/math-plotter.ts` (deterministic `MathPlotSpec` -> `1200 × 800` SVG generator)
- `src/lib/ai/prompts.ts`
- `src/lib/ai/sanitizeSvg.ts`
- `src/lib/whiteboard-coords.ts` (`1200 × 800` coordinate normalization & canvas/SVG alignment helpers)
- `src/components/whiteboard/WhiteboardOverlay.tsx`
- `src/components/whiteboard/WhiteboardCanvas.tsx`
- `src/components/whiteboard/SvgOverlayLayer.tsx`
- `src/components/whiteboard/AiEnhancerPanel.tsx`
- `src/components/room3d/StudyRoomScene.tsx` (connect `isWhiteboardOpen` to `is3DPaused`)
- `src/lib/ai/__tests__/sanitize-svg.test.ts`
- `src/lib/ai/__tests__/math-plotter.test.ts`
- `src/app/api/ai/whiteboard/__tests__/ai-whiteboard-route.test.ts`
- `src/lib/__tests__/whiteboard-coords.test.ts`

---

## 4. Ordered Implementation Checklist

- [x] Install `isomorphic-dompurify`, `@google/genai`, and `mathjs`.
- [x] Implement `src/lib/ai/sanitizeSvg.ts` using `isomorphic-dompurify` on **both** the server (`sanitizeSvgServer(svg)`) and the client (`sanitizeSvgClient(svg)`) with strict `USE_PROFILES: { svg: true, svgFilters: false }`, `FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed", "style"]`, and `FORBID_ATTR` (blocking `on*` handlers and `javascript:` / external `href` / `xlink:href` URLs)—never use a custom regex SVG sanitizer.
- [x] Implement `src/lib/ai/math-syllabus.ts` with typed `MathSyllabusTopic` definitions containing `allowedFormulas`, `forbiddenMethods`, and `requiredStepOrder`: 1 real complete starter entry for `math2-area-between-curves`, plus `TODO` placeholder entries for remaining Math topics.
- [x] Implement `src/lib/ai/math-eval.ts` (AST-validated, strictly allowlisted `mathjs` evaluator blocking `import`, `eval`, assignments, strings, matrices, and unknown symbols) and `src/lib/ai/math-plotter.ts` rendering `MathPlotSpec` onto `1200 × 800` SVG with `y = f(x)` & `x = g(y)` curves, asymptote/domain path breaks, intersection dots/labels, `shadedRegions[]` (for crossing curves), and `dx`/`dy` representative slices.
- [x] Implement `src/lib/ai/prompts.ts` matching `AI_PROMPTS.md` (Math-only persona, syllabus injection, `1200x800` SVG rules, `enhance` & `generate` prompts, `whiteboardAiResponseSchema` with `plotSpec`).
- [x] Implement `POST /api/ai/whiteboard` with auth check (`401`), Math-only + payload size/Zod validation (`400`/`413`), per-user rate limit (`429`), 25s `AbortController` timeout (`504`), 1 retry on `429`/`503`, `responseSchema` call to `process.env.GEMINI_MODEL`, and server-side `sanitizeSvgServer`.
- [x] Implement `src/lib/whiteboard-coords.ts` mapping pointer events on any viewport size to/from the `1200 × 800` virtual coordinate space.
- [x] Build `WhiteboardCanvas.tsx` (local-only strokes/undo/clear + auto-dim opacity when an AI plot is active with toggle), `SvgOverlayLayer.tsx` (`viewBox="0 0 1200 800"` combining deterministic `MathPlotSpec` SVG + `sanitizeSvgClient`), `AiEnhancerPanel.tsx`, and `WhiteboardOverlay.tsx` (`z-40 fixed inset-3`, strictly local state—zero `whiteboard:*` Broadcast calls).
- [x] Connect `isWhiteboardOpen` in `StudyRoomScene.tsx` so `<Canvas frameloop={is3DPaused ? "never" : "always"}>` pauses 3D rendering while keeping CV and (in Topic A/V rooms) LiveKit active.
- [x] Write Vitest tests for `sanitizeSvg.ts` XSS vectors, `math-eval.ts` allowlist security + `math-plotter.ts` (`y_of_x`, `x_of_y`, asymptote breaks, crossing `shadedRegions[]`, `dx`/`dy` slices), `whiteboard-coords.ts`, and `POST /api/ai/whiteboard`.

---

## 5. Success Criteria (Pass / Fail)

- [x] Opening the solo whiteboard sets R3F `<Canvas frameloop="never">` (zero 3D render ticks / GPU draw calls while open) and restores `frameloop="always"` on close without losing WebGL context or peer Presence positions.
- [x] All whiteboard drawing, undo/clear, AI responses, and step navigation remain strictly solo (local browser state) — WebSocket inspection confirms zero `whiteboard:*` Broadcast frames on `table:{roomSlug}:{tableId}`.
- [x] `POST /api/ai/whiteboard` enforces `subject === "math"` (`400` otherwise), injects `math-syllabus.ts` rules into Gemini (`GEMINI_MODEL=gemini-3.8-flash`), and returns sanitized SVG + optional `plotSpec`.
- [x] `math-plotter.ts` deterministically renders `y = f(x)`, `x = g(y)`, asymptote breaks (e.g., `1/x`), intersections, crossing-curve `shadedRegions[]`, and `dx`/`dy` slices on the `1200 × 800` SVG layer, while auto-dimming the student's freehand canvas (with working toggle).
- [x] Allowlisted `mathjs` evaluator rejects unsafe expressions (e.g., `import`, `eval`, assignment) and both server-side and client-side `isomorphic-dompurify` strip `<script>`, `<foreignObject>`, `onload=`, `onclick=`, and `javascript:` URLs.
- [x] All unit/integration tests, `npx tsc --noEmit`, `npm run lint`, and `npm run build` pass.

---

## 6. Testing & Verification Gate (Run Before Stopping)

- **Automated tests (Vitest):**
  - Run `npm test` covering:
    - `sanitizeSvg.ts` against XSS payloads (`<script>`, `<foreignObject>`, `<svg onload=...>`, `<a xlink:href="javascript:...">`, `<iframe/>`, `<style>`).
    - `math-eval.ts` & `math-plotter.ts` (blocks unsafe `mathjs` inputs, handles `y_of_x` & `x_of_y`, splits `1/x` across `x=0` without vertical bridge lines, renders multi-interval `shadedRegions[]` & `dx`/`dy` slices).
    - `whiteboard-coords.ts` (`1200 × 800` coordinate mapping round-trips).
    - `POST /api/ai/whiteboard` (`401`, `400` non-math subject, `413` oversized PNG, `429` rate limit, `504` timeout, `502` malformed Gemini JSON, mocked `@google/genai` success with `plotSpec`).
- **Static & build checks:**
  - Run `npx tsc --noEmit && npm run lint && npm run build`.
- **Browser / runtime checks:**
  - Open `/campus/math-2-integrals` (and verify also in `/campus/general-quiet-hall`), open `My Whiteboard & AI` -> verify `[3D Paused]` badge & `frameloop="never"` while CV remains active, and verify zero `whiteboard:*` Broadcast frames are emitted.
  - Sketch a curve, test `Explain & Enhance Sketch`, verify `flaggedMistake` amber callout and auto-dimmed canvas (`[Dim Sketch: ON/OFF]`).
  - Test `Explain Math Topic & Plot` for Math 2 Area Between Curves (e.g., crossing curves `y = x^3` and `y = x` or `x = y^2` and `x = y + 2`) -> verify progressive steps, shaded regions, `dx`/`dy` slice, and asymptote handling (`1/x`).

---

## 7. HARD STOP GATE

**DO NOT begin the next sprint automatically.** Before finishing Sprint 5:
1. Mark all completed `- [ ]` checkboxes in this file as `- [x]`.
2. Update Sprint 5's `Status` to `Done` in [`sprints/README.md`](./README.md).
3. Summarize all files created/modified and report the exact `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and browser/runtime verification results.
4. **STOP** and wait for explicit user approval before starting Sprint 6.
