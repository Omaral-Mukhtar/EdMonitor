# EdMonitor — API Contract

Defines all Next.js App Router backend endpoints (`src/app/api/**/route.ts`) connecting [`UI_UX.md`](./UI_UX.md) with [`DB_SCHEMA.md`](./DB_SCHEMA.md) and [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 1. Conventions, Auth & Standard Error Format

- **Base path**: `/api/*` (Next.js App Router Route Handlers).
- **Content-Type**: `application/json` for all request and response bodies.
- **Authentication**:
  - All app routes (`/campus*`, `/ta-scheduler*`) and `/api/*` endpoints require a valid **verified-email** Supabase Auth session (`!user.is_anonymous && Boolean(user.email_confirmed_at)`), managed by `@supabase/ssr` and `/auth/callback`. Anonymous and unverified email accounts are rejected (`401 UNAUTHORIZED` on APIs, redirect to `/` on pages).

### Standard Error Response

All non-`2xx` responses (except `409 Conflict` on TA booking, which extends this shape with `conflicts` and `suggestions`) return:

```json
{
  "error": "VALIDATION_ERROR",
  "message": "Human-readable explanation of what failed.",
  "details": {
    "field": "Optional structured context"
  }
}
```

| Status | Error Code | When Used |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Missing/invalid JSON fields, bad enum, `endsAt <= startsAt`, non-Math AI subject |
| `401` | `UNAUTHORIZED` | Missing or expired Supabase session cookie |
| `403` | `FORBIDDEN` | Resource belongs to another `user_id`, or LiveKit requested for a `Silent` room (`allowAudioVideo === false`) |
| `404` | `NOT_FOUND` | Session, booking, or room/table slug does not exist |
| `409` | `BOOKING_CONFLICT` | Postgres `23P01` 3-way TA overlap (cohort, TA, or room) |
| `413` | `PAYLOAD_TOO_LARGE` | Whiteboard PNG or prompt exceeds size limit |
| `429` | `RATE_LIMITED` | Per-user AI or token request rate limit exceeded |
| `500` | `INTERNAL_ERROR` | Unexpected database or server failure |
| `502` | `UPSTREAM_AI_ERROR` | Gemini API returned an invalid or failed response |
| `504` | `UPSTREAM_TIMEOUT` | Gemini API call exceeded server timeout |

---

## 2. Profile & Auth Sync

### `GET /api/profile`
Fetch the current user's `public.profiles` row (used on `/campus` top nav for display name, avatar color, and streak).

- **Auth**: Required (Supabase session cookie).
- **Response (`200 OK`)**:
```json
{
  "profile": {
    "id": "uuid",
    "displayName": "Youssef",
    "avatarColor": "#2563EB",
    "isGuest": false,
    "currentStreakDays": 4,
    "lastStudyDate": "2026-11-25",
    "createdAt": "2026-11-25T18:00:00.000Z"
  }
}
```

### `PATCH /api/profile`
Create or update the current user's profile after display name or avatar color selection.

- **Auth**: Required (Supabase session cookie).
- **Request Body**:
```json
{
  "displayName": "Youssef",
  "avatarColor": "#2563EB"
}
```
  - `displayName`: `string` (1–32 chars, trimmed)
  - `avatarColor`: `string` (hex preset, optional)
- **Response (`200 OK`)**: Same shape as `GET /api/profile`.

---

## 3. Study Sessions, Distractions & Progress Dashboard

### `POST /api/sessions`
Start a new study session when the user begins a focus block in `/campus/[roomSlug]`.

- **Auth**: Required.
- **Request Body**:
```json
{
  "subject": "math",
  "roomSlug": "math-calculus",
  "tableId": "table-2",
  "technique": "pomodoro",
  "syncedWithTable": true
}
```
  - `subject`: `"math" | "general"` (active campus zones; validated against `campus-rooms.ts` and extensible for future subjects)
  - `roomSlug`: `string` (must match a valid room in `campus-rooms.ts`)
  - `tableId`: `string | null`
  - `technique`: `"pomodoro" | "deep_work" | "feynman" | "flowtime"`
  - `syncedWithTable`: `boolean`
- **Response (`201 Created`)**:
```json
{
  "session": {
    "id": "uuid",
    "userId": "uuid",
    "subject": "math",
    "roomSlug": "math-calculus",
    "tableId": "table-2",
    "technique": "pomodoro",
    "syncedWithTable": true,
    "focusedSeconds": 0,
    "distractionCount": 0,
    "focusScorePct": null,
    "startedAt": "2026-11-25T18:10:00.000Z",
    "endedAt": null
  }
}
```

### `PATCH /api/sessions/[sessionId]`
Checkpoint or end an active study session. When `endSession: true` is sent, the server sets `ended_at`, computes `focus_score_pct` (`0..100`), and updates `profiles.current_streak_days` / `last_study_date`.

- **Auth**: Required (must own `session.user_id`).
- **Request Body**:
```json
{
  "focusedSeconds": 1420,
  "distractionCount": 2,
  "tableId": "table-2",
  "technique": "pomodoro",
  "syncedWithTable": true,
  "endSession": true
}
```
- **Response (`200 OK`)**:
```json
{
  "session": {
    "id": "uuid",
    "focusedSeconds": 1420,
    "distractionCount": 2,
    "focusScorePct": 91,
    "endedAt": "2026-11-25T18:35:00.000Z"
  },
  "streak": {
    "currentStreakDays": 5,
    "lastStudyDate": "2026-11-25"
  }
}
```

### `POST /api/sessions/[sessionId]/distractions`
Log a distraction event after the client-side CV loop's **~3-second continuous grace period** triggers (`red` halo).

- **Auth**: Required (must own `session.user_id`).
- **Request Body**:
```json
{
  "reason": "cell_phone",
  "durationMs": 4200,
  "triggeredAt": "2026-11-25T18:18:30.000Z"
}
```
  - `reason`: `"cell_phone" | "face_absent" | "look_away"`
  - `durationMs`: `number` (integer `>= 0`)
  - `triggeredAt`: ISO-8601 UTC string
- **Response (`201 Created`)**:
```json
{
  "distractionLog": {
    "id": "uuid",
    "sessionId": "uuid",
    "reason": "cell_phone",
    "durationMs": 4200,
    "triggeredAt": "2026-11-25T18:18:30.000Z"
  }
}
```

### `GET /api/progress`
Fetch aggregated study metrics for the Progress Sheet drawer on `/campus`.

- **Auth**: Required.
- **Query Parameters**:
  - `days`: `number` (optional, default `30`, max `90`)
- **Response (`200 OK`)**:
  - `minutesBySubject` is typed extensibly (`Record<string, number>` with active campus keys `math` and `general` always initialized to `0`, plus any future subject keys present in `study_sessions`).
```json
{
  "currentStreakDays": 4,
  "totalFocusedMinutes": 410,
  "averageFocusScorePct": 89,
  "minutesBySubject": {
    "math": 250,
    "general": 160
  },
  "distractionBreakdown": {
    "cell_phone": 5,
    "face_absent": 2,
    "look_away": 3
  },
  "recentSessions": [
    {
      "id": "uuid",
      "subject": "math",
      "roomSlug": "math-calculus",
      "technique": "pomodoro",
      "focusedSeconds": 1500,
      "distractionCount": 1,
      "focusScorePct": 94,
      "startedAt": "2026-11-25T18:10:00.000Z",
      "endedAt": "2026-11-25T18:35:00.000Z"
    }
  ]
}
```

---

## 4. LiveKit Table Call Token

### `POST /api/livekit/token`
Mint a table-scoped LiveKit Cloud JWT using server-only `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

- **Auth**: Required.
- **Room Policy Enforcement**:
  - Resolves `roomSlug` against `campus-rooms.ts`: returns `404 NOT_FOUND` if the room does not exist.
  - Enforces `allowAudioVideo === true`: returns **`403 FORBIDDEN`** (`"Audio/video calls are disabled in General Study silent rooms."`) if `allowAudioVideo === false`.
- **Request Body**:
```json
{
  "roomSlug": "math-calculus",
  "tableId": "table-2"
}
```
- **Response (`200 OK`)**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "serverUrl": "wss://your-project.livekit.cloud",
  "roomName": "math-calculus:table-2",
  "participantIdentity": "uuid"
}
```

---

## 5. AI Whiteboard Enhancer & Math Plotter (Math-Only, Solo)

### `POST /api/ai/whiteboard`
Invoke Google Gemini (`@google/genai`) server-side to either explain/enhance a student's solo whiteboard PNG sketch (`mode: "enhance"`) or generate a step-by-step **Math-only** explanation with optional SVG annotations and deterministic `MathPlotSpec` Cartesian plot (`mode: "generate"`). Applies `src/lib/ai/math-syllabus.ts` guardrails and sanitizes all returned SVG markup with `isomorphic-dompurify` before responding.

- **Auth**: Required.
- **Rate Limit**: Max 10 requests / minute / user (`429 RATE_LIMITED`).
- **Request Body**:
```json
{
  "mode": "generate",
  "subject": "math",
  "roomSlug": "math-2-integrals",
  "tableId": "table-2",
  "topicId": "math2-area-between-curves",
  "prompt": "Find the area enclosed by y = x^2 and y = 2x"
}
```
  - `mode`: `"enhance" | "generate"`
  - `subject`: `"math"` (strictly Math-only; any other value returns `400 VALIDATION_ERROR`)
  - `roomSlug`: `string` (must be a valid campus room; usable from both Math and General Study rooms for solo Math work)
  - `tableId`: `string | null` (optional)
  - `topicId`: `string | null` (optional syllabus topic key from `math-syllabus.ts`, e.g., `"math2-area-between-curves"`)
  - `prompt`: `string` (required if `mode === "generate"`; optional if `mode === "enhance"`, max `1000` chars)
  - `canvasPngBase64`: `string` (required if `mode === "enhance"`, max `2 MB` decoded)
- **Response (`200 OK`)**:
```json
{
  "overlayId": "uuid",
  "mode": "generate",
  "subject": "math",
  "steps": [
    {
      "title": "Sketch curves & find intersections",
      "explanation": "Set x^2 = 2x to get x(x - 2) = 0, giving intersection points (0, 0) and (2, 4).",
      "flaggedMistake": null,
      "svg": "<svg viewBox=\"0 0 1200 800\" xmlns=\"http://www.w3.org/2000/svg\"></svg>",
      "plotSpec": {
        "domain": { "xMin": -1, "xMax": 3, "yMin": -1, "yMax": 5 },
        "curves": [
          { "id": "line", "orientation": "y_of_x", "expression": "2*x", "label": "y = 2x", "color": "#2563EB" },
          { "id": "parabola", "orientation": "y_of_x", "expression": "x^2", "label": "y = x^2", "color": "#0F172A" }
        ],
        "intersections": [
          { "x": 0, "y": 0, "label": "(0, 0)" },
          { "x": 2, "y": 4, "label": "(2, 4)" }
        ],
        "shadedRegions": [
          { "id": "region-1", "orientation": "dx", "upperExpr": "2*x", "lowerExpr": "x^2", "from": 0, "to": 2, "label": "Area" }
        ],
        "slices": [
          { "orientation": "dx", "at": 1, "fromExpr": "x^2", "toExpr": "2*x", "label": "dx" }
        ]
      }
    }
  ]
}
```

---

## 6. TA Discussion Scheduling (Standalone Module)

### `GET /api/ta-schedule/metadata`
Fetch pre-seeded courses, cohorts, cohort-course enrollments, TAs, and rooms for `/ta-scheduler`.

- **Auth**: Required (verified-email Supabase session).
- **Response (`200 OK`)**:
```json
{
  "courses": [{ "id": "uuid", "code": "MATH101", "subject": "math", "title": "Calculus I" }],
  "cohorts": [{ "id": "uuid", "code": "Y1-STEM-A", "label": "Year 1 STEM - Group A", "studentCount": 40 }],
  "cohortCourses": [{ "cohortId": "uuid", "courseId": "uuid" }],
  "tas": [{ "id": "uuid", "courseId": "uuid", "displayName": "TA Ali", "email": "ali@uni.edu" }],
  "rooms": [{ "id": "uuid", "code": "DISC-104", "label": "Discussion Room 104", "capacity": 45 }]
}
```

### `GET /api/ta-schedule`
List scheduled TA bookings for the weekly timetable grid.

- **Auth**: Required (verified-email Supabase session).
- **Query Parameters**:
  - `cohortId`: `uuid` (optional)
  - `taId`: `uuid` (optional)
  - `roomId`: `uuid` (optional)
  - `courseId`: `uuid` (optional)
  - `weekStart`: `YYYY-MM-DD` (optional, filters `starts_at` within `[weekStart, weekStart + 7d)`)
  - `status`: `"scheduled" | "cancelled"` (optional, default `"scheduled"`)
- **Response (`200 OK`)**:
```json
{
  "bookings": [
    {
      "id": "uuid",
      "courseId": "uuid",
      "courseCode": "MATH101",
      "subject": "math",
      "cohortId": "uuid",
      "cohortCode": "Y1-STEM-A",
      "taId": "uuid",
      "taName": "TA Ali",
      "roomId": "uuid",
      "roomCode": "DISC-104",
      "topic": "Integration by Parts",
      "status": "scheduled",
      "startsAt": "2026-11-26T10:00:00.000Z",
      "endsAt": "2026-11-26T11:00:00.000Z"
    }
  ]
}
```

### `POST /api/ta-schedule`
Create a TA discussion booking. Enforces 3-way overlap blocking atomically via Postgres `btree_gist` exclusion constraints.

- **Auth**: Required (verified-email Supabase session; supports 1-click TA Role Toggle without separate accounts).
- **Request Body**:
```json
{
  "courseId": "uuid",
  "cohortId": "uuid",
  "taId": "uuid",
  "roomId": "uuid",
  "topic": "Free-Body Diagrams & Friction",
  "startsAt": "2026-11-26T14:00:00.000Z",
  "endsAt": "2026-11-26T15:00:00.000Z"
}
```
- **Response (`201 Created`)**:
```json
{
  "booking": {
    "id": "uuid",
    "courseId": "uuid",
    "cohortId": "uuid",
    "taId": "uuid",
    "roomId": "uuid",
    "topic": "Free-Body Diagrams & Friction",
    "status": "scheduled",
    "startsAt": "2026-11-26T14:00:00.000Z",
    "endsAt": "2026-11-26T15:00:00.000Z"
  }
}
```
- **Response (`409 Conflict` — `TaBookingConflictResponse` from [`DB_SCHEMA.md`](./DB_SCHEMA.md))**:
```json
{
  "error": "BOOKING_CONFLICT",
  "message": "Slot blocked due to 2 overlapping constraint(s).",
  "conflicts": [
    {
      "dimension": "cohort",
      "bookingId": "uuid",
      "courseCode": "MATH101",
      "topic": "Linear Transformations",
      "startsAt": "2026-11-26T14:00:00.000Z",
      "endsAt": "2026-11-26T15:30:00.000Z"
    }
  ],
  "suggestions": [
    {
      "startsAt": "2026-11-26T15:30:00.000Z",
      "endsAt": "2026-11-26T16:30:00.000Z",
      "roomId": "uuid",
      "roomCode": "DISC-104"
    }
  ]
}
```

### `PATCH /api/ta-schedule/[bookingId]`
Cancel an existing scheduled booking (frees the cohort, TA, and room slots immediately because exclusion constraints apply `WHERE (status = 'scheduled')`).

- **Auth**: Required (verified-email Supabase session; 1-click TA Role Toggle).
- **Request Body**:
```json
{
  "status": "cancelled"
}
```
- **Response (`200 OK`)**:
```json
{
  "booking": {
    "id": "uuid",
    "status": "cancelled"
  }
}
```
