-- Lesson reviews are submitted through server actions after checking the
-- student session and completed booking. Direct authenticated access should
-- only allow scoped reads for staff.

revoke insert, update, delete on public.lesson_reviews from authenticated;
grant select on public.lesson_reviews to authenticated;

drop policy if exists "Organization members can read lesson reviews"
on public.lesson_reviews;

drop policy if exists "Organization members can create lesson reviews"
on public.lesson_reviews;

drop policy if exists "Organization members can update lesson reviews"
on public.lesson_reviews;

create policy "Staff can read manageable lesson reviews"
  on public.lesson_reviews
  for select
  to authenticated
  using (public.can_manage_instructor(instructor_id));
