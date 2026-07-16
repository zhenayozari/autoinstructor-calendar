import Link from "next/link";
import {
  Archive,
  CircleDollarSign,
  Filter,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import { formatMoney, selectClassName } from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Instructor, LessonState, School, Slot, StudentAccess } from "@/lib/types";

export const dynamic = "force-dynamic";

type DirectorStudentsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    school?: string;
    status?: string;
    debt?: string;
  }>;
};

type StudentAccessRow = Omit<StudentAccess, "lesson_type_ids">;

type StudentBookingRow = Pick<
  Booking,
  "id" | "slot_id" | "student_access_id"
> & {
  student_access_id: string;
  price_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean;
  lesson_state: LessonState;
};

type StudentSlotRow = Pick<Slot, "id" | "start_time" | "end_time">;

type StudentSummary = {
  plannedCount: number;
  completedCount: number;
  noShowCount: number;
  paidAmount: number;
  debtAmount: number;
};

type DirectorStudent = StudentAccessRow & {
  instructor: Instructor | null;
  school: School | null;
  summary: StudentSummary;
};

function createEmptySummary(): StudentSummary {
  return {
    plannedCount: 0,
    completedCount: 0,
    noShowCount: 0,
    paidAmount: 0,
    debtAmount: 0,
  };
}

function getDebtAmount(
  booking: Pick<StudentBookingRow, "price_amount" | "paid_amount">,
) {
  return Math.max((booking.price_amount ?? 0) - (booking.paid_amount ?? 0), 0);
}

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

function StatusPill({ student }: { student: DirectorStudent }) {
  if (student.is_archived) {
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
        Архив
      </span>
    );
  }

  return (
    <span
      className={
        student.is_active
          ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
          : "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
      }
    >
      {student.is_active ? "Активен" : "Отключён"}
    </span>
  );
}

function StudentCard({ student }: { student: DirectorStudent }) {
  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">
            {student.display_label}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {student.instructor?.public_name ??
              student.instructor?.name ??
              "Инструктор не найден"}
          </p>
        </div>
        <StatusPill student={student} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          {student.school?.name ?? "Частный ученик"}
        </span>
        {student.student_phone && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {student.student_phone}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          Логин: {student.login}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">План</p>
          <p className="mt-1 text-lg font-semibold">
            {student.summary.plannedCount}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Проведено</p>
          <p className="mt-1 text-lg font-semibold">
            {student.summary.completedCount}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Неявки</p>
          <p className="mt-1 text-lg font-semibold">
            {student.summary.noShowCount}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
          <p className="text-xs font-medium text-emerald-700">Получено</p>
          <p className="mt-1 font-semibold text-emerald-950">
            {formatMoney(student.summary.paidAmount)}
          </p>
        </div>
        <div
          className={
            student.summary.debtAmount > 0
              ? "rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2"
              : "rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2"
          }
        >
          <p
            className={
              student.summary.debtAmount > 0
                ? "text-xs font-medium text-amber-700"
                : "text-xs font-medium text-zinc-500"
            }
          >
            Долг
          </p>
          <p
            className={
              student.summary.debtAmount > 0
                ? "mt-1 font-semibold text-amber-950"
                : "mt-1 font-semibold text-zinc-950"
            }
          >
            {formatMoney(student.summary.debtAmount)}
          </p>
        </div>
      </div>
    </article>
  );
}

export default async function DirectorStudentsPage({
  searchParams,
}: DirectorStudentsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireDirectorAccess();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name, timezone, is_active",
    );
  const instructors = (instructorData ?? []) as Instructor[];
  const instructorIds = instructors.map((instructor) => instructor.id);
  const [
    { data: schoolData, error: schoolError },
    { data: accessData, error: accessError },
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    instructorIds.length > 0
      ? supabase
          .from("student_accesses")
          .select(
            "id, instructor_id, display_label, student_phone, login, total_lesson_limit, weekly_lesson_limit, school_id, is_active, is_archived, archived_at, created_at, updated_at",
          )
          .eq("organization_id", membership.organizationId)
          .in("instructor_id", instructorIds)
          .order("display_label")
      : Promise.resolve({ data: [], error: null }),
  ]);
  const accesses = (accessData ?? []) as StudentAccessRow[];
  const accessIds = accesses.map((access) => access.id);
  const { data: bookingData, error: bookingError } =
    accessIds.length > 0
      ? await supabase
          .from("bookings")
          .select(
            "id, slot_id, student_access_id, price_amount, paid_amount, is_paid, lesson_state",
          )
          .in("student_access_id", accessIds)
          .eq("status", "confirmed")
      : { data: [], error: null };
  const bookings = (bookingData ?? []) as StudentBookingRow[];
  const slotIds = bookings.map((booking) => booking.slot_id);
  const { data: slotData, error: slotError } =
    slotIds.length > 0
      ? await supabase
          .from("slots")
          .select("id, start_time, end_time")
          .in("id", slotIds)
      : { data: [], error: null };
  const loadError =
    instructorError ?? schoolError ?? accessError ?? bookingError ?? slotError;
  const schools = (schoolData ?? []) as School[];
  const slots = (slotData ?? []) as StudentSlotRow[];
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const bookingsByAccessId = new Map<string, StudentBookingRow[]>();

  for (const booking of bookings) {
    const items = bookingsByAccessId.get(booking.student_access_id) ?? [];
    items.push(booking);
    bookingsByAccessId.set(booking.student_access_id, items);
  }

  const students = accesses.map((access): DirectorStudent => {
    const accessBookings = bookingsByAccessId.get(access.id) ?? [];
    const summary = createEmptySummary();

    for (const booking of accessBookings) {
      if (!slotsById.has(booking.slot_id)) continue;

      if (booking.lesson_state === "scheduled") summary.plannedCount += 1;
      if (booking.lesson_state === "completed") summary.completedCount += 1;
      if (booking.lesson_state === "no_show") summary.noShowCount += 1;

      summary.paidAmount += booking.paid_amount ?? 0;
      summary.debtAmount += getDebtAmount(booking);
    }

    return {
      ...access,
      instructor: instructorsById.get(access.instructor_id) ?? null,
      school: access.school_id ? schoolsById.get(access.school_id) ?? null : null,
      summary,
    };
  });
  const selectedInstructorId =
    params.instructor && params.instructor !== "all" ? params.instructor : "all";
  const selectedSchoolId =
    params.school && params.school !== "all" ? params.school : "all";
  const selectedStatus =
    params.status === "archived" || params.status === "disabled"
      ? params.status
      : "active";
  const selectedDebt = params.debt === "debt" ? "debt" : "all";
  const filteredStudents = students.filter((student) => {
    if (
      selectedInstructorId !== "all" &&
      student.instructor_id !== selectedInstructorId
    ) {
      return false;
    }

    if (selectedSchoolId !== "all" && student.school_id !== selectedSchoolId) {
      return false;
    }

    if (selectedStatus === "active" && (student.is_archived || !student.is_active)) {
      return false;
    }

    if (selectedStatus === "archived" && !student.is_archived) {
      return false;
    }

    if (selectedStatus === "disabled" && (student.is_archived || student.is_active)) {
      return false;
    }

    if (selectedDebt === "debt" && student.summary.debtAmount <= 0) {
      return false;
    }

    return true;
  });
  const activeStudents = students.filter(
    (student) => student.is_active && !student.is_archived,
  );
  const archivedStudents = students.filter((student) => student.is_archived);
  const totalDebt = students.reduce(
    (sum, student) => sum + student.summary.debtAmount,
    0,
  );
  const studentsWithDebt = students.filter(
    (student) => student.summary.debtAmount > 0,
  ).length;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ученики школы
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Общий список учеников. Доступы по-прежнему выдают инструкторы.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-4">
          <MetricCard
            label="Активные"
            value={`${activeStudents.length}`}
            description={`${archivedStudents.length} в архиве`}
          />
          <MetricCard
            label="Всего"
            value={`${students.length}`}
            description="Все доступы учеников"
          />
          <MetricCard
            label="С долгом"
            value={`${studentsWithDebt}`}
            description={formatMoney(totalDebt)}
          />
          <MetricCard
            label="Показано"
            value={`${filteredStudents.length}`}
            description="После фильтров"
          />
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-start gap-2">
            <Filter className="mt-1 size-4 shrink-0" />
            <div>
              <h2 className="font-semibold">Фильтры</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Быстрый способ найти учеников по инструктору, источнику и долгу.
              </p>
            </div>
          </div>
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-instructor">
                Инструктор
              </label>
              <select
                id="students-instructor"
                name="instructor"
                className={selectClassName}
                defaultValue={selectedInstructorId}
              >
                <option value="all">Все инструкторы</option>
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {instructor.public_name ?? instructor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-school">
                Источник
              </label>
              <select
                id="students-school"
                name="school"
                className={selectClassName}
                defaultValue={selectedSchoolId}
              >
                <option value="all">Все источники</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-status">
                Статус
              </label>
              <select
                id="students-status"
                name="status"
                className={selectClassName}
                defaultValue={selectedStatus}
              >
                <option value="active">Активные</option>
                <option value="disabled">Отключённые</option>
                <option value="archived">Архив</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-debt">
                Долг
              </label>
              <select
                id="students-debt"
                name="debt"
                className={selectClassName}
                defaultValue={selectedDebt}
              >
                <option value="all">Все</option>
                <option value="debt">Только с долгом</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="h-10 w-full">
                Показать
              </Button>
            </div>
          </form>
        </section>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserRoundCheck className="size-4" />
                  Список учеников
                </CardTitle>
                <CardDescription>
                  Просмотр для руководителя. Редактирование остаётся у инструктора.
                </CardDescription>
              </div>
              <Button
                nativeButton={false}
                render={<Link href="/director/reports" />}
                variant="outline"
                className="h-9"
              >
                <CircleDollarSign className="size-4" />
                Итоги
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filteredStudents.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                По выбранным фильтрам учеников нет.
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredStudents.map((student) => (
                  <StudentCard key={student.id} student={student} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="size-4" />
                Инструкторы
              </CardTitle>
              <CardDescription>
                У каждого ученика видно, за каким инструктором он закреплён.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="size-4" />
                Архив
              </CardTitle>
              <CardDescription>
                Архивные ученики скрыты по умолчанию, но доступны фильтром.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="size-4" />
                Долги
              </CardTitle>
              <CardDescription>
                Долг считается по всем подтверждённым записям ученика.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </main>
  );
}
