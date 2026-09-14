-- Usage:
-- psql "$DATABASE_URL" \
--   -v old_base='https://PROJECT.supabase.co/storage/v1/object/public' \
--   -v new_base='/uploads' \
--   -f scripts/migration/rewrite-storage-urls.sql

\if :{?old_base}
\else
  \echo 'Missing psql variable: old_base'
  \quit 1
\endif

\if :{?new_base}
\else
  \echo 'Missing psql variable: new_base'
  \quit 1
\endif

begin;

update public.instructors
set photo_url = replace(photo_url, :'old_base', :'new_base')
where photo_url like :'old_base' || '%';

update public.organization_site_settings
set landing_content = replace(
  landing_content::text,
  :'old_base',
  :'new_base'
)::jsonb
where landing_content::text like '%' || :'old_base' || '%';

commit;

