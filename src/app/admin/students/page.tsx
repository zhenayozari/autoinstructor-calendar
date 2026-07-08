import Link from "next/link";
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  buildActiveInstructorsQuery,
  getSelectedInstructor,
  getSelectedInstructorId,
} from "@/lib/queries";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Instructor,
  LessonType,
  School,
  Slot,
  StudentRegistrationRequest,
} from "@/lib/types";
import {
  StudentAccessesPanel,
  type StudentAccessCrm,
  type StudentAccessCrmSummary,
} from "@/components/admin/student-accesses-panel";

export const dynamic = "force-dynamic";

type AdminStudentsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
  }>;
};

type StudentAccessRow = {
  id: string;
  instructor_id: string;
  display_label: string;
  student_phone: string | null;
  login: string;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
  school_id: string | null;
  is_active: boolean;
  is_archived: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type StudentAccessLessonTypeRow = {
  student_access_id: string;
  lesson_type_id: string;
};

type StudentBookingRow = Pick<
  Booking,
  | "id"
  | "slot_id"
  | "student_access_id"
  | "price_amount"
  | "paid_amount"
  | "is_paid"
  | "lesson_state"
> & {
  student_access_id: string;
};

type StudentSlotRow = Pick<
  Slot,
  "id" | "lesson_type_id" | "start_time" | "end_time" | "school_id"
>;

export default async function AdminStudentsPage({
  searchParams,
}: AdminStudentsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name",
    );
  const instructors = (instructorData ?? []) as Instructor[];
  const selectedInstructorId = getSelectedInstructorId(
    membership,
    params.instructor,
  );
  const selectedInstructor = getSelectedInstructor(
    instructors,
    selectedInstructorId,
  );
  const selectedInstructorIds = selectedInstructor ? [selectedInstructor.id] : [];

  const [
    { data: lessonTypeData, error: lessonTypeError },
    { data: schoolData, error: schoolError },
    { data: accessData, error: accessError },
    { data: requestData, error: requestError },
  ] = await Promise.all([
    supabase
      .from("lesson_types")
      .select(
        "id, code, name, color, kind, tags, sort_order, is_active, default_duration_minutes, default_price_amount, requires_vehicle",
      )
      .order("sort_order")
      .order("name"),
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    adminEnabled && selectedInstructorIds.length > 0
      ? supabase
          .from("student_accesses")
          .select(
            "id, instructor_id, display_label, student_phone, login, total_lesson_limit, weekly_lesson_limit, school_id, is_active, is_archived, archived_at, created_at, updated_at",
          )
          .eq("organization_id", membership.organizationId)
          .in("instructor_id", selectedInstructorIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    adminEnabled && selectedInstructorIds.length > 0
      ? supabase
          .from("student_registration_requests")
          .select(
            "id, organization_id, instructor_id, first_name, last_name, student_phone, school_text, login, status, reviewed_at, created_at, updated_at",
          )
          .eq("organization_id", membership.organizationId)
          .in("instructor_id", selectedInstructorIds)
          .eq("status", "pending")
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
  const { data: bookingData, error: bookingError } =
    adminEnabled && accessIds.length > 0
      ? await supabase
          .from("bookings")
          .select(
            "id, slot_id, student_access_id, price_amount, paid_amount, is_paid, lesson_state",
          )
          .in("student_access_id", accessIds)
          .eq("status", "confirmed")
      : { data: [], error: null };
  const studentBookings = (bookingData ?? []) as StudentBookingRow[];
  const bookedSlotIds = studentBookings.map((booking) => booking.slot_id);
  const { data: slotData, error: slotError } =
    adminEnabled && bookedSlotIds.length > 0
      ? await supabase
          .from("slots")
          .select("id, lesson_type_id, start_time, end_time, school_id")
          .in("id", bookedSlotIds)
          .order("start_time", { ascending: false })
      : { data: [], error: null };
  const studentSlots = (slotData ?? []) as StudentSlotRow[];
  const lessonTypeIdsByAccessId = new Map<string, string[]>();

  for (const item of accessLessonTypes) {
    const ids = lessonTypeIdsByAccessId.get(item.student_access_id) ?? [];
    ids.push(item.lesson_type_id);
    lessonTypeIdsByAccessId.set(item.student_access_id, ids);
  }

  const loadError =
    instructorError ??
    lessonTypeError ??
    schoolError ??
    accessError ??
    requestError ??
    accessLessonTypeError ??
    bookingError ??
    slotError;
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const schools = (schoolData ?? []) as School[];
  const pendingRequests = (requestData ?? []) as StudentRegistrationRequest[];
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const slotsById = new Map(studentSlots.map((slot) => [slot.id, slot]));
  const bookingsByAccessId = new Map<string, StudentBookingRow[]>();

  for (const booking of studentBookings) {
    const items = bookingsByAccessId.get(booking.student_access_id) ?? [];
    items.push(booking);
    bookingsByAccessId.set(booking.student_access_id, items);
  }

  const panelAccesses: StudentAccessCrm[] = accesses.map((access) => {
    const accessBookings = bookingsByAccessId.get(access.id) ?? [];
    const lessons = accessBookings
      .map((booking) => {
        const slot = slotsById.get(booking.slot_id);
        if (!slot) return null;

        return {
          booking,
          slot,
          lessonType: lessonTypesById.get(slot.lesson_type_id),
        };
      })
      .filter(
        (
          item,
        ): item is {
          booking: StudentBookingRow;
          slot: StudentSlotRow;
          lessonType: LessonType | undefined;
        } => Boolean(item),
      )
      .sort(
        (first, second) =>
          new Date(second.slot.start_time).getTime() -
          new Date(first.slot.start_time).getTime(),
      );
    const plannedCount = lessons.filter(
      ({ booking }) => booking.lesson_state === "scheduled",
    ).length;
    const completedLessons = lessons.filter(
      ({ booking }) => booking.lesson_state === "completed",
    );
    const noShowCount = lessons.filter(
      ({ booking }) => booking.lesson_state === "no_show",
    ).length;
    const paidCount = completedLessons.filter(
      ({ booking }) => booking.is_paid,
    ).length;
    const unpaidCompletedLessons = completedLessons.filter(
      ({ booking }) => !booking.is_paid,
    );
    const crm: StudentAccessCrmSummary = {
      plannedCount,
      completedCount: completedLessons.length,
      noShowCount,
      paidCount,
      unpaidCompletedCount: unpaidCompletedLessons.length,
      debtAmount: unpaidCompletedLessons.reduce(
        (sum, { booking }) =>
          sum + Math.max((booking.price_amount ?? 0) - (booking.paid_amount ?? 0), 0),
        0,
      ),
      lastLessons: lessons.slice(0, 5).map(({ booking, slot, lessonType }) => ({
        id: booking.id,
        startsAt: slot.start_time,
        lessonTypeName: lessonType?.name ?? "Занятие",
        lessonState: booking.lesson_state,
        isPaid: booking.is_paid,
        priceAmount: booking.price_amount ?? null,
        paidAmount: booking.paid_amount ?? 0,
      })),
    };

    return {
      ...access,
      school: access.school_id ? schoolsById.get(access.school_id) ?? null : null,
      crm,
      lesson_type_ids: lessonTypeIdsByAccessId.get(access.id) ?? [],
    };
  });
  const activeAccesses = panelAccesses.filter((a) => !a.is_archived);
  const archivedAccesses = panelAccesses.filter((a) => a.is_archived);

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">

        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Мини-CRM
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Ученики
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Активные ученики, доступы для записи, прогресс занятий и долги в
              одном рабочем списке.
            </p>
            <Link
              href="/student/register"
              className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition hover:bg-zinc-50"
            >
              Страница регистрации ученика
            </Link>
          </div>
        </header>

        <details className="group rounded-2xl border border-blue-200 bg-blue-50/60">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-blue-950 sm:px-5">
            Как это работает
            <span className="text-sm font-medium text-blue-800 transition group-open:rotate-180">
              ↓
            </span>
          </summary>
          <div className="grid gap-3 border-t border-blue-100 px-4 py-4 text-sm text-blue-950 md:grid-cols-3 sm:px-5">
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">1. Добавляете ученика</p>
              <p className="mt-1 text-blue-900/80">
                Указываете имя, логин, PIN и типы занятий, которые ему доступны.
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">2. Копируете данные</p>
              <p className="mt-1 text-blue-900/80">
                Отправляете ученику ссылку, логин и PIN в любом мессенджере.
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">3. Ведёте прогресс</p>
              <p className="mt-1 text-blue-900/80">
                В карточке видно план, проведённые занятия, оплату и долг.
              </p>
            </div>
          </div>
        </details>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить учеников: {loadError.message}
          </div>
        )}

        {selectedInstructor ? (
          <StudentAccessesPanel
            instructors={instructors}
            lessonTypes={lessonTypes}
            schools={schools}
            accesses={activeAccesses}
            archivedAccesses={archivedAccesses}
            pendingRequests={pendingRequests}
            selectedInstructorId={selectedInstructor.id}
            canSelectInstructor={false}
            adminEnabled={adminEnabled}
          />
        ) : (
          <div className="rounded-2xl border border-dashed bg-white px-4 py-10 text-center text-sm text-zinc-500">
            Нет профиля для добавления учеников.
          </div>
        )}
      </div>
    </main>
  );
}
