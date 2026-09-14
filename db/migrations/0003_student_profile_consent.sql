alter table public.student_accesses
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists profile_completed_at timestamptz,
  add column if not exists personal_data_consent_at timestamptz,
  add column if not exists personal_data_consent_source text,
  add column if not exists personal_data_consent_ip text,
  add column if not exists personal_data_consent_user_agent text,
  add column if not exists personal_data_consent_document_ids uuid[] not null default '{}',
  add column if not exists personal_data_consent_document_versions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_accesses_first_name_length'
  ) then
    alter table public.student_accesses
      add constraint student_accesses_first_name_length check (
        first_name is null or length(trim(first_name)) between 1 and 80
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_accesses_last_name_length'
  ) then
    alter table public.student_accesses
      add constraint student_accesses_last_name_length check (
        last_name is null or length(trim(last_name)) between 1 and 80
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_accesses_consent_source_check'
  ) then
    alter table public.student_accesses
      add constraint student_accesses_consent_source_check check (
        personal_data_consent_source is null
        or personal_data_consent_source in (
          'student_first_login',
          'student_registration',
          'manual_confirmed_by_admin'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_accesses_profile_consent_consistency'
  ) then
    alter table public.student_accesses
      add constraint student_accesses_profile_consent_consistency check (
        profile_completed_at is null
        or personal_data_consent_at is not null
      );
  end if;
end;
$$;

alter table public.staff_invitations
  add column if not exists personal_data_consent_at timestamptz,
  add column if not exists personal_data_consent_source text,
  add column if not exists personal_data_consent_ip text,
  add column if not exists personal_data_consent_user_agent text,
  add column if not exists personal_data_consent_document_ids uuid[] not null default '{}',
  add column if not exists personal_data_consent_document_versions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'staff_invitations_consent_source_check'
  ) then
    alter table public.staff_invitations
      add constraint staff_invitations_consent_source_check check (
        personal_data_consent_source is null
        or personal_data_consent_source = 'staff_registration'
      );
  end if;
end;
$$;

create index if not exists student_accesses_profile_completed_idx
  on public.student_accesses(organization_id, profile_completed_at);

alter table public.organization_site_settings
  add column if not exists require_student_profile_consent boolean not null default true;

alter table public.student_registration_requests
  add column if not exists personal_data_consent_at timestamptz,
  add column if not exists personal_data_consent_source text,
  add column if not exists personal_data_consent_ip text,
  add column if not exists personal_data_consent_user_agent text,
  add column if not exists personal_data_consent_document_ids uuid[] not null default '{}',
  add column if not exists personal_data_consent_document_versions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'student_registration_requests_consent_source_check'
  ) then
    alter table public.student_registration_requests
      add constraint student_registration_requests_consent_source_check check (
        personal_data_consent_source is null
        or personal_data_consent_source = 'student_registration'
      );
  end if;
end;
$$;
