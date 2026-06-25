drop policy if exists "Active instructors are publicly readable"
on public.instructors;

create policy "Visible instructors are publicly readable"
  on public.instructors
  for select
  to anon, authenticated
  using (is_active and public_is_visible);

create policy "Visible instructor capabilities are publicly readable"
  on public.instructor_capabilities
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.instructors
      where instructors.id = instructor_capabilities.instructor_id
        and instructors.is_active
        and instructors.public_is_visible
    )
  );

grant select on public.instructor_capabilities to anon, authenticated;
