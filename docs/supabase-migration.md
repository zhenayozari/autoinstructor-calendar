# Supabase to Local PostgreSQL Migration Plan

This migration keeps the live Supabase-backed service untouched until a final,
planned cutover window. Do not push this branch to `main` while Vercel is wired
to auto-deploy from `main`.

## Target Runtime

- Next.js stays on the Russian VPS.
- PostgreSQL runs on the same VPS and listens only on `127.0.0.1`.
- Staff auth moves from Supabase Auth to `public.app_users`.
- Student auth keeps the existing `student_accesses.password_hash` values.
- Supabase Storage moves to local uploads or Russian S3.
- Application authorization moves from Supabase RLS to server-side checks.

## Runtime Switch

Keep production on Supabase until the imported PostgreSQL copy is verified.
The new backend is enabled only with:

```env
APP_BACKEND=postgres
DATABASE_URL=postgresql://autoinstructor:[PASSWORD]@127.0.0.1:5432/autoinstructor
APP_SESSION_SECRET=[LONG_RANDOM_SECRET_AT_LEAST_32_CHARACTERS]
UPLOADS_DIR=/var/www/autoinstructor/uploads
UPLOADS_PUBLIC_PATH=/uploads
```

When `APP_BACKEND` is missing or set to anything else, the app keeps using the
existing Supabase code paths.

## Local Migration Files

- `db/migrations/0001_initial.sql` creates the plain PostgreSQL schema.
- `scripts/migration/export-supabase.ps1` exports public data and Supabase auth users.
- `scripts/migration/export-storage.ps1` exports files from Supabase Storage.
- `scripts/migration/restore-local-postgres.ps1` creates the target schema, creates `app_users`, and restores public data.
- `scripts/migration/rewrite-storage-urls.sql` rewrites Supabase Storage URLs to the local uploads URL prefix.
- `scripts/migration/validate-source-counts.sql` and `scripts/migration/validate-counts.sql` produce source and target count reports.

## Safe Order

1. Build and test the plain PostgreSQL schema locally.
2. Export Supabase data into local files without locking or deleting anything.
3. Import into local PostgreSQL while preserving all UUID primary keys.
4. Compare table counts, future bookings, active students, instructors, and
   public settings between source and target.
5. Implement the app DB/auth/storage adapters behind an explicit environment
   switch.
6. Test locally against an imported database copy.
7. Deploy only after the imported copy behaves correctly.
8. During cutover, pause new bookings briefly, take a fresh export, import it,
   switch environment variables, run smoke tests, then reopen bookings.

## Dry Run Commands

Run these only against a test/local database first:

If PostgreSQL is installed but `psql` is not available in `PATH`, the empty
schema smoke test can be started with:

```powershell
pnpm db:apply-schema -- --database-url "postgresql://autoinstructor:[PASSWORD]@127.0.0.1:5432/autoinstructor_test"
```

Or, to avoid URL-encoding special password characters:

```powershell
$env:PGHOST="127.0.0.1"
$env:PGPORT="5432"
$env:PGDATABASE="autoinstructor_test"
$env:PGUSER="postgres"
$env:PGPASSWORD="[LOCAL_POSTGRES_PASSWORD]"
pnpm db:apply-schema
```

```powershell
./scripts/migration/export-supabase.ps1 `
  -DatabaseUrl "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" `
  -OutputDir "migration-output" `
  -PostgresBinDir "D:\Programs\PostgreSQL\17\bin"

./scripts/migration/export-storage.ps1 `
  -SupabaseUrl "https://PROJECT.supabase.co" `
  -ServiceRoleKey "[SERVICE_ROLE_KEY]" `
  -OutputDir "migration-output/storage"

./scripts/migration/restore-local-postgres.ps1 `
  -DatabaseUrl "postgresql://autoinstructor:[PASSWORD]@127.0.0.1:5432/autoinstructor" `
  -InputDir "migration-output" `
  -PostgresBinDir "D:\Programs\PostgreSQL\17\bin"
```

If the schema has already been applied to an empty test database, add
`-SkipSchema` to the restore command.

If direct PostgreSQL export from Supabase is blocked by IPv6, DNS, or pooler
behavior, use the API fallback. It reads `NEXT_PUBLIC_SUPABASE_URL` and
`SUPABASE_SECRET_KEY` from `.env.local`:

```powershell
pnpm migration:export-api

$env:PGHOST="127.0.0.1"
$env:PGPORT="5432"
$env:PGDATABASE="autoinstructortest"
$env:PGUSER="postgres"
$env:PGPASSWORD="[LOCAL_POSTGRES_PASSWORD]"
pnpm migration:restore-api
pnpm migration:validate-local
```

After copying `migration-output/storage/*` to the web server uploads directory,
rewrite stored public URLs:

```powershell
psql "postgresql://autoinstructor:[PASSWORD]@127.0.0.1:5432/autoinstructor" `
  -v old_base="https://PROJECT.supabase.co/storage/v1/object/public" `
  -v new_base="/uploads" `
  -f "scripts/migration/rewrite-storage-urls.sql"
```

## Data That Must Keep IDs

These IDs are part of the relational graph and must be copied exactly:

- `organizations.id`
- `app_users.id`, copied from Supabase `auth.users.id`
- `organization_members.id` and `organization_members.user_id`
- `instructors.id`
- `schedule_days.id`
- `slots.id`
- `bookings.id`
- `student_accesses.id`
- `student_lesson_packages.id`
- all foreign keys that point to those rows

## Password Strategy

Supabase Auth password hashes should not be treated as portable application
passwords. For staff users, import `auth.users.id` and email into `app_users`,
then generate new temporary passwords during migration and mark
`password_reset_required = true`.

Student PIN/password hashes are already application-owned in
`student_accesses.password_hash`, so they should be imported unchanged.

## Cutover Guardrails

- Keep the old Supabase project read-only but available until the new service
  has been stable.
- Before final export, temporarily disable booking/registration writes or show a
  short maintenance page.
- After import, check at minimum:
  - row counts for every business table;
  - all confirmed future bookings;
  - active instructors and active student accesses;
  - login for owner/instructor;
  - login for a test student;
  - booking a future slot;
  - profile image and landing image URLs.
- Only then point production env vars to local PostgreSQL.
