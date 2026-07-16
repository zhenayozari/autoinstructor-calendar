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

alter table public.organization_site_settings enable row level security;
alter table public.instructor_site_settings enable row level security;

create policy "Public site settings are readable"
  on public.organization_site_settings
  for select
  to anon, authenticated
  using (true);

create policy "Visible instructor site settings are readable"
  on public.instructor_site_settings
  for select
  to anon, authenticated
  using (is_visible);

grant select on public.organization_site_settings to anon, authenticated;
grant select on public.instructor_site_settings to anon, authenticated;
