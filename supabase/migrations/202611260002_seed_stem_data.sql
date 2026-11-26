-- EdMonitor Sprint 0: Pre-seeded STEM Courses, Cohorts, Enrollments, TAs, and Rooms

insert into public.courses (code, subject, title)
values
  ('MATH101', 'math', 'Calculus I'),
  ('PHYS101', 'physics', 'Classical Mechanics & Waves'),
  ('CHEM101', 'chemistry', 'General & Organic Chemistry')
on conflict (code) do update
  set subject = excluded.subject,
      title = excluded.title;

insert into public.cohorts (code, label, student_count)
values
  ('Y1-STEM-A', 'Year 1 STEM - Group A', 40),
  ('Y1-STEM-B', 'Year 1 STEM - Group B', 38)
on conflict (code) do update
  set label = excluded.label,
      student_count = excluded.student_count;

insert into public.cohort_courses (cohort_id, course_id)
select c.id, cr.id
from public.cohorts c
cross join public.courses cr
where c.code in ('Y1-STEM-A', 'Y1-STEM-B')
  and cr.code in ('MATH101', 'PHYS101', 'CHEM101')
on conflict (cohort_id, course_id) do nothing;

insert into public.tas (course_id, display_name, email)
values
  ((select id from public.courses where code = 'MATH101'), 'TA Ali', 'ali.math@edmonitor.edu'),
  ((select id from public.courses where code = 'PHYS101'), 'TA Mai', 'mai.physics@edmonitor.edu'),
  ((select id from public.courses where code = 'CHEM101'), 'TA Nour', 'nour.chem@edmonitor.edu')
on conflict (email) do update
  set course_id = excluded.course_id,
      display_name = excluded.display_name;

insert into public.ta_rooms (code, label, capacity)
values
  ('DISC-104', 'Discussion Room 104', 45),
  ('LAB-B201', 'STEM Studio B201', 45),
  ('SEM-302', 'Seminar Room 302', 42)
on conflict (code) do update
  set label = excluded.label,
      capacity = excluded.capacity;
