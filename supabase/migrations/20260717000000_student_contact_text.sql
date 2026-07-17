alter table public.student_accesses
  drop constraint if exists student_accesses_phone_length;

alter table public.student_accesses
  add constraint student_accesses_contact_length check (
    student_phone is null or length(trim(student_phone)) <= 200
  );

alter table public.student_registration_requests
  drop constraint if exists student_registration_requests_phone_length;

alter table public.student_registration_requests
  add constraint student_registration_requests_contact_length check (
    student_phone is null or length(trim(student_phone)) <= 200
  );
