alter table public.legal_documents
  add column if not exists show_for_students boolean not null default true,
  add column if not exists show_for_staff boolean not null default true;

create index if not exists legal_documents_student_audience_idx
  on public.legal_documents(organization_id, document_type, status)
  where show_for_students = true;

create index if not exists legal_documents_staff_audience_idx
  on public.legal_documents(organization_id, document_type, status)
  where show_for_staff = true;
