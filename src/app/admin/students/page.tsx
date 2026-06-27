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
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { StudentAccessesPanel } from "@/components/admin/student-accesses-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

type AdminStudentsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
  }>;
};

type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
};

type LessonType = {
  id: string;
  code: string;
  name: string;
  color: string;
  kind: "driving" | "theory";
  tags: string[];
};

type StudentAccessRow = {
  id: string;
  instructor_id: string;
  display_label: string;
  login: string;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type StudentAccessLessonTypeRow = {
  student_access_id: string;
  lesson_type_id: string;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function getInstructorLabel(instructor: Instructor) {
  return instructor.public_name ?? instructor.name;
}

export default async function AdminStudentsPage({
  searchParams,
}: AdminStudentsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  let instructorQuery = supabase
    .from("instructors")
    .select("id, name, slug, public_name")
    .eq("organization_id", membership.organizationId)
    .eq("is_active", true)
    .order("name");

  if (membership.isInstructor && membership.instructorId) {
    instructorQuery = instructorQuery.eq("id", membership.instructorId);
  }

  const { data: instructorData, error: instructorError } =
    await instructorQuery;
  const instructors = (instructorData ?? []) as Instructor[];
  const selectedInstructorId =
    membership.isOwnerOrAdmin && params.instructor
      ? params.instructor
      : membership.instructorId;
  const selectedInstructor =
    instructors.find((instructor) => instructor.id === selectedInstructorId) ??
    instructors[0] ??
    null;
  const selectedInstructorIds = selectedInstructor ? [selectedInstructor.id] : [];

  const [
    { data: lessonTypeData, error: lessonTypeError },
    { data: accessData, error: accessError },
  ] = await Promise.all([
    supabase
      .from("lesson_types")
      .select("id, code, name, color, kind, tags")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    adminEnabled && selectedInstructorIds.length > 0
      ? supabase
          .from("student_accesses")
          .select(
            "id, instructor_id, display_label, login, total_lesson_limit, weekly_lesson_limit, is_active, created_at, updated_at",
          )
          .eq("organization_id", membership.organizationId)
          .in("instructor_id", selectedInstructorIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const accesses = (accessData ?? []) as StudentAccessRow[];
  const accessIds = accesses.map((access) => access.id);
  const { data: accessLessonTypeData, error: accessLessonTypeError } =
    adminEnabled && accessIds.length > 0
      ? await supabase
          .from("student_access_lesson_types")
          .select("student_access_id, lesson_type_id")
          .in("student_access_id", accessIds)
      : { data: [], error: null };

  const accessLessonTypes = (accessLessonTypeData ??
    []) as StudentAccessLessonTypeRow[];
  const lessonTypeIdsByAccessId = new Map<string, string[]>();

  for (const item of accessLessonTypes) {
    const ids = lessonTypeIdsByAccessId.get(item.student_access_id) ?? [];
    ids.push(item.lesson_type_id);
    lessonTypeIdsByAccessId.set(item.student_access_id, ids);
  }

  const loadError =
    instructorError ?? lessonTypeError ?? accessError ?? accessLessonTypeError;
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const panelAccesses = accesses.map((access) => ({
    ...access,
    lesson_type_ids: lessonTypeIdsByAccessId.get(access.id) ?? [],
  }));

  return (
    <main className="min-h-screen bg-zinc-100 px-3 pb-24 pt-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <AdminMobileNav
          role={membership.role}
          email={membership.user.email}
          instructorName={selectedInstructor ? getInstructorLabel(selectedInstructor) : null}
          showTeam={membership.isOwnerOrAdmin}
        />

        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Доступы учеников
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Ученики
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                Создавайте короткие доступы без телефонов и email: ученик
                получает ссылку, логин и PIN, а дальше видит только разрешённые
                типы занятий.
              </p>
            </div>

            <div className="hidden grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
                render={<Link href="/admin/settings" />}
              >
                <Settings />
                Настройки
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={
                  <Link
                    href={
                      selectedInstructor
                        ? `/admin/profile?instructor=${selectedInstructor.id}`
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

        {membership.isOwnerOrAdmin && instructors.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Инструктор</CardTitle>
              <CardDescription>
                Выберите, для чьего расписания создавать доступы учеников.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="flex flex-col gap-3 sm:flex-row">
                <select
                  name="instructor"
                  className={selectClassName}
                  defaultValue={selectedInstructor?.id}
                >
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {getInstructorLabel(instructor)} / {instructor.slug}
                    </option>
                  ))}
                </select>
                <Button type="submit" className="h-10">
                  Показать
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card className="border-blue-200 bg-blue-50/60">
          <CardHeader className="pb-2">
            <CardTitle>Как это работает</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-blue-950 md:grid-cols-3">
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">1. Создаёте доступ</p>
              <p className="mt-1 text-blue-900/80">
                Указываете метку ученика, лимиты и разрешённые типы занятий.
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">2. Копируете данные</p>
              <p className="mt-1 text-blue-900/80">
                Отправляете ученику ссылку, логин и PIN в любом мессенджере.
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">3. Следующий этап</p>
              <p className="mt-1 text-blue-900/80">
                Подключим личный вход ученика и автоматическую проверку лимитов.
              </p>
            </div>
          </CardContent>
        </Card>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить учебные доступы: {loadError.message}
          </div>
        )}

        {selectedInstructor ? (
          <StudentAccessesPanel
            instructors={instructors}
            lessonTypes={lessonTypes}
            accesses={panelAccesses}
            selectedInstructorId={selectedInstructor.id}
            canSelectInstructor={membership.isOwnerOrAdmin}
            adminEnabled={adminEnabled}
          />
        ) : (
          <div className="rounded-2xl border border-dashed bg-white px-4 py-10 text-center text-sm text-zinc-500">
            Нет активного инструктора для создания учебных доступов.
          </div>
        )}
      </div>
    </main>
  );
}
