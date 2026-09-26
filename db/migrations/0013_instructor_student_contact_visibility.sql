alter table public.instructors
  add column if not exists show_contact_in_student_cabinet boolean not null default false;
