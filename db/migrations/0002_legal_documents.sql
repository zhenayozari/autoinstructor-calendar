create table if not exists public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  document_type text not null,
  title text not null,
  version_label text,
  original_file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null,
  status text not null default 'draft',
  published_at timestamptz,
  created_by_member_id uuid
    references public.organization_members(id)
    on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint legal_documents_type_check check (
    document_type in ('offer', 'privacy_policy', 'personal_data_consent')
  ),
  constraint legal_documents_status_check check (
    status in ('draft', 'published')
  ),
  constraint legal_documents_title_length check (
    length(trim(title)) between 1 and 180
  ),
  constraint legal_documents_version_label_length check (
    version_label is null or length(version_label) <= 80
  ),
  constraint legal_documents_file_name_length check (
    length(original_file_name) <= 240
  ),
  constraint legal_documents_storage_path_length check (
    length(storage_path) <= 500
  ),
  constraint legal_documents_mime_type_check check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  constraint legal_documents_file_size_check check (
    file_size_bytes > 0 and file_size_bytes <= 10485760
  ),
  constraint legal_documents_published_at_check check (
    (status = 'published' and published_at is not null)
    or (status = 'draft')
  )
);

create unique index if not exists legal_documents_one_published_per_type_idx
  on public.legal_documents(organization_id, document_type)
  where status = 'published';

create index if not exists legal_documents_organization_type_created_idx
  on public.legal_documents(organization_id, document_type, created_at desc);

create or replace function public.set_legal_documents_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_legal_documents_updated_at_trigger'
  ) then
    create trigger set_legal_documents_updated_at_trigger
    before update
    on public.legal_documents
    for each row
    execute function public.set_legal_documents_updated_at();
  end if;
end;
$$;
