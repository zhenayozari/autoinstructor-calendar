alter table public.student_lesson_packages
  add column if not exists custom_price_amount integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_lesson_packages_custom_price_check'
  ) then
    alter table public.student_lesson_packages
      add constraint student_lesson_packages_custom_price_check
      check (custom_price_amount is null or custom_price_amount between 0 and 10000000);
  end if;
end $$;
