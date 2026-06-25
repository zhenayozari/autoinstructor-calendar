import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  Settings,
  UserRoundPen,
  UsersRound,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { AccessCodeForm } from "@/components/admin/access-code-form";
import { LessonTypesSettings } from "@/components/admin/lesson-types-settings";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
  timezone: string;
};

type InstructorSetting = {
  instructor_id: string;
  booking_access_code: string | null;
  booking_access_code_updated_at: string | null;
};

type AccessCodeHistoryItem = {
  id: string;
  instructor_id: string;
  access_code: string;
  created_at: string;
};

type LessonType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  kind: "driving" | "theory";
  default_duration_minutes: number;
  tags: string[];
  sort_order: number;
  is_active: boolean;
};

export default async function AdminSettingsPage() {
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  let instructorQuery = supabase
    .from("instructors")
    .select("id, name, slug, public_name, timezone")
    .eq("organization_id", membership.organizationId)
    .eq("is_active", true)
    .order("name");

  if (membership.isInstructor && membership.instructorId) {
    instructorQuery = instructorQuery.eq("id", membership.instructorId);
  }

  const { data: instructorData, error: instructorError } =
    await instructorQuery;
  const instructors = (instructorData ?? []) as Instructor[];
  const instructorIds = instructors.map((instructor) => instructor.id);
  const initialInstructorId =
    membership.instructorId &&
    instructors.some(
      (instructor) => instructor.id === membership.instructorId,
    )
      ? membership.instructorId
      : "";

  const [
    { data: settingsData, error: settingsError },
    { data: accessCodeHistoryData, error: accessCodeHistoryError },
    { data: lessonTypeData, error: lessonTypeError },
  ] = await Promise.all([
    adminEnabled && instructorIds.length > 0
      ? supabase
          .from("instructor_settings")
          .select(
            "instructor_id, booking_access_code, booking_access_code_updated_at",
          )
          .in("instructor_id", instructorIds)
      : Promise.resolve({ data: [], error: null }),
    adminEnabled && instructorIds.length > 0
      ? supabase
          .from("booking_access_code_history")
          .select("id, instructor_id, access_code, created_at")
          .in("instructor_id", instructorIds)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [], error: null }),
    membership.isOwnerOrAdmin
      ? supabase
          .from("lesson_types")
          .select(
            "id, code, name, description, color, kind, default_duration_minutes, tags, sort_order, is_active",
          )
          .order("sort_order")
          .order("name")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const loadError =
    instructorError ?? settingsError ?? accessCodeHistoryError ?? lessonTypeError;
  const settings = (settingsData ?? []) as InstructorSetting[];
  const accessCodeHistory = (accessCodeHistoryData ??
    []) as AccessCodeHistoryItem[];
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];

  return (
    <main className="min-h-screen bg-zinc-100 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Настройки системы
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Запись и типы занятий
              </h1>
              <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
                Вы вошли как{" "}
                <span className="font-semibold text-zinc-900">
                  {membership.role}
                </span>{" "}
                · {membership.user.email}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/admin" />}
              >
                <Home />
                Главная
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/admin/schedule" />}
              >
                <CalendarDays />
                Расписание
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/admin/bookings" />}
              >
                <ClipboardList />
                Записи
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={
                  <Link
                    href={
                      initialInstructorId
                        ? `/admin/profile?instructor=${initialInstructorId}`
                        : "/admin/profile"
                    }
                  />
                }
              >
                <UserRoundPen />
                Профиль
              </Button>
              {membership.isOwnerOrAdmin && (
                <Button
                  variant="outline"
                  className="h-10"
                  nativeButton={false}
                  render={<Link href="/admin/team" />}
                >
                  <UsersRound />
                  Команда
                </Button>
              )}
              <form action={logoutAction}>
                <Button type="submit" variant="outline" className="h-10 w-full">
                  <LogOut />
                  Выйти
                </Button>
              </form>
            </div>
          </div>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть настроек: {loadError.message}
          </div>
        )}

        <AccessCodeForm
          instructors={instructors}
          settings={settings}
          history={accessCodeHistory}
          enabled={adminEnabled}
          saltConfigured={Boolean(process.env.BOOKING_CODE_SALT)}
          initialInstructorId={initialInstructorId}
        />

        {membership.isOwnerOrAdmin && (
          <LessonTypesSettings
            lessonTypes={lessonTypes}
            enabled={adminEnabled}
          />
        )}

        {!membership.isOwnerOrAdmin && (
          <div className="rounded-2xl border bg-white px-4 py-5 text-sm text-zinc-600 shadow-sm sm:px-6">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-100">
                <Settings className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-zinc-950">
                  Типы занятий управляются администратором
                </p>
                <p className="mt-1 text-zinc-500">
                  Инструктор может менять своё кодовое слово, но справочник
                  типов занятий доступен только owner/admin.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
