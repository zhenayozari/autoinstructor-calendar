alter table public.student_prepaid_credits
  add column if not exists student_lesson_package_id uuid
    references public.student_lesson_packages(id) on delete restrict;

create index if not exists student_prepaid_credits_package_id_idx
  on public.student_prepaid_credits(student_lesson_package_id);
