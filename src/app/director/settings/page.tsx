import { AccountCredentialsForm } from "@/components/account/account-credentials-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LessonTypesSettings } from "@/components/admin/lesson-types-settings";
import { PriceMatrixSettings } from "@/components/admin/price-matrix-settings";
import { SchoolsSettings } from "@/components/admin/schools-settings";
import { requireDirectorAccess } from "@/lib/director-auth";
import { getSchedulableLessonTypes } from "@/lib/lesson-types";
import { queryOne, queryRows } from "@/lib/db/postgres";
import type { LessonType, School, SchoolLessonTypePrice } from "@/lib/types";

export const dynamic = "force-dynamic";

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type EditableLessonType = LessonType &
  Required<
    Pick<
      LessonType,
      | "code"
      | "description"
      | "kind"
      | "default_duration_minutes"
      | "tags"
      | "sort_order"
      | "is_active"
    >
  >;

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

export default async function DirectorSettingsPage() {
  const membership = await requireDirectorAccess();
  const canManageCatalog = membership.role === "owner";
  const adminEnabled = true;
  const [organization, schools, lessonTypes, prices] = await Promise.all([
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
    queryRows<EditableLessonType>(
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
  const activeSchools = schools.filter((school) => school.is_active !== false);
  const hiddenSchools = schools.length - activeSchools.length;
  const activeLessonTypes = lessonTypes.filter(
    (lessonType) => lessonType.is_active !== false,
  );
  const hiddenLessonTypes = lessonTypes.length - activeLessonTypes.length;
  const pricedSchoolCount = new Set(prices.map((price) => price.school_id)).size;
  const visibleSchools = canManageCatalog ? schools : activeSchools;
  const visibleLessonTypes = canManageCatalog ? lessonTypes : activeLessonTypes;
  const priceLessonTypes = getSchedulableLessonTypes(visibleLessonTypes);

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
              canManageCredentials
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

        {!canManageCatalog && (
          <Card>
            <CardHeader>
              <CardTitle>Просмотр справочников</CardTitle>
              <CardDescription>
                Редактировать источники, типы занятий и цены может только
                владелец школы.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <SchoolsSettings
          schools={visibleSchools}
          adminEnabled={adminEnabled}
          canManage={canManageCatalog}
        />

        <LessonTypesSettings
          lessonTypes={visibleLessonTypes}
          adminEnabled={adminEnabled}
          canManage={canManageCatalog}
        />

        <PriceMatrixSettings
          schools={visibleSchools}
          lessonTypes={priceLessonTypes}
          prices={prices}
          adminEnabled={adminEnabled}
          canManage={canManageCatalog}
        />
      </div>
    </main>
  );
}
