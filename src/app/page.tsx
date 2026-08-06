import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  MapPinned,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { PublicHeader } from "@/components/public/public-header";
import {
  normalizeLandingContent,
  type LandingContent,
  type LandingTextItem,
} from "@/lib/landing-content";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { InstructorProfile, InstructorSiteSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

type Organization = {
  id: string;
  name: string;
};

type LandingInstructor = InstructorProfile & {
  organization_id?: string;
  site_settings?: InstructorSiteSettings | null;
};

type SiteSettingsRow = {
  landing_content: unknown;
};

async function loadLandingData() {
  const supabase = hasSupabaseAdminKey()
    ? createAdminClient()
    : await createClient();
  const { data: organizationData } = await supabase
    .from("organizations")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  const organization = organizationData as Organization | null;
  const { data: siteSettingsData } = organization
    ? await supabase
        .from("organization_site_settings")
        .select("landing_content")
        .eq("organization_id", organization.id)
        .maybeSingle()
    : { data: null };
  const { data: instructorData } = await supabase
    .from("instructors")
    .select(
      "id, organization_id, name, slug, public_name, timezone, is_active, photo_url, short_bio, contact_text, car_description, experience_text, public_is_visible, profile_updated_at",
    )
    .eq("is_active", true)
    .eq("public_is_visible", true)
    .order("public_name", { nullsFirst: false })
    .order("name");
  const { data: instructorSettingsData } = organization
    ? await supabase
        .from("instructor_site_settings")
        .select(
          "instructor_id, organization_id, is_visible, show_photo, show_bio, show_contact, show_car, show_experience, public_note, public_contact, sort_order, updated_at",
        )
        .eq("organization_id", organization.id)
    : { data: [] };
  const instructorSettings = (instructorSettingsData ??
    []) as InstructorSiteSettings[];
  const settingsByInstructorId = new Map(
    instructorSettings.map((item) => [item.instructor_id, item]),
  );
  const instructors = ((instructorData ?? []) as LandingInstructor[])
    .map((instructor) => ({
      ...instructor,
      site_settings: settingsByInstructorId.get(instructor.id) ?? null,
    }))
    .sort((first, second) => {
      const firstOrder = first.site_settings?.sort_order ?? 100;
      const secondOrder = second.site_settings?.sort_order ?? 100;

      return firstOrder - secondOrder || first.name.localeCompare(second.name);
    });

  return {
    organization,
    siteSettings: siteSettingsData as SiteSettingsRow | null,
    instructors,
    hasInstructorSiteSettings: Boolean(siteSettingsData) || instructorSettings.length > 0,
  };
}

function getPublicName(instructor?: LandingInstructor | null) {
  return instructor?.public_name || instructor?.name || "Вячеслав";
}

function formatLandingText(text: string, name: string) {
  return text.replaceAll("{name}", name);
}

function ContactButtons({
  compact = false,
  contacts,
}: {
  compact?: boolean;
  contacts: LandingContent["contacts"];
}) {
  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      <a
        href={contacts.telegramUrl}
        className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-lime-300/25 bg-lime-300 px-4 text-sm font-semibold text-zinc-950 shadow-lg shadow-lime-300/15 transition hover:bg-lime-200 ${
          compact ? "py-2.5" : "py-3.5"
        }`}
      >
        <MessageCircle className="size-4" />
        {contacts.telegramLabel}
      </a>
      <a
        href={contacts.maxUrl}
        className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/14 ${
          compact ? "py-2.5" : "py-3.5"
        }`}
      >
        <span className="grid size-5 place-items-center rounded-md bg-lime-300 text-[10px] font-black text-zinc-950">
          M
        </span>
        {contacts.maxLabel}
      </a>
      <a
        href={contacts.phoneHref}
        className={`inline-flex items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 px-4 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/14 ${
          compact ? "py-2.5" : "py-3.5"
        }`}
      >
        <Phone className="size-4" />
        {contacts.phoneLabel}
      </a>
    </div>
  );
}

function SignalCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={`rounded-2xl border p-4 backdrop-blur ${
        tone === "accent"
          ? "border-lime-300/30 bg-lime-300/12"
          : "border-white/12 bg-white/8"
      }`}
    >
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-sm leading-5 text-zinc-300">{label}</p>
    </div>
  );
}

function AudienceCard({ title, text }: LandingTextItem) {
  return (
    <>
      <details className="group rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-white backdrop-blur open:bg-white/[0.12] sm:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
          <span>{title}</span>
          <span className="text-xs font-medium text-lime-300 transition group-open:rotate-45">
            +
          </span>
        </summary>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{text}</p>
      </details>
      <article className="hidden rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-white backdrop-blur transition hover:bg-white/[0.12] sm:block">
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-300">{text}</p>
      </article>
    </>
  );
}

function StepCard({
  number,
  title,
  text,
}: LandingTextItem & {
  number: string;
}) {
  return (
    <article className="relative rounded-3xl border border-zinc-800 bg-zinc-950 p-5 text-white shadow-sm">
      <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-lime-300 text-sm font-black text-zinc-950">
        {number}
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-300">{text}</p>
    </article>
  );
}

function InstructorCard({ instructor }: { instructor: LandingInstructor }) {
  const publicName = getPublicName(instructor);
  const settings = instructor.site_settings;
  const showPhoto = settings?.show_photo ?? true;
  const showBio = settings?.show_bio ?? true;
  const showContact = settings?.show_contact ?? false;
  const showCar = settings?.show_car ?? true;
  const showExperience = settings?.show_experience ?? true;
  const bioText =
    settings?.public_note ||
    instructor.short_bio ||
    "Помогаю спокойно чувствовать себя за рулём в городе, разобрать сложные моменты и подготовиться к экзамену.";
  const contactText = settings?.public_contact || instructor.contact_text;

  return (
    <article
      className={`grid overflow-hidden rounded-[2rem] border bg-white shadow-sm ${
        showPhoto ? "lg:grid-cols-[0.85fr_1.15fr]" : ""
      }`}
    >
      {showPhoto && (
        instructor.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={instructor.photo_url}
            alt={publicName}
            className="h-full min-h-[260px] w-full object-cover"
          />
        ) : (
          <div className="grid min-h-[260px] place-items-center bg-zinc-100">
            <UserRound className="size-14 text-zinc-400" />
          </div>
        )
      )}
      <div className="p-5 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
          Инструктор
        </p>
        <div className="mt-3 flex items-center gap-2">
          <GraduationCap className="size-5 text-lime-600" />
          <h3 className="text-2xl font-semibold">{publicName}</h3>
        </div>
        {showBio && (
          <p className="text-muted-foreground mt-4 text-base leading-7">
            {bioText}
          </p>
        )}
        {showContact && contactText && (
          <div className="mt-4 rounded-2xl bg-lime-50 px-4 py-3 text-sm font-semibold text-lime-900">
            {contactText}
          </div>
        )}
        {((showExperience && instructor.experience_text) ||
          (showCar && instructor.car_description)) && (
          <details className="group mt-5 border-t pt-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-800">
              Подробнее об инструкторе
              <span className="text-xs font-medium text-lime-700 transition group-open:rotate-45">
                +
              </span>
            </summary>
            <div className="mt-3 grid gap-3 text-sm leading-6 text-zinc-600 sm:grid-cols-2">
              {showExperience && instructor.experience_text && (
                <div className="rounded-2xl bg-zinc-50 p-4">
                  {instructor.experience_text}
                </div>
              )}
              {showCar && instructor.car_description && (
                <div className="rounded-2xl bg-zinc-50 p-4">
                  {instructor.car_description}
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

export default async function Home() {
  const {
    siteSettings,
    instructors,
    hasInstructorSiteSettings,
  } = await loadLandingData();
  const content = normalizeLandingContent(siteSettings?.landing_content);
  const mainInstructor =
    instructors.find((instructor) => instructor.public_name || instructor.name) ??
    null;
  const publicName = getPublicName(mainInstructor);
  const visibleInstructors =
    instructors.length > 0
      ? hasInstructorSiteSettings
        ? instructors.filter((instructor) => instructor.site_settings?.is_visible)
        : instructors
      : ([
          {
            id: "fallback",
            name: "Вячеслав",
            slug: "vyacheslav",
            public_name: "Вячеслав",
            timezone: "Asia/Irkutsk",
            is_active: true,
            photo_url: null,
            short_bio:
              "Помогаю спокойно чувствовать себя за рулём в городе, разобрать сложные моменты и подготовиться к экзамену.",
            contact_text: null,
            car_description:
              "Практические занятия для начинающих водителей и тех, кто хочет добрать уверенность.",
            experience_text: "Индивидуальный подход к каждому ученику.",
            public_is_visible: true,
            profile_updated_at: null,
          },
        ] satisfies LandingInstructor[]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-950">
      <div className="mx-auto max-w-7xl px-3 pb-3 sm:px-5 sm:pb-5">
        <PublicHeader
          showDirectionLinks
          theme="dark"
          logoUrl={content.media.logoUrl}
          logoAlt={content.media.logoAlt}
        />

        {content.hero.enabled && (
        <section className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_75%_20%,rgba(163,230,53,0.24),transparent_30%),linear-gradient(135deg,#050505_0%,#111827_52%,#0b2216_100%)] text-white shadow-2xl shadow-black/30">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(0deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.media.heroImageUrl}
            alt={content.media.heroImageAlt}
            className="absolute inset-y-0 right-0 h-full w-full object-cover opacity-35 lg:w-[58%] lg:opacity-75"
          />
          <div className="absolute inset-y-0 right-0 w-full bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-zinc-950/10 lg:w-[68%]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-b from-transparent via-[#dfe8d5]/18 to-[#eef1e8]/45" />

          <div className="relative grid min-h-[760px] gap-8 p-5 sm:p-8 lg:grid-cols-[1.05fr_0.95fr] lg:p-10">
            <div className="flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-300/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-lime-200">
                  <BrainCircuit className="size-4" />
                  {content.hero.label}
                </div>

                <h1 className="mt-7 max-w-4xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl lg:text-7xl">
                  {content.hero.title}
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-300 sm:text-xl sm:leading-9">
                  {formatLandingText(content.hero.text, publicName)}
                </p>

                {content.contacts.enabled && (
                  <div className="mt-7">
                    <ContactButtons contacts={content.contacts} />
                  </div>
                )}
              </div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {content.hero.signals.map((signal, index) => (
                  <SignalCard
                    key={signal.value}
                    value={signal.value}
                    label={signal.label}
                    tone={index === 0 ? "accent" : "default"}
                  />
                ))}
              </div>
            </div>

            {content.result.enabled && (
            <div className="flex items-end">
              <div className="w-full rounded-[2rem] border border-white/12 bg-white/8 p-4 shadow-2xl shadow-black/20 backdrop-blur lg:ml-auto lg:max-w-md">
                <div className="rounded-[1.5rem] bg-zinc-950/80 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">
                        {content.result.title}
                      </p>
                      <p className="mt-1 text-xs text-zinc-400">
                        {content.result.text}
                      </p>
                    </div>
                    <div className="grid size-10 place-items-center rounded-2xl bg-lime-300 text-zinc-950">
                      <Sparkles className="size-5" />
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {content.result.items.map((item) => (
                      <div
                        key={item.title}
                        className="rounded-2xl border border-white/8 bg-white/6 p-3"
                      >
                        <p className="text-sm font-semibold text-white">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-zinc-400">
                          {item.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}
          </div>
        </section>
        )}

        <div className="relative z-10 mt-4 overflow-hidden rounded-[2rem] bg-[linear-gradient(180deg,#aeb6a8_0%,#f7f5ef_16%,#f7f5ef_100%)] px-3 pb-8 pt-5 shadow-[0_-18px_70px_rgba(163,230,53,0.14)] sm:mt-5 sm:px-6 sm:pt-6 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_50%_0%,rgba(220,252,231,0.58),transparent_54%)] blur-2xl" />
          <div className="pointer-events-none absolute inset-x-6 top-2 h-14 rounded-full bg-lime-200/14 blur-3xl" />
          {content.situations.enabled && (
          <section className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_0%,rgba(163,230,53,0.2),transparent_34%),linear-gradient(135deg,#07130c_0%,#111827_52%,#0b2216_100%)] p-5 text-white shadow-2xl shadow-black/25 sm:p-7">
            <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">
                  {content.situations.label}
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-5xl">
                  {content.situations.title}
                </h2>
              </div>
              <p className="hidden max-w-2xl text-sm leading-7 text-zinc-300 sm:block sm:text-base">
                {content.situations.desktopText}
              </p>
              <details className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-sm backdrop-blur sm:hidden">
                <summary className="cursor-pointer list-none font-semibold text-white">
                  {content.situations.mobileSummaryTitle}
                </summary>
                <p className="mt-3 leading-6 text-zinc-300">
                  {content.situations.mobileSummaryText}
                </p>
              </details>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {content.situations.items.map((card) => (
                <AudienceCard key={card.title} {...card} />
              ))}
            </div>
          </section>
          )}

          {content.approach.enabled && (
          <section
            id="about"
            className="relative mx-auto mt-12 grid max-w-6xl gap-6 rounded-[2rem] border border-white/70 bg-white/[0.92] p-5 shadow-[0_22px_70px_rgba(15,23,42,0.14)] backdrop-blur sm:p-8 lg:grid-cols-[0.9fr_1.1fr]"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">
                {content.approach.label}
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                {content.approach.title}
              </h2>
            </div>
            <div className="space-y-5">
              <p className="text-base leading-8 text-zinc-700">
                {content.approach.text}
              </p>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-zinc-50 px-3 py-3">
                  <ShieldCheck className="size-4 text-lime-700" />
                  <p className="mt-2 text-xs font-semibold sm:text-sm">
                    {content.approach.chips[0]}
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 px-3 py-3">
                  <MapPinned className="size-4 text-blue-600" />
                  <p className="mt-2 text-xs font-semibold sm:text-sm">
                    {content.approach.chips[1]}
                  </p>
                </div>
                <div className="rounded-2xl bg-zinc-50 px-3 py-3">
                  <CheckCircle2 className="size-4 text-amber-600" />
                  <p className="mt-2 text-xs font-semibold sm:text-sm">
                    {content.approach.chips[2]}
                  </p>
                </div>
              </div>
            </div>
          </section>
          )}

          {content.process.enabled && (
          <section className="mx-auto mt-10 max-w-6xl">
            <div className="rounded-[2rem] bg-zinc-950 p-5 text-white shadow-2xl shadow-zinc-950/10 sm:p-8">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">
                  {content.process.label}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                  {content.process.title}
                </h2>
              </div>
              <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {content.process.steps.map((step, index) => (
                  <StepCard
                    key={step.title}
                    number={`${index + 1}`}
                    {...step}
                  />
                ))}
              </div>
            </div>
          </section>
          )}

          {content.instructors.enabled && visibleInstructors.length > 0 && (
          <section className="mx-auto mt-14 max-w-6xl">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-700">
                  {content.instructors.label}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                  {content.instructors.title}
                </h2>
              </div>
              {visibleInstructors.length === 1 && content.contacts.enabled && (
                <a
                  href="#contacts"
                  className="inline-flex w-fit items-center gap-2 rounded-full bg-zinc-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Связаться
                  <ArrowRight className="size-4" />
                </a>
              )}
            </div>

            <div className="grid gap-4">
              {visibleInstructors.map((instructor) => (
                <InstructorCard key={instructor.id} instructor={instructor} />
              ))}
            </div>
          </section>
          )}

          {content.contacts.enabled && (
          <section
            id="contacts"
            className="mx-auto mt-10 max-w-6xl rounded-[2rem] bg-zinc-950 p-5 text-white shadow-2xl shadow-zinc-950/10 sm:p-8 lg:p-10"
          >
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-lime-300">
                  {content.contacts.label}
                </p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-5xl">
                  {content.contacts.title}
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-base">
                  {content.contacts.text}
                </p>
              </div>
              <ContactButtons compact contacts={content.contacts} />
            </div>
          </section>
          )}

          <footer className="mx-auto max-w-6xl py-6 text-xs text-zinc-500">
            {content.legal.enabled && (
              <details className="group rounded-2xl border border-zinc-200/80 bg-white/70 p-4 text-left shadow-sm backdrop-blur">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-zinc-800">
                  <span>{content.legal.linkLabel}</span>
                  <span className="text-lime-700 transition group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="mt-4 border-t pt-4">
                  <h2 className="text-base font-semibold text-zinc-950">
                    {content.legal.title}
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-600">
                    {content.legal.text}
                  </p>
                </div>
              </details>
            )}
            <div className="mt-4 text-center text-[11px] leading-5 text-zinc-400">
              Связь с разработчиком:{" "}
              <span className="inline-flex flex-wrap justify-center gap-x-3 gap-y-1">
                <a
                  href="tel:+79361677764"
                  className="font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-800 hover:underline"
                >
                  Телефон
                </a>
                <a
                  href="https://t.me/GelyshaG"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-800 hover:underline"
                >
                  Telegram
                </a>
                <a
                  href="https://wa.me/qr/7SVQ24ROVJ7IK1"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-zinc-500 underline-offset-4 transition hover:text-zinc-800 hover:underline"
                >
                  WhatsApp
                </a>
              </span>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
