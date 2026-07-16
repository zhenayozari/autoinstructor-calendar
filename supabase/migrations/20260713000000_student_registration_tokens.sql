alter table public.instructor_settings
add column student_registration_token text not null
  default (
    replace(gen_random_uuid()::text, '-', '') ||
    replace(gen_random_uuid()::text, '-', '')
  ),
add column student_registration_enabled boolean not null default true,
add column student_registration_token_updated_at timestamptz not null default now();

create unique index instructor_settings_student_registration_token_idx
  on public.instructor_settings(student_registration_token);

alter table public.instructor_settings
add constraint instructor_settings_student_registration_token_not_blank check (
  length(trim(student_registration_token)) >= 32
);
