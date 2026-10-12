import { Settings } from "lucide-react";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import {
  getInstructorPayoutSettings,
  getInstructorSourceVisibility,
} from "@/lib/instructor-payouts";
import { getSchedulableLessonTypes } from "@/lib/lesson-types";
import type { LessonType, School, SchoolLessonTypePrice } from "@/lib/types";
import { LessonTypesSettings } from "@/components/admin/lesson-types-settings";
import { PriceMatrixSettings } from "@/components/admin/price-matrix-settings";
import { SchoolsSettings } from "@/components/admin/schools-settings";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

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

export default async function AdminSettingsPage() {
  const membership = await requireActiveOrganizationMember();
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend;
  const canManageCatalog = membership.role === "owner";
  let lessonTypes: EditableLessonType[] = [];
  let schools: School[] = [];
  let prices: SchoolLessonTypePrice[] = [];
  let instructorVisibleSchoolIds: Set<string> | null = null;

  [lessonTypes, schools, prices] = await Promise.all([
      queryRows<EditableLessonType>(
        `
          select id, code, name, description, color, kind,
                 default_duration_minutes, tags, sort_order, is_active
          from public.lesson_types
          order by sort_order, name
        `,
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

    if (membership.isInstructor && membership.instructorId) {
      const payoutSettings = await getInstructorPayoutSettings({
        organizationId: membership.organizationId,
        instructorId: membership.instructorId,
      });

      if (payoutSettings?.source_visibility_mode === "selected_only") {
        const sourceVisibility = await getInstructorSourceVisibility({
          organizationId: membership.organizationId,
          instructorId: membership.instructorId,
        });

        instructorVisibleSchoolIds = new Set(
          sourceVisibility
            .filter((item) => item.is_visible)
            .map((item) => item.school_id),
        );
      }
    }
  const baseVisibleSchools = canManageCatalog
    ? schools
    : schools.filter((school) => school.is_active);
  const visibleSchools = instructorVisibleSchoolIds
    ? baseVisibleSchools.filter((school) =>
        instructorVisibleSchoolIds?.has(school.id),
      )
    : baseVisibleSchools;
  const visibleLessonTypes = canManageCatalog
    ? lessonTypes
    : lessonTypes.filter((lessonType) => lessonType.is_active);
  const priceLessonTypes = getSchedulableLessonTypes(visibleLessonTypes);

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Настройки
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Справочники и цены
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Здесь задаются источники учеников, типы занятий, длительность и
              цены по источникам.
            </p>
          </div>
        </header>

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

        <Card className="border-blue-200 bg-blue-50/60">
          <CardHeader className="pb-2">
            <CardTitle>Как считаются цены</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-blue-950">
            <p>
              1. При записи ученика система смотрит источник ученика и тип
              занятия.
            </p>
            <p>
              2. Если для этой пары задана цена, она попадает в поле “К
              оплате”.
            </p>
            <p>
              3. В карточке занятого слота инструктор может вручную поправить
              “К оплате” и “Получено”.
            </p>
            <p>
              4. В отчёты попадает фактическая цена записи, которую можно
              проверить и изменить в расписании.
            </p>
          </CardContent>
        </Card>

        {!canManageCatalog && (
          <div className="rounded-2xl border bg-white px-4 py-5 text-sm text-zinc-600 shadow-sm sm:px-6">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
                <Settings className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-zinc-950">
                  Справочники задаёт руководитель
                </p>
                <p className="mt-1 text-zinc-500">
                  Вы можете выбирать эти источники в карточках учеников и типы
                  занятий в расписании, но менять школьные правила может только
                  руководитель.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
