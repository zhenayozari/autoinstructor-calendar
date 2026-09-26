alter table public.instructor_payout_settings
  add column if not exists can_manage_student_packages boolean not null default false;
