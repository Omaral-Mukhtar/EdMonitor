-- EdMonitor Sprint 0: Core Schema, Indexes, RLS Policies, and 3-Way TA Exclusion Constraints

create extension if not exists btree_gist;

-- 1. Profiles (mirrors auth.users, supporting both Guest Anonymous and Email accounts)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 32),
  avatar_color text not null default '#2563EB' check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_guest boolean not null default true,
  current_streak_days integer not null default 0 check (current_streak_days >= 0),
  last_study_date date,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- 2. Study Sessions
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (subject in ('math', 'physics', 'chemistry')),
  room_slug text not null,
  table_id text,
  technique text not null check (technique in ('pomodoro', 'deep_work', 'feynman', 'flowtime')),
  synced_with_table boolean not null default false,
  focused_seconds integer not null default 0 check (focused_seconds >= 0),
  distraction_count integer not null default 0 check (distraction_count >= 0),
  focus_score_pct integer check (focus_score_pct between 0 and 100),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists idx_study_sessions_user_id
  on public.study_sessions (user_id);

create index if not exists idx_study_sessions_user_started
  on public.study_sessions (user_id, started_at desc);

alter table public.study_sessions enable row level security;

create policy "study_sessions_select_own"
  on public.study_sessions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "study_sessions_insert_own"
  on public.study_sessions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "study_sessions_update_own"
  on public.study_sessions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 3. Distraction Logs
create table if not exists public.distraction_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason in ('cell_phone', 'face_absent', 'look_away')),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  triggered_at timestamptz not null default now()
);

create index if not exists idx_distraction_logs_session_id
  on public.distraction_logs (session_id);

create index if not exists idx_distraction_logs_user_id
  on public.distraction_logs (user_id);

alter table public.distraction_logs enable row level security;

create policy "distraction_logs_select_own"
  on public.distraction_logs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "distraction_logs_insert_own"
  on public.distraction_logs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- 4. Courses (STEM catalog)
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  subject text not null check (subject in ('math', 'physics', 'chemistry')),
  title text not null
);

alter table public.courses enable row level security;

create policy "courses_public_read"
  on public.courses
  for select
  to anon, authenticated
  using (true);

-- 5. Cohorts
create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  student_count integer not null check (student_count > 0)
);

alter table public.cohorts enable row level security;

create policy "cohorts_public_read"
  on public.cohorts
  for select
  to anon, authenticated
  using (true);

-- 6. Cohort-Courses Join Table
create table if not exists public.cohort_courses (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  primary key (cohort_id, course_id)
);

create index if not exists idx_cohort_courses_course_id
  on public.cohort_courses (course_id);

alter table public.cohort_courses enable row level security;

create policy "cohort_courses_public_read"
  on public.cohort_courses
  for select
  to anon, authenticated
  using (true);

-- 7. Teaching Assistants
create table if not exists public.tas (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  display_name text not null,
  email text not null unique
);

create index if not exists idx_tas_course_id
  on public.tas (course_id);

alter table public.tas enable row level security;

create policy "tas_public_read"
  on public.tas
  for select
  to anon, authenticated
  using (true);

-- 8. TA Discussion Rooms
create table if not exists public.ta_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  capacity integer not null check (capacity > 0)
);

alter table public.ta_rooms enable row level security;

create policy "ta_rooms_public_read"
  on public.ta_rooms
  for select
  to anon, authenticated
  using (true);

-- 9. TA Bookings with Atomic 3-Way Exclusion Constraints
create table if not exists public.ta_bookings (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  ta_id uuid not null references public.tas (id) on delete cascade,
  room_id uuid not null references public.ta_rooms (id) on delete cascade,
  topic text not null check (char_length(btrim(topic)) between 1 and 160),
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_range tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint chk_ta_bookings_time_order check (ends_at > starts_at)
);

create index if not exists idx_ta_bookings_course_id
  on public.ta_bookings (course_id);

create index if not exists idx_ta_bookings_cohort_id
  on public.ta_bookings (cohort_id);

create index if not exists idx_ta_bookings_ta_id
  on public.ta_bookings (ta_id);

create index if not exists idx_ta_bookings_room_id
  on public.ta_bookings (room_id);

create index if not exists idx_ta_bookings_created_by
  on public.ta_bookings (created_by);

alter table public.ta_bookings
  add constraint excl_ta_booking_cohort_overlap
  exclude using gist (cohort_id with =, time_range with &&)
  where (status = 'scheduled');

alter table public.ta_bookings
  add constraint excl_ta_booking_ta_overlap
  exclude using gist (ta_id with =, time_range with &&)
  where (status = 'scheduled');

alter table public.ta_bookings
  add constraint excl_ta_booking_room_overlap
  exclude using gist (room_id with =, time_range with &&)
  where (status = 'scheduled');

alter table public.ta_bookings enable row level security;

create policy "ta_bookings_public_read"
  on public.ta_bookings
  for select
  to anon, authenticated
  using (true);
