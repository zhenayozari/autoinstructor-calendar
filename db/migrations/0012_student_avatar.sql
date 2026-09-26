alter table public.student_accesses
  add column if not exists student_photo_url text;
