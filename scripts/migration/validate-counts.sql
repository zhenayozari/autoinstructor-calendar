\pset tuples_only on
\pset format aligned

select 'organizations' as table_name, count(*) from public.organizations
union all select 'app_users', count(*) from public.app_users
union all select 'organization_members', count(*) from public.organization_members
union all select 'instructors', count(*) from public.instructors
union all select 'instructor_capabilities', count(*) from public.instructor_capabilities
union all select 'lesson_types', count(*) from public.lesson_types
union all select 'schools', count(*) from public.schools
union all select 'school_lesson_type_prices', count(*) from public.school_lesson_type_prices
union all select 'schedule_days', count(*) from public.schedule_days
union all select 'slots', count(*) from public.slots
union all select 'bookings', count(*) from public.bookings
union all select 'student_accesses', count(*) from public.student_accesses
union all select 'student_access_lesson_types', count(*) from public.student_access_lesson_types
union all select 'student_lesson_packages', count(*) from public.student_lesson_packages
union all select 'student_lesson_package_types', count(*) from public.student_lesson_package_types
union all select 'student_registration_requests', count(*) from public.student_registration_requests
union all select 'staff_invitations', count(*) from public.staff_invitations
union all select 'instructor_settings', count(*) from public.instructor_settings
union all select 'booking_access_code_history', count(*) from public.booking_access_code_history
union all select 'organization_site_settings', count(*) from public.organization_site_settings
union all select 'instructor_site_settings', count(*) from public.instructor_site_settings
union all select 'audit_logs', count(*) from public.audit_logs
union all select 'lesson_reviews', count(*) from public.lesson_reviews
union all select 'student_login_attempts', count(*) from public.student_login_attempts
union all select 'push_subscriptions', count(*) from public.push_subscriptions
union all select 'notification_preferences', count(*) from public.notification_preferences
order by table_name;

select 'future_confirmed_bookings' as metric, count(*)
from public.bookings
join public.slots on slots.id = bookings.slot_id
where bookings.status = 'confirmed'
  and slots.start_time >= now();

select 'active_student_accesses' as metric, count(*)
from public.student_accesses
where is_active
  and not is_archived;

select 'active_public_instructors' as metric, count(*)
from public.instructors
where is_active
  and public_is_visible;

