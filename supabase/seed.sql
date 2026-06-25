insert into public.organizations (name, slug)
values ('Автоинструктор MVP', 'autoinstructor-mvp')
on conflict (slug) do update
set name = excluded.name;

insert into public.instructors (
  organization_id,
  name,
  slug,
  timezone,
  is_active,
  public_name,
  short_bio,
  public_is_visible,
  profile_updated_at
)
select
  organizations.id,
  'Основной инструктор',
  'main-instructor',
  'Asia/Irkutsk',
  true,
  'Основной инструктор',
  'Практические и теоретические занятия для уверенного и безопасного вождения.',
  true,
  now()
from public.organizations
where organizations.slug = 'autoinstructor-mvp'
on conflict (slug) do nothing;

insert into public.instructor_capabilities (instructor_id, capability)
select instructors.id, capabilities.capability
from public.instructors
cross join (
  values ('driving'), ('theory')
) as capabilities(capability)
where instructors.slug = 'main-instructor'
on conflict (instructor_id, capability) do nothing;

insert into public.instructor_settings (
  instructor_id,
  booking_access_code,
  booking_access_code_hash,
  booking_access_code_updated_at
)
select
  id,
  null,
  null,
  null
from public.instructors
where slug = 'main-instructor'
on conflict (instructor_id) do nothing;

insert into public.lesson_types (
  code,
  name,
  description,
  color,
  kind,
  requires_vehicle,
  default_duration_minutes,
  tags,
  sort_order,
  is_active
)
values
  (
    'omg',
    'OMG',
    'Практическое занятие для учеников автошколы OMG',
    '#2563EB',
    'driving',
    true,
    90,
    array['Автошкола'],
    10,
    true
  ),
  (
    'main_road',
    'Главная дорога',
    'Практическое занятие для учеников автошколы «Главная дорога»',
    '#0891B2',
    'driving',
    true,
    90,
    array['Автошкола'],
    20,
    true
  ),
  (
    'extra_driving',
    'Дополнительное занятие',
    'Дополнительное практическое занятие по вождению',
    '#16A34A',
    'driving',
    true,
    60,
    array['Дополнительное занятие'],
    30,
    true
  ),
  (
    'gift_driving',
    'Подарочное занятие',
    'Подарочное практическое занятие по вождению',
    '#9333EA',
    'driving',
    true,
    60,
    array['Подарок'],
    40,
    true
  ),
  (
    'theory_1x1',
    'Теория 1×1',
    'Индивидуальное занятие по теории онлайн или в классе',
    '#F59E0B',
    'theory',
    false,
    60,
    array['Теория', 'Онлайн'],
    50,
    true
  )
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  color = excluded.color,
  kind = excluded.kind,
  requires_vehicle = excluded.requires_vehicle,
  default_duration_minutes = excluded.default_duration_minutes,
  tags = excluded.tags,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
