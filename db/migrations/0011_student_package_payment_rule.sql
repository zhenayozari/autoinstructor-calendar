alter table public.student_lesson_packages
  add column if not exists payment_rule_override text;

alter table public.student_lesson_packages
  drop constraint if exists student_lesson_packages_payment_rule_override_check;

alter table public.student_lesson_packages
  add constraint student_lesson_packages_payment_rule_override_check
  check (
    payment_rule_override is null
    or payment_rule_override in ('manual', 'prepaid', 'settle_later')
  );
