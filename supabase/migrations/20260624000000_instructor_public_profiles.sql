alter table public.instructors
add column photo_url text,
add column public_name text,
add column short_bio text,
add column contact_text text,
add column car_description text,
add column experience_text text,
add column public_is_visible boolean not null default true,
add column profile_updated_at timestamptz;

alter table public.instructors
add constraint instructors_short_bio_length check (
  short_bio is null or length(short_bio) <= 500
),
add constraint instructors_contact_text_length check (
  contact_text is null or length(contact_text) <= 300
),
add constraint instructors_car_description_length check (
  car_description is null or length(car_description) <= 300
),
add constraint instructors_experience_text_length check (
  experience_text is null or length(experience_text) <= 300
);

update public.instructors
set
  public_name = coalesce(public_name, name),
  short_bio = coalesce(
    short_bio,
    'Практические и теоретические занятия для уверенного и безопасного вождения.'
  ),
  public_is_visible = true,
  profile_updated_at = coalesce(profile_updated_at, now())
where slug = 'main-instructor';
