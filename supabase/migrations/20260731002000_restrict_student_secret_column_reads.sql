-- Staff may read student records through RLS, but secret hashes should never
-- be exposed to browser-side Supabase clients.

revoke select on public.student_accesses from authenticated;

grant select (
  id,
  organization_id,
  instructor_id,
  school_id,
  display_label,
  login,
  student_phone,
  total_lesson_limit,
  weekly_lesson_limit,
  is_active,
  is_archived,
  archived_at,
  created_at,
  updated_at
) on public.student_accesses to authenticated;

revoke select on public.student_registration_requests from authenticated;

grant select (
  id,
  organization_id,
  instructor_id,
  first_name,
  last_name,
  student_phone,
  school_text,
  login,
  status,
  reviewed_at,
  created_at,
  updated_at
) on public.student_registration_requests to authenticated;
