create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text,
  phone text,
  is_active boolean not null default true,
  password_reset_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_users_email_format check (
    email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint app_users_password_hash_length check (
    length(trim(password_hash)) >= 32
  ),
  constraint app_users_name_length check (
    name is null or length(trim(name)) <= 160
  ),
  constraint app_users_phone_length check (
    phone is null or length(trim(phone)) <= 40
  )
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  constraint organizations_name_not_blank check (length(trim(name)) > 0),
  constraint organizations_slug_format check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

create table public.instructors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete restrict,
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/Moscow',
  is_active boolean not null default true,
  photo_url text,
  public_name text,
  short_bio text,
  contact_text text,
  car_description text,
  experience_text text,
  public_is_visible boolean not null default true,
  profile_updated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint instructors_name_not_blank check (length(trim(name)) > 0),
  constraint instructors_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint instructors_timezone_not_blank check (length(trim(timezone)) > 0),
  constraint instructors_short_bio_length check (
    short_bio is null or length(short_bio) <= 500
  ),
  constraint instructors_contact_text_length check (
    contact_text is null or length(contact_text) <= 300
  ),
  constraint instructors_car_description_length check (
    car_description is null or length(car_description) <= 300
  ),
  constraint instructors_experience_text_length check (
    experience_text is null or length(experience_text) <= 300
  ),
  constraint instructors_id_organization_unique unique (id, organization_id)
);

create index instructors_organization_id_idx
  on public.instructors(organization_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  user_id uuid not null
    references public.app_users(id)
    on delete cascade,
  instructor_id uuid,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint organization_members_role_check check (
    role in ('owner', 'admin', 'instructor')
  ),
  constraint organization_members_instructor_role_check check (
    role <> 'instructor' or instructor_id is not null
  ),
  constraint organization_members_organization_user_unique
    unique (organization_id, user_id),
  constraint organization_members_instructor_organization_fk
    foreign key (instructor_id, organization_id)
    references public.instructors(id, organization_id)
    on delete cascade
);

create unique index organization_members_active_owner_idx
  on public.organization_members(organization_id)
  where role = 'owner' and is_active;

create unique index organization_members_instructor_idx
  on public.organization_members(organization_id, instructor_id)
  where instructor_id is not null;

create index organization_members_user_id_idx
  on public.organization_members(user_id);

create table public.instructor_capabilities (
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  capability text not null,
  created_at timestamptz not null default now(),
  primary key (instructor_id, capability),
  constraint instructor_capabilities_capability_check check (
    capability in ('driving', 'theory')
  )
);

create table public.lesson_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  color text not null,
  kind text not null,
  requires_vehicle boolean not null,
  default_duration_minutes integer not null,
  default_price_amount integer,
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint lesson_types_code_format check (code ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'),
  constraint lesson_types_name_not_blank check (length(trim(name)) > 0),
  constraint lesson_types_description_length check (
    description is null or length(description) <= 1000
  ),
  constraint lesson_types_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint lesson_types_kind_check check (kind in ('driving', 'theory')),
  constraint lesson_types_vehicle_consistency check (
    (kind = 'driving' and requires_vehicle)
    or (kind = 'theory' and not requires_vehicle)
  ),
  constraint lesson_types_duration_check check (
    default_duration_minutes between 15 and 480
  ),
  constraint lesson_types_default_price_amount_check check (
    default_price_amount is null
    or default_price_amount between 0 and 10000000
  ),
  constraint lesson_types_tags_not_blank check (
    array_position(tags, '') is null
  )
);

create index lesson_types_active_sort_idx
  on public.lesson_types(is_active, sort_order, name);

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  name text not null,
  color text not null default '#6b7280',
  default_price integer,
  payment_rule text not null default 'manual',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schools_name_not_blank check (length(trim(name)) > 0),
  constraint schools_color_hex check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint schools_default_price_check check (
    default_price is null
    or default_price between 0 and 10000000
  ),
  constraint schools_payment_rule_check check (
    payment_rule in ('manual', 'prepaid', 'settle_later')
  )
);

create index schools_organization_active_idx
  on public.schools(organization_id, is_active, name);

create table public.school_lesson_type_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  school_id uuid not null
    references public.schools(id)
    on delete cascade,
  lesson_type_id uuid not null
    references public.lesson_types(id)
    on delete cascade,
  price_amount integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_lesson_type_prices_amount_check check (
    price_amount >= 0 and price_amount <= 10000000
  ),
  constraint school_lesson_type_prices_unique unique (
    organization_id,
    school_id,
    lesson_type_id
  )
);

create index school_lesson_type_prices_organization_idx
  on public.school_lesson_type_prices(organization_id);

create index school_lesson_type_prices_school_idx
  on public.school_lesson_type_prices(school_id);

create table public.schedule_days (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  date date not null,
  transmission text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  constraint schedule_days_transmission_check check (
    transmission in ('automatic', 'manual') or transmission is null
  ),
  constraint schedule_days_instructor_date_unique unique (instructor_id, date),
  constraint schedule_days_id_instructor_unique unique (id, instructor_id)
);

create index schedule_days_instructor_date_idx
  on public.schedule_days(instructor_id, date);

create table public.slots (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  schedule_day_id uuid not null,
  lesson_type_id uuid not null references public.lesson_types(id) on delete restrict,
  school_id uuid references public.schools(id) on delete set null,
  start_time timestamptz not null,
  end_time timestamptz not null,
  location_type text not null,
  status text not null default 'available',
  note text,
  created_at timestamptz not null default now(),
  constraint slots_schedule_day_instructor_fk
    foreign key (schedule_day_id, instructor_id)
    references public.schedule_days(id, instructor_id)
    on delete cascade,
  constraint slots_valid_time_range check (start_time < end_time),
  constraint slots_location_type_check check (
    location_type in ('in_car', 'online', 'classroom', 'other')
  ),
  constraint slots_status_check check (
    status in ('available', 'blocked', 'cancelled')
  ),
  constraint slots_note_length check (
    note is null or length(note) <= 500
  ),
  constraint slots_no_active_overlap exclude using gist (
    instructor_id with =,
    tstzrange(start_time, end_time, '[)') with &&
  ) where (status in ('available', 'blocked'))
);

create index slots_schedule_day_id_idx
  on public.slots(schedule_day_id);

create index slots_lesson_type_id_idx
  on public.slots(lesson_type_id);

create index slots_instructor_start_time_idx
  on public.slots(instructor_id, start_time);

create index slots_school_id_idx
  on public.slots(school_id);

create table public.student_accesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  display_label text not null,
  student_phone text,
  login text not null,
  password_hash text not null,
  total_lesson_limit integer,
  weekly_lesson_limit integer,
  school_id uuid
    references public.schools(id)
    on delete set null,
  is_active boolean not null default true,
  is_archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_accesses_label_length check (
    length(trim(display_label)) between 1 and 80
  ),
  constraint student_accesses_contact_length check (
    student_phone is null or length(trim(student_phone)) <= 200
  ),
  constraint student_accesses_login_format check (
    login ~ '^[a-z0-9][a-z0-9_-]{2,49}$'
  ),
  constraint student_accesses_password_hash_length check (
    length(trim(password_hash)) >= 32
  ),
  constraint student_accesses_total_limit_check check (
    total_lesson_limit is null or total_lesson_limit between 1 and 500
  ),
  constraint student_accesses_weekly_limit_check check (
    weekly_lesson_limit is null or weekly_lesson_limit between 1 and 50
  ),
  constraint student_accesses_archive_consistency check (
    (is_archived = false and archived_at is null)
    or (is_archived = true and archived_at is not null)
  ),
  constraint student_accesses_org_login_unique unique (organization_id, login)
);

create index student_accesses_instructor_idx
  on public.student_accesses(instructor_id, is_active, display_label);

create index student_accesses_school_id_idx
  on public.student_accesses(school_id);

create table public.student_access_lesson_types (
  student_access_id uuid not null
    references public.student_accesses(id)
    on delete cascade,
  lesson_type_id uuid not null
    references public.lesson_types(id)
    on delete restrict,
  created_at timestamptz not null default now(),
  primary key (student_access_id, lesson_type_id)
);

create index student_access_lesson_types_lesson_type_idx
  on public.student_access_lesson_types(lesson_type_id);

create table public.student_lesson_packages (
  id uuid primary key default gen_random_uuid(),
  student_access_id uuid not null references public.student_accesses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  instructor_id uuid not null references public.instructors(id) on delete cascade,
  school_id uuid references public.schools(id) on delete set null,
  booking_category text not null default 'regular',
  total_lesson_limit integer,
  weekly_lesson_limit integer,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_lesson_packages_booking_category_check
    check (booking_category in ('regular', 'extra', 'gift')),
  constraint student_lesson_packages_total_limit_check
    check (total_lesson_limit is null or total_lesson_limit > 0),
  constraint student_lesson_packages_weekly_limit_check
    check (weekly_lesson_limit is null or weekly_lesson_limit > 0)
);

create index student_lesson_packages_access_idx
  on public.student_lesson_packages(student_access_id);

create index student_lesson_packages_instructor_idx
  on public.student_lesson_packages(instructor_id, is_active, sort_order);

create index student_lesson_packages_school_idx
  on public.student_lesson_packages(school_id);

create table public.student_lesson_package_types (
  package_id uuid not null references public.student_lesson_packages(id) on delete cascade,
  lesson_type_id uuid not null references public.lesson_types(id) on delete cascade,
  primary key (package_id, lesson_type_id)
);

create index student_lesson_package_types_lesson_type_idx
  on public.student_lesson_package_types(lesson_type_id);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.slots(id) on delete cascade,
  student_access_id uuid
    references public.student_accesses(id)
    on delete set null,
  student_lesson_package_id uuid
    references public.student_lesson_packages(id)
    on delete set null,
  school_id uuid
    references public.schools(id)
    on delete set null,
  student_label text not null,
  status text not null default 'confirmed',
  price_amount integer,
  paid_amount integer not null default 0,
  is_paid boolean not null default false,
  paid_at timestamptz,
  payment_note text,
  booking_category text not null default 'regular',
  lesson_state text not null default 'scheduled',
  completed_at timestamptz,
  instructor_note text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint bookings_student_label_length check (
    length(trim(student_label)) between 1 and 80
  ),
  constraint bookings_status_check check (
    status in ('confirmed', 'cancelled')
  ),
  constraint bookings_cancellation_consistency check (
    (status = 'confirmed' and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null)
  ),
  constraint bookings_price_amount_check check (
    price_amount is null
    or price_amount between 0 and 10000000
  ),
  constraint bookings_payment_consistency check (
    (is_paid = false and paid_at is null)
    or (is_paid = true and paid_at is not null)
  ),
  constraint bookings_paid_amount_check
    check (paid_amount between 0 and 10000000),
  constraint bookings_payment_note_length_check
    check (payment_note is null or length(payment_note) <= 500),
  constraint bookings_full_payment_amount_check check (
    is_paid = false
    or paid_amount >= coalesce(price_amount, 0)
  ),
  constraint bookings_booking_category_check
    check (booking_category in ('regular', 'extra', 'gift')),
  constraint bookings_lesson_state_check check (
    lesson_state in ('scheduled', 'completed', 'no_show')
  ),
  constraint bookings_lesson_state_completed_at_check check (
    (lesson_state = 'completed' and completed_at is not null)
    or (lesson_state <> 'completed' and completed_at is null)
  ),
  constraint bookings_instructor_note_length check (
    instructor_note is null
    or length(trim(instructor_note)) <= 1000
  )
);

create unique index bookings_one_confirmed_per_slot_idx
  on public.bookings(slot_id)
  where status = 'confirmed';

create index bookings_slot_id_idx
  on public.bookings(slot_id);

create index bookings_student_access_id_idx
  on public.bookings(student_access_id)
  where student_access_id is not null;

create index bookings_student_lesson_package_id_idx
  on public.bookings(student_lesson_package_id);

create index bookings_school_id_idx
  on public.bookings(school_id);

create index bookings_lesson_state_idx
  on public.bookings(lesson_state);

create index bookings_completed_at_idx
  on public.bookings(completed_at)
  where completed_at is not null;

create index bookings_booking_category_idx
  on public.bookings(booking_category);

create table public.student_registration_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  first_name text,
  last_name text,
  student_phone text,
  school_text text,
  login text not null,
  password_hash text not null,
  status text not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_registration_requests_login_format check (
    login ~ '^[a-z0-9][a-z0-9_-]{2,49}$'
  ),
  constraint student_registration_requests_password_hash_length check (
    length(trim(password_hash)) >= 32
  ),
  constraint student_registration_requests_name_length check (
    (first_name is null or length(trim(first_name)) <= 80)
    and (last_name is null or length(trim(last_name)) <= 80)
  ),
  constraint student_registration_requests_contact_length check (
    student_phone is null or length(trim(student_phone)) <= 200
  ),
  constraint student_registration_requests_school_length check (
    school_text is null or length(trim(school_text)) <= 120
  ),
  constraint student_registration_requests_status_check check (
    status in ('pending', 'approved', 'rejected')
  ),
  constraint student_registration_requests_review_consistency check (
    (status = 'pending' and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_at is not null)
  )
);

create index student_registration_requests_instructor_status_idx
  on public.student_registration_requests(instructor_id, status, created_at desc);

create unique index student_registration_requests_pending_login_idx
  on public.student_registration_requests(organization_id, login)
  where status = 'pending';

create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  invited_by_member_id uuid
    references public.organization_members(id)
    on delete set null,
  token text not null unique,
  status text not null default 'invited',
  invited_name text,
  invited_email text,
  invited_phone text,
  submitted_name text,
  submitted_email text,
  submitted_phone text,
  user_id uuid
    references public.app_users(id)
    on delete set null,
  instructor_id uuid
    references public.instructors(id)
    on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_invitations_status_check check (
    status in ('invited', 'submitted', 'approved', 'rejected', 'expired')
  ),
  constraint staff_invitations_token_not_blank check (length(trim(token)) > 0),
  constraint staff_invitations_invited_name_length check (
    invited_name is null or length(invited_name) <= 160
  ),
  constraint staff_invitations_invited_email_length check (
    invited_email is null or length(invited_email) <= 254
  ),
  constraint staff_invitations_invited_phone_length check (
    invited_phone is null or length(invited_phone) <= 40
  ),
  constraint staff_invitations_submitted_name_length check (
    submitted_name is null or length(submitted_name) <= 160
  ),
  constraint staff_invitations_submitted_email_length check (
    submitted_email is null or length(submitted_email) <= 254
  ),
  constraint staff_invitations_submitted_phone_length check (
    submitted_phone is null or length(submitted_phone) <= 40
  )
);

create index staff_invitations_organization_status_idx
  on public.staff_invitations(organization_id, status, created_at desc);

create index staff_invitations_token_idx
  on public.staff_invitations(token);

create table public.instructor_settings (
  instructor_id uuid primary key
    references public.instructors(id)
    on delete cascade,
  booking_access_code_hash text,
  booking_access_code text,
  booking_access_code_updated_at timestamptz,
  student_registration_token text not null
    default (
      replace(gen_random_uuid()::text, '-', '') ||
      replace(gen_random_uuid()::text, '-', '')
    ),
  student_registration_enabled boolean not null default true,
  student_registration_token_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instructor_settings_hash_not_blank check (
    booking_access_code_hash is null
    or length(trim(booking_access_code_hash)) > 0
  ),
  constraint instructor_settings_access_code_not_blank check (
    booking_access_code is null
    or length(trim(booking_access_code)) > 0
  ),
  constraint instructor_settings_student_registration_token_not_blank check (
    length(trim(student_registration_token)) >= 32
  )
);

create unique index instructor_settings_student_registration_token_idx
  on public.instructor_settings(student_registration_token);

create table public.booking_access_code_history (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  access_code text not null,
  created_at timestamptz not null default now(),
  constraint booking_access_code_history_code_not_blank check (
    length(trim(access_code)) > 0
  )
);

create index booking_access_code_history_instructor_created_idx
  on public.booking_access_code_history(instructor_id, created_at desc);

create table public.organization_site_settings (
  organization_id uuid primary key
    references public.organizations(id)
    on delete cascade,
  hero_label text not null default 'Автоинструктор',
  hero_title text not null default 'Автоинструктор Вячеслав',
  hero_text text not null default 'Индивидуальные занятия по вождению и спокойная подготовка к дороге.',
  about_title text not null default 'О занятиях',
  about_text text not null default 'Здесь можно рассказать о подходе, опыте, автомобиле, формате занятий и правилах записи.',
  contact_phone text,
  telegram_url text,
  whatsapp_url text,
  show_about boolean not null default true,
  show_lesson_types boolean not null default true,
  show_instructors boolean not null default true,
  show_contacts boolean not null default true,
  show_student_login boolean not null default true,
  landing_content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint organization_site_settings_hero_label_length check (length(hero_label) <= 80),
  constraint organization_site_settings_hero_title_length check (length(hero_title) <= 160),
  constraint organization_site_settings_hero_text_length check (length(hero_text) <= 700),
  constraint organization_site_settings_about_title_length check (length(about_title) <= 160),
  constraint organization_site_settings_about_text_length check (length(about_text) <= 2000),
  constraint organization_site_settings_contact_phone_length check (
    contact_phone is null or length(contact_phone) <= 80
  ),
  constraint organization_site_settings_telegram_url_length check (
    telegram_url is null or length(telegram_url) <= 300
  ),
  constraint organization_site_settings_whatsapp_url_length check (
    whatsapp_url is null or length(whatsapp_url) <= 300
  )
);

create table public.instructor_site_settings (
  instructor_id uuid primary key
    references public.instructors(id)
    on delete cascade,
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  is_visible boolean not null default false,
  show_photo boolean not null default true,
  show_bio boolean not null default true,
  show_contact boolean not null default false,
  show_car boolean not null default true,
  show_experience boolean not null default true,
  public_note text,
  public_contact text,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  constraint instructor_site_settings_instructor_org_unique unique (
    instructor_id,
    organization_id
  ),
  constraint instructor_site_settings_public_note_length check (
    public_note is null or length(public_note) <= 700
  ),
  constraint instructor_site_settings_public_contact_length check (
    public_contact is null or length(public_contact) <= 300
  )
);

create index instructor_site_settings_organization_visible_idx
  on public.instructor_site_settings(organization_id, is_visible, sort_order);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  actor_member_id uuid
    references public.organization_members(id)
    on delete set null,
  actor_user_id uuid
    references public.app_users(id)
    on delete set null,
  actor_role text not null,
  actor_instructor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_role_check check (
    actor_role in ('owner', 'admin', 'instructor')
  ),
  constraint audit_logs_action_length check (
    length(trim(action)) > 0 and length(action) <= 120
  ),
  constraint audit_logs_entity_type_length check (
    length(trim(entity_type)) > 0 and length(entity_type) <= 80
  ),
  constraint audit_logs_entity_id_length check (
    entity_id is null or length(entity_id) <= 160
  )
);

create index audit_logs_organization_created_idx
  on public.audit_logs(organization_id, created_at desc);

create index audit_logs_actor_user_created_idx
  on public.audit_logs(actor_user_id, created_at desc);

create index audit_logs_entity_idx
  on public.audit_logs(entity_type, entity_id);

create table public.lesson_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,
  instructor_id uuid not null
    references public.instructors(id)
    on delete cascade,
  booking_id uuid not null
    references public.bookings(id)
    on delete cascade,
  student_access_id uuid not null
    references public.student_accesses(id)
    on delete cascade,
  rating integer not null,
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_reviews_rating_check check (rating between 1 and 5),
  constraint lesson_reviews_comment_length check (
    comment is null or length(comment) <= 1000
  ),
  constraint lesson_reviews_booking_unique unique (booking_id)
);

create index lesson_reviews_organization_created_idx
  on public.lesson_reviews(organization_id, created_at desc);

create index lesson_reviews_instructor_created_idx
  on public.lesson_reviews(instructor_id, created_at desc);

create index lesson_reviews_student_access_idx
  on public.lesson_reviews(student_access_id);

create table public.student_login_attempts (
  login text primary key,
  failed_count integer not null default 0,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  locked_until timestamptz,
  constraint student_login_attempts_login_not_blank check (
    length(trim(login)) > 0
  ),
  constraint student_login_attempts_failed_count_check check (
    failed_count >= 0
  )
);

create index student_login_attempts_locked_until_idx
  on public.student_login_attempts(locked_until);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  instructor_id uuid references public.instructors(id) on delete set null,
  role text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  subscription jsonb not null,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_role_check check (role in ('owner', 'instructor')),
  constraint push_subscriptions_endpoint_not_blank check (length(trim(endpoint)) > 0),
  constraint push_subscriptions_p256dh_not_blank check (length(trim(p256dh)) > 0),
  constraint push_subscriptions_auth_secret_not_blank check (length(trim(auth_secret)) > 0)
);

create index push_subscriptions_member_idx
  on public.push_subscriptions(organization_member_id, is_active);

create index push_subscriptions_organization_idx
  on public.push_subscriptions(organization_id, role, is_active);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_member_id uuid not null references public.organization_members(id) on delete cascade,
  event_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_preferences_event_key_check check (
    event_key in (
      'student_booking_created',
      'booking_cancelled',
      'lesson_review_created',
      'student_registration_requested',
      'staff_registration_requested'
    )
  ),
  constraint notification_preferences_unique unique (
    organization_member_id,
    event_key
  )
);

create index notification_preferences_member_idx
  on public.notification_preferences(organization_member_id);

create or replace function public.set_app_users_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_users_set_updated_at
before update on public.app_users
for each row execute function public.set_app_users_updated_at();

create or replace function public.set_schools_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_schools_updated_at_trigger
before update
on public.schools
for each row
execute function public.set_schools_updated_at();

create or replace function public.set_student_accesses_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_student_accesses_updated_at_trigger
before update
on public.student_accesses
for each row
execute function public.set_student_accesses_updated_at();

create or replace function public.set_student_lesson_packages_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger student_lesson_packages_set_updated_at
before update on public.student_lesson_packages
for each row execute function public.set_student_lesson_packages_updated_at();

create or replace function public.set_student_registration_requests_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_student_registration_requests_updated_at_trigger
before update
on public.student_registration_requests
for each row
execute function public.set_student_registration_requests_updated_at();

create or replace function public.set_instructor_settings_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_instructor_settings_updated_at_trigger
before update
on public.instructor_settings
for each row
execute function public.set_instructor_settings_updated_at();

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscriptions_updated_at();

create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function public.set_notification_preferences_updated_at();

create or replace function public.validate_slot_lesson_requirements()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  day_transmission text;
  lesson_kind text;
begin
  select schedule_days.transmission
    into day_transmission
  from public.schedule_days
  where schedule_days.id = new.schedule_day_id
    and schedule_days.instructor_id = new.instructor_id;

  select lesson_types.kind
    into lesson_kind
  from public.lesson_types
  where lesson_types.id = new.lesson_type_id;

  if lesson_kind = 'driving' and day_transmission is null then
    raise exception 'Driving slots require transmission on the schedule day';
  end if;

  return new;
end;
$$;

create trigger validate_slot_lesson_requirements_trigger
before insert or update of instructor_id, schedule_day_id, lesson_type_id, status
on public.slots
for each row
execute function public.validate_slot_lesson_requirements();

create or replace function public.prevent_removing_required_transmission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.transmission is null and old.transmission is not null and exists (
    select 1
    from public.slots
    join public.lesson_types
      on lesson_types.id = slots.lesson_type_id
    where slots.schedule_day_id = new.id
      and slots.status <> 'cancelled'
      and lesson_types.kind = 'driving'
  ) then
    raise exception 'Cannot remove transmission from a day with driving slots';
  end if;

  return new;
end;
$$;

create trigger prevent_removing_required_transmission_trigger
before update of transmission
on public.schedule_days
for each row
execute function public.prevent_removing_required_transmission();

create or replace function public.set_booking_access_code(
  target_instructor_id uuid,
  new_access_code text,
  new_access_code_hash text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  changed_at timestamptz := now();
begin
  if length(trim(new_access_code)) = 0 then
    raise exception 'Access code must not be blank';
  end if;

  insert into public.instructor_settings (
    instructor_id,
    booking_access_code,
    booking_access_code_hash,
    booking_access_code_updated_at
  )
  values (
    target_instructor_id,
    new_access_code,
    new_access_code_hash,
    changed_at
  )
  on conflict (instructor_id) do update
  set
    booking_access_code = excluded.booking_access_code,
    booking_access_code_hash = excluded.booking_access_code_hash,
    booking_access_code_updated_at = excluded.booking_access_code_updated_at;

  insert into public.booking_access_code_history (
    instructor_id,
    access_code,
    created_at
  )
  values (
    target_instructor_id,
    new_access_code,
    changed_at
  );
end;
$$;

create or replace view public.public_schedule_slots
with (security_barrier = true)
as
select
  slots.id,
  slots.instructor_id,
  coalesce(instructors.public_name, 'Инструктор') as instructor_name,
  instructors.slug as instructor_slug,
  instructors.timezone,
  schedule_days.date,
  schedule_days.transmission,
  slots.lesson_type_id,
  lesson_types.code as lesson_type_code,
  lesson_types.name as lesson_type_name,
  lesson_types.description as lesson_type_description,
  lesson_types.color as lesson_type_color,
  lesson_types.kind as lesson_kind,
  lesson_types.tags as lesson_type_tags,
  lesson_types.sort_order as lesson_type_sort_order,
  slots.start_time,
  slots.end_time,
  slots.location_type,
  slots.status,
  exists (
    select 1
    from public.bookings
    where bookings.slot_id = slots.id
      and bookings.status = 'confirmed'
  ) as is_booked,
  slots.school_id
from public.slots
join public.schedule_days
  on schedule_days.id = slots.schedule_day_id
  and schedule_days.instructor_id = slots.instructor_id
join public.instructors
  on instructors.id = slots.instructor_id
join public.lesson_types
  on lesson_types.id = slots.lesson_type_id
where schedule_days.published_at is not null
  and schedule_days.published_at <= now()
  and slots.status <> 'cancelled'
  and instructors.is_active
  and instructors.public_is_visible
  and lesson_types.is_active;

