alter table public.student_accesses
  add column if not exists passed_exam boolean not null default false;
