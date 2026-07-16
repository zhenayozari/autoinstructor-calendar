import { Settings } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import type {
  LessonType,
  School,
} from "@/lib/types";
import { LessonTypesSettings } from "@/components/admin/lesson-types-settings";
import { SchoolsSettings } from "@/components/admin/schools-settings";
import {
  Card,
  CardContent,
  CardDescription,
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
      | "default_price_amount"
      | "tags"
      | "sort_order"
      | "is_active"
    >
  >;

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

async function loadLessonTypes(
  supabase: SupabaseClient,
  enabled: boolean,
): Promise<{ data: EditableLessonType[]; error: { message: string } | null }> {
  if (!enabled) {
    return { data: [], error: null };
  }

  const result = await supabase
    .from("lesson_types")
    .select(
      "id, code, name, description, color, kind, default_duration_minutes, default_price_amount, tags, sort_order, is_active",
    )
    .order("sort_order")
    .order("name");

  if (!result.error) {
    return {
      data: (result.data ?? []) as EditableLessonType[],
      error: null,
    };
  }

  if (!isMissingColumnError(result.error)) {
    return { data: [], error: result.error };
  }

  const fallback = await supabase
    .from("lesson_types")
    .select(
      "id, code, name, description, color, kind, default_duration_minutes, tags, sort_order, is_active",
    )
    .order("sort_order")
    .order("name");

  return {
    data: ((fallback.data ?? []) as Array<
      Omit<EditableLessonType, "default_price_amount">
    >).map((lessonType) => ({
      ...lessonType,
      default_price_amount: null,
    })),
    error: fallback.error,
  };
}

export default async function AdminSettingsPage() {
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const canManageCatalog = membership.role === "owner";
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const [
    { data: lessonTypes, error: lessonTypeError },
    { data: schoolData, error: schoolError },
  ] = await Promise.all([
    loadLessonTypes(supabase, adminEnabled),
    adminEnabled
      ? supabase
          .from("schools")
          .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
          .eq("organization_id", membership.organizationId)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const loadError =
    lessonTypeError ?? schoolError;
  const schools = (schoolData ?? []) as School[];
  const visibleSchools = canManageCatalog
    ? schools
    : schools.filter((school) => school.is_active);
  const visibleLessonTypes = canManageCatalog
    ? lessonTypes
    : lessonTypes.filter((lessonType) => lessonType.is_active);

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
              Здесь задаются источники учеников, типы занятий и цены.
            </p>
          </div>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть настроек: {loadError.message}
          </div>
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

        <Card className="border-blue-200 bg-blue-50/60">
          <CardHeader className="pb-2">
            <CardTitle>Как считаются цены</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm leading-6 text-blue-950">
            <p>1. Если у занятия указана ручная цена, используется она.</p>
            <p>2. Если ручной цены нет, берётся цена источника.</p>
            <p>3. Если источник не выбран, берётся цена типа занятия.</p>
            <p>4. Если цены нет нигде, занятие попадёт в отчёты как “без цены”.</p>
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
                  Вы можете выбирать эти источники и типы занятий в расписании
                  и учениках, но менять школьные правила может только
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
