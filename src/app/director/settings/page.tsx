import Link from "next/link";
import {
  CircleDollarSign,
  GraduationCap,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountCredentialsForm } from "@/components/account/account-credentials-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import {
  isMissingPricingTableError,
  normalizeSchoolPaymentRule,
} from "@/lib/pricing";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryOne, queryRows } from "@/lib/db/postgres";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { LessonType, School, SchoolLessonTypePrice } from "@/lib/types";

export const dynamic = "force-dynamic";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type CatalogItemProps = {
  title: string;
  subtitle: string;
  color?: string;
  isActive?: boolean;
  meta: string;
};

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function CatalogItem({
  title,
  subtitle,
  color,
  isActive = true,
  meta,
}: CatalogItemProps) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {color && (
              <span
                className="size-3 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: color }}
              />
            )}
            <p className="truncate font-semibold">{title}</p>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
        </div>
        <span
          className={
            isActive
              ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
              : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
          }
        >
          {isActive ? "Активен" : "Скрыт"}
        </span>
      </div>
      <p className="mt-3 text-sm font-medium text-zinc-700">{meta}</p>
    </div>
  );
}

function getPaymentRuleLabel(value: School["payment_rule"]) {
  const rule = normalizeSchoolPaymentRule(value);

  if (rule === "prepaid") return "предоплата";
  if (rule === "settle_later") return "расчёт позже";
  return "вручную";
}

function getLessonKindLabel(lessonType: LessonType) {
  if (lessonType.kind === "theory") return "Теория";
  if (lessonType.tags?.includes("gift")) return "Подарочное";
  return "Вождение";
}

export default async function DirectorSettingsPage() {
  const membership = await requireDirectorAccess();
  let organization: Organization | null = null;
  let schools: School[] = [];
  let lessonTypes: LessonType[] = [];
  let prices: SchoolLessonTypePrice[] = [];
  let loadError: { message: string } | null = null;

  if (isPostgresBackend()) {
    [organization, schools, lessonTypes, prices] = await Promise.all([
      queryOne<Organization>(
        `
          select id, name, slug
          from public.organizations
          where id = $1
          limit 1
        `,
        [membership.organizationId],
      ),
      queryRows<School>(
        `
          select id, organization_id, name, color, default_price, payment_rule,
                 is_active, created_at::text as created_at, updated_at::text as updated_at
          from public.schools
          where organization_id = $1
          order by name
        `,
        [membership.organizationId],
      ),
      queryRows<LessonType>(
        `
          select id, code, name, color, kind, description,
                 default_duration_minutes, default_price_amount, tags,
                 sort_order, is_active, requires_vehicle
          from public.lesson_types
          order by sort_order, name
        `,
      ),
      queryRows<SchoolLessonTypePrice>(
        `
          select id, organization_id, school_id, lesson_type_id, price_amount,
                 created_at::text as created_at, updated_at::text as updated_at
          from public.school_lesson_type_prices
          where organization_id = $1
        `,
        [membership.organizationId],
      ),
    ]);
  } else {
    const supabase = hasSupabaseAdminKey()
      ? createAdminClient()
      : await createClient();
    const [
      { data: organizationData, error: organizationError },
      { data: schoolData, error: schoolError },
      { data: lessonTypeData, error: lessonTypeError },
      { data: priceData, error: priceError },
    ] = await Promise.all([
      supabase
        .from("organizations")
        .select("id, name, slug")
        .eq("id", membership.organizationId)
        .maybeSingle(),
      supabase
        .from("schools")
        .select(
          "id, organization_id, name, color, default_price, payment_rule, is_active, created_at, updated_at",
        )
        .eq("organization_id", membership.organizationId)
        .order("name"),
      supabase
        .from("lesson_types")
        .select(
          "id, code, name, color, kind, description, default_duration_minutes, tags, sort_order, is_active, requires_vehicle",
        )
        .order("sort_order")
        .order("name"),
      supabase
        .from("school_lesson_type_prices")
        .select(
          "id, organization_id, school_id, lesson_type_id, price_amount, created_at, updated_at",
        )
        .eq("organization_id", membership.organizationId),
    ]);
    const normalizedPriceError =
      priceError && !isMissingPricingTableError(priceError) ? priceError : null;

    loadError =
      organizationError ?? schoolError ?? lessonTypeError ?? normalizedPriceError;
    organization = organizationData as Organization | null;
    schools = (schoolData ?? []) as School[];
    lessonTypes = (lessonTypeData ?? []) as LessonType[];
    prices = (priceData ?? []) as SchoolLessonTypePrice[];
  }
  const activeSchools = schools.filter((school) => school.is_active !== false);
  const hiddenSchools = schools.length - activeSchools.length;
  const activeLessonTypes = lessonTypes.filter(
    (lessonType) => lessonType.is_active !== false,
  );
  const hiddenLessonTypes = lessonTypes.length - activeLessonTypes.length;
  const pricedSchoolCount = new Set(prices.map((price) => price.school_id)).size;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Настройки школы
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {organization?.name ?? "Автошкола"} · справочники и правила
            доступа.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Вход в аккаунт</CardTitle>
            <CardDescription>
              Здесь руководитель меняет свою эл. почту для входа и пароль.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountCredentialsForm
              email={membership.user.email ?? ""}
              canManageCredentials={isPostgresBackend()}
            />
          </CardContent>
        </Card>

        <section className="grid gap-2 sm:grid-cols-3">
          <MetricCard
            label="Источники"
            value={`${activeSchools.length}`}
            description={`${hiddenSchools} скрыто`}
          />
          <MetricCard
            label="Типы занятий"
            value={`${activeLessonTypes.length}`}
            description={`${hiddenLessonTypes} скрыто`}
          />
          <MetricCard
            label="Источники с ценами"
            value={`${pricedSchoolCount}`}
            description="По матрице цен"
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="size-4" />
                    Источники
                  </CardTitle>
                  <CardDescription>
                    Автошколы, частные ученики, рекомендации и другие источники
                    заявок.
                  </CardDescription>
                </div>
                <Button
                  nativeButton={false}
                  render={<Link href="/admin/settings" />}
                  variant="outline"
                  className="h-9"
                >
                  Редактировать
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {schools.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                  Источники пока не добавлены.
                </div>
              ) : (
                schools.map((school) => (
                  <CatalogItem
                    key={school.id}
                    title={school.name}
                    subtitle="Источник ученика"
                    color={school.color}
                    isActive={school.is_active}
                    meta={`Оплата: ${getPaymentRuleLabel(school.payment_rule)}`}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CircleDollarSign className="size-4" />
                    Типы занятий
                  </CardTitle>
                  <CardDescription>
                    Вождение, допзанятия, подарочные занятия и теория.
                  </CardDescription>
                </div>
                <Button
                  nativeButton={false}
                  render={<Link href="/admin/settings" />}
                  variant="outline"
                  className="h-9"
                >
                  Редактировать
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {lessonTypes.length === 0 ? (
                <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                  Типы занятий пока не добавлены.
                </div>
              ) : (
                lessonTypes.map((lessonType) => (
                  <CatalogItem
                    key={lessonType.id}
                    title={lessonType.name}
                    subtitle={`${getLessonKindLabel(lessonType)} · ${lessonType.default_duration_minutes} мин.`}
                    color={lessonType.color}
                    isActive={lessonType.is_active !== false}
                    meta="Цена задаётся по источнику ученика"
                  />
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="size-4" />
                Где редактировать
              </CardTitle>
              <CardDescription>
                Справочники редактируются в кабинете инструктора, чтобы не было
                двух разных форм.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                Права
              </CardTitle>
              <CardDescription>
                В интерфейсе сейчас есть роли руководителя и инструктора, без
                отдельной роли администратора.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="size-4" />
                Цены
              </CardTitle>
              <CardDescription>
                В отчёты попадает фактическая цена записи. Её можно поправить в
                расписании, а стартовая цена берётся из источника ученика и
                типа занятия.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </main>
  );
}
