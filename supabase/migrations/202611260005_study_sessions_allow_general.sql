-- Sprint 2: Allow 'general' in study_sessions.subject alongside 'math' (and existing 'physics', 'chemistry')

alter table public.study_sessions
  drop constraint if exists study_sessions_subject_check;

alter table public.study_sessions
  add constraint study_sessions_subject_check
  check (subject in ('math', 'general', 'physics', 'chemistry'));
