alter table public.legal_documents
  add column if not exists show_on_site boolean not null default true;

create index if not exists legal_documents_site_visibility_idx
  on public.legal_documents(organization_id, document_type, status)
  where show_on_site = true;
