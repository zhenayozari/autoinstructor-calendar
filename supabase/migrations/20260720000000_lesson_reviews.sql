create table public.lesson_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,
  student_access_id uuid not null
    references public.student_accesses(id)
    on delete cascade,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_reviews_rating_check check (rating between 1 and 5),
  constraint lesson_reviews_comment_length check (
    comment is null or length(comment) <= 1000
  ),
  constraint lesson_reviews_booking_unique unique (booking_id)
);

create index lesson_reviews_organization_created_idx
  on public.lesson_reviews(organization_id, created_at desc);

create index lesson_reviews_instructor_created_idx
  on public.lesson_reviews(instructor_id, created_at desc);

create index lesson_reviews_student_access_idx
  on public.lesson_reviews(student_access_id);

alter table public.lesson_reviews enable row level security;

revoke all on public.lesson_reviews from anon, authenticated;
grant select, insert, update on public.lesson_reviews to authenticated;

create policy "Organization members can read lesson reviews"
  on public.lesson_reviews
  for select
  to authenticated
  using (public.is_organization_member(organization_id));

create policy "Organization members can create lesson reviews"
  on public.lesson_reviews
  for insert
  to authenticated
  with check (public.is_organization_member(organization_id));

create policy "Organization members can update lesson reviews"
  on public.lesson_reviews
  for update
  to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
