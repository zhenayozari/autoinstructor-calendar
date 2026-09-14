import Link from "next/link";
import { ExternalLink, Globe2, Settings2, UsersRound } from "lucide-react";
import {
  InstructorSiteSettingsForm,
  LegalDocumentsSettings,
  OrganizationSiteSettingsForm,
} from "@/components/director/site-settings-forms";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryOne, queryRows } from "@/lib/db/postgres";
import { getLegalDocumentsForOrganization } from "@/lib/legal-documents";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  InstructorProfile,
  InstructorSiteSettings,
  LegalDocument,
  OrganizationSiteSettings,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type Organization = {
  id: string;
  name: string;
};

type InstructorRow = InstructorProfile & {
  organization_id: string;
  is_active: boolean;
  site_settings?: InstructorSiteSettings | null;
};

function getDefaultSiteSettings(
  organizationId: string,
  organizationName?: string | null,
): OrganizationSiteSettings {
  const title = organizationName || "Автоинструктор";

  return {
    organization_id: organizationId,
    hero_label: "Автоинструктор",
    hero_title: title,
    hero_text:
      "Индивидуальные занятия по вождению и спокойная подготовка к дороге.",
    about_title: "О занятиях",
    about_text:
      "Здесь можно рассказать о подходе, опыте, автомобиле, формате занятий и правилах записи.",
    contact_phone: null,
    telegram_url: null,
    whatsapp_url: null,
    landing_content: {},
    show_about: true,
    show_lesson_types: true,
    show_instructors: true,
    show_contacts: true,
    show_student_login: true,
    require_student_profile_consent: true,
    updated_at: new Date(0).toISOString(),
  };
}

export default async function DirectorSitePage() {
  const membership = await requireDirectorAccess();
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend || hasSupabaseAdminKey();
  let organization: Organization | null = null;
  let settingsData: OrganizationSiteSettings | null = null;
  let instructorData: InstructorRow[] = [];
  let instructorSettingsData: InstructorSiteSettings[] = [];
  let legalDocuments: LegalDocument[] = [];
  let loadError: { message: string } | null = null;

  if (postgresBackend) {
    [
      organization,
      settingsData,
      instructorData,
      instructorSettingsData,
      legalDocuments,
    ] = await Promise.all([
      queryOne<Organization>(
        `
          select id, name
          from public.organizations
          where id = $1
        `,
        [membership.organizationId],
      ),
      queryOne<OrganizationSiteSettings>(
        `
          select organization_id, hero_label, hero_title, hero_text,
                 about_title, about_text, contact_phone, telegram_url,
                 whatsapp_url, landing_content, show_about, show_lesson_types,
                 show_instructors, show_contacts, show_student_login,
                 require_student_profile_consent,
                 updated_at::text as updated_at
          from public.organization_site_settings
          where organization_id = $1
        `,
        [membership.organizationId],
      ),
      queryRows<InstructorRow>(
        `
          select id, organization_id, name, slug, public_name, timezone,
                 is_active, photo_url, short_bio, contact_text,
                 car_description, experience_text, public_is_visible,
                 profile_updated_at::text as profile_updated_at
          from public.instructors
          where organization_id = $1
          order by name
        `,
        [membership.organizationId],
      ),
      queryRows<InstructorSiteSettings>(
        `
          select instructor_id, organization_id, is_visible, show_photo,
                 show_bio, show_contact, show_car, show_experience,
                 public_note, public_contact, sort_order,
                 updated_at::text as updated_at
          from public.instructor_site_settings
          where organization_id = $1
        `,
        [membership.organizationId],
      ),
      getLegalDocumentsForOrganization(membership.organizationId),
    ]);
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();

    const [
      { data: organizationResult, error: organizationError },
      { data: settingsResult, error: settingsError },
      { data: instructorResult, error: instructorError },
      { data: instructorSettingsResult, error: instructorSettingsError },
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name")
        .eq("id", membership.organizationId)
        .maybeSingle(),
      supabase
        .from("organization_site_settings")
        .select(
          "organization_id, hero_label, hero_title, hero_text, about_title, about_text, contact_phone, telegram_url, whatsapp_url, landing_content, show_about, show_lesson_types, show_instructors, show_contacts, show_student_login, updated_at",
        )
        .eq("organization_id", membership.organizationId)
        .maybeSingle(),
      supabase
        .from("instructors")
        .select(
          "id, organization_id, name, slug, public_name, timezone, is_active, photo_url, short_bio, contact_text, car_description, experience_text, public_is_visible, profile_updated_at",
        )
        .eq("organization_id", membership.organizationId)
        .order("name"),
      supabase
        .from("instructor_site_settings")
        .select(
          "instructor_id, organization_id, is_visible, show_photo, show_bio, show_contact, show_car, show_experience, public_note, public_contact, sort_order, updated_at",
        )
        .eq("organization_id", membership.organizationId),
    ]);

    organization = organizationResult as Organization | null;
    settingsData = settingsResult as OrganizationSiteSettings | null;
    instructorData = (instructorResult ?? []) as InstructorRow[];
    instructorSettingsData = (instructorSettingsResult ??
      []) as InstructorSiteSettings[];
    loadError =
      organizationError ??
      settingsError ??
      instructorError ??
      instructorSettingsError;
  }

  const settings =
    settingsData ??
    getDefaultSiteSettings(membership.organizationId, organization?.name);
  const instructorSettings = instructorSettingsData;
  const settingsByInstructorId = new Map(
    instructorSettings.map((item) => [item.instructor_id, item]),
  );
  const instructors = instructorData.map((instructor) => ({
    ...instructor,
    site_settings: settingsByInstructorId.get(instructor.id) ?? null,
  }));
  const visibleInstructors = instructors.filter(
    (instructor) => instructor.site_settings?.is_visible,
  ).length;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Кабинет руководителя
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Сайт-визитка
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                Тексты, контакты и блоки главной страницы. Этот раздел можно
                спокойно настраивать с компьютера или планшета.
              </p>
            </div>
            <Button
              nativeButton={false}
              render={<Link href="/" target="_blank" />}
              variant="outline"
            >
              <ExternalLink />
              Открыть сайт
            </Button>
          </div>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить настройки сайта: {loadError.message}
          </div>
        )}

        <section className="grid gap-3 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe2 className="size-4" />
                Главная
              </CardTitle>
              <CardDescription>
                Заголовок, описание, контакты и кнопки входа.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="size-4" />
                Инструкторы
              </CardTitle>
              <CardDescription>
                На сайте включено: {visibleInstructors} из {instructors.length}.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="size-4" />
                Управление
              </CardTitle>
              <CardDescription>
                Публичная запись через общий календарь отключается. Ученики
                входят только в личный кабинет.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Блоки лендинга</CardTitle>
            <CardDescription>
              Здесь можно включать и выключать секции сайта, менять заголовки,
              абзацы, карточки, шаги и контакты.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OrganizationSiteSettingsForm settings={settings} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Правовые документы</CardTitle>
            <CardDescription>
              Файлы для публичных ссылок на сайте и дальнейших чекбоксов в
              регистрациях. Черновики посетителям не показываются.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LegalDocumentsSettings
              documents={legalDocuments}
              enabled={postgresBackend}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Инструкторы на сайте</CardTitle>
            <CardDescription>
              Руководитель решает, кого показывать и какие данные видны
              публично. Номер телефона можно не указывать совсем.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {instructors.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
                Сотрудники пока не добавлены.
              </div>
            ) : (
              instructors.map((instructor) => (
                <InstructorSiteSettingsForm
                  key={instructor.id}
                  instructor={instructor}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
