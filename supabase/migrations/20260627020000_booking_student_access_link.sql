alter table public.bookings
  add column student_access_id uuid
    references public.student_accesses(id)
    on delete set null;

create index bookings_student_access_id_idx
  on public.bookings(student_access_id)
  where student_access_id is not null;
