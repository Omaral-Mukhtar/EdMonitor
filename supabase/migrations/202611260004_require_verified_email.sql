-- Sprint 0 Requirement Update: Require verified non-anonymous email users across app tables

alter table public.profiles
  alter column is_guest set default false;

create policy "profiles_require_non_anonymous"
  on public.profiles
  as restrictive
  for all
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
  with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "study_sessions_require_non_anonymous"
  on public.study_sessions
  as restrictive
  for all
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
  with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

create policy "distraction_logs_require_non_anonymous"
  on public.distraction_logs
  as restrictive
  for all
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false)
  with check ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

alter policy "courses_public_read" on public.courses
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

alter policy "cohorts_public_read" on public.cohorts
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

alter policy "cohort_courses_public_read" on public.cohort_courses
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

alter policy "tas_public_read" on public.tas
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

alter policy "ta_rooms_public_read" on public.ta_rooms
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);

alter policy "ta_bookings_public_read" on public.ta_bookings
  to authenticated
  using ((select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)) = false);
