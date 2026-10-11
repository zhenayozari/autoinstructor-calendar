alter table public.student_accesses
  add column if not exists exam_status text not null default 'training';

alter table public.student_accesses
  drop constraint if exists student_accesses_exam_status_check;

alter table public.student_accesses
  add constraint student_accesses_exam_status_check
  check (exam_status in ('training', 'passed', 'failed'));

update public.student_accesses
set exam_status = case
  when passed_exam then 'passed'
  else 'training'
end
where exam_status = 'training';

create index if not exists student_accesses_organization_exam_status_idx
  on public.student_accesses(organization_id, exam_status);
