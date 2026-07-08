alter table public.student_accesses
  add column student_phone text;

alter table public.student_accesses
  add constraint student_accesses_phone_length check (
    student_phone is null or length(trim(student_phone)) <= 40
  );
