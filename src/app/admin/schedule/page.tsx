import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { queryRows } from "@/lib/db/postgres";
import {
  getInstructorPayoutSettings,
  getInstructorSourceVisibility,
} from "@/lib/instructor-payouts";
import { getLocalDate } from "@/lib/formatters";
import { getInitialInstructorId } from "@/lib/queries";
import { getSchedulableLessonTypes } from "@/lib/lesson-types";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type {
  Booking,
  Instructor,
  LessonType,
  ScheduleDay,
  School,
  Slot,
  StudentAccess,
} from "@/lib/types";
import { AdminScheduleWorkspace } from "@/components/admin/admin-schedule-workspace";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";

export const dynamic = "force-dynamic";

type AdminSchedulePageProps = {
  searchParams?: Promise<{
    create?: string | string[];
    date?: string | string[];
  }>;
};


export default async function AdminSchedulePage({
  searchParams,
}: AdminSchedulePageProps) {
  const params = (await searchParams) ?? {};
  const createParam = Array.isArray(params.create)
    ? params.create[0]
    : params.create;
  const dateParam = Array.isArray(params.date) ? params.date[0] : params.date;
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = true;
  let instructors: Instructor[] = [];
  let lessonTypeCatalog: LessonType[] = [];
  let schools: School[] = [];
  let scheduleDays: ScheduleDay[] = [];
  let slots: Slot[] = [];
  let bookings: Booking[] = [];
  let baseStudentAccesses: Array<Omit<StudentAccess, "lesson_type_ids">> = [];
  let studentAccessLessonTypeData: Array<{
    student_access_id: string;
    lesson_type_id: string;
  }> = [];
  instructors = await queryRows<Instructor>(
    `
      select id, name, slug, public_name, timezone
      from public.instructors
      where organization_id = $1
        and is_active = true
        and ($2::uuid is null or id = $2::uuid)
      order by name
    `,
    [
      membership.organizationId,
      membership.isInstructor ? membership.instructorId : null,
    ],
  );

  const initialInstructorId = getInitialInstructorId(
    instructors,
    membership.instructorId,
  );
  const canUseExamRoute =
    membership.role === "owner" &&
    Boolean(membership.instructorId) &&
    membership.instructorId === initialInstructorId;
  const instructorIds = instructors.map((instructor) => instructor.id);
  await autoCompletePastBookings({ instructorIds });

  const [
    lessonTypeData,
    schoolData,
    scheduleDayData,
    slotData,
    studentAccessData,
  ] = await Promise.all([
      queryRows<LessonType>(
        `
          select id, code, name, description, color, kind, requires_vehicle,
                 default_duration_minutes, default_price_amount, tags, sort_order, is_active
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
      instructorIds.length > 0
        ? queryRows<ScheduleDay>(
            `
              select id, instructor_id, date::text as date, transmission,
                     published_at::text as published_at
              from public.schedule_days
              where instructor_id = any($1::uuid[])
              order by date desc
            `,
            [instructorIds],
          )
        : Promise.resolve([]),
      instructorIds.length > 0
        ? queryRows<Slot>(
            `
              select id, instructor_id, schedule_day_id, lesson_type_id, school_id,
                     start_time::text as start_time, end_time::text as end_time,
                     location_type, status, note, created_at::text as created_at,
                     created_at::text as updated_at
              from public.slots
              where instructor_id = any($1::uuid[])
                and status <> 'cancelled'
              order by start_time
            `,
            [instructorIds],
          )
        : Promise.resolve([]),
      instructorIds.length > 0
        ? queryRows<Omit<StudentAccess, "lesson_type_ids">>(
            `
              select id, instructor_id, display_label, student_phone, login,
                     total_lesson_limit, weekly_lesson_limit, is_active,
                     school_id, is_archived, archived_at::text as archived_at,
                     created_at::text as created_at, updated_at::text as updated_at
              from public.student_accesses
              where instructor_id = any($1::uuid[])
              order by display_label
            `,
            [instructorIds],
          )
        : Promise.resolve([]),
  ]);

  lessonTypeCatalog = lessonTypeData;
  schools = schoolData;
  scheduleDays = scheduleDayData;
  slots = slotData;
  baseStudentAccesses = studentAccessData;

  const studentAccessIds = baseStudentAccesses.map((access) => access.id);

  studentAccessLessonTypeData =
    studentAccessIds.length > 0
      ? await queryRows<{
          student_access_id: string;
          lesson_type_id: string;
        }>(
          `
            select student_access_id, lesson_type_id
            from public.student_access_lesson_types
            where student_access_id = any($1::uuid[])
          `,
          [studentAccessIds],
        )
      : [];

  const lessonTypeIdsByAccessId = new Map<string, string[]>();

  for (const item of studentAccessLessonTypeData ?? []) {
    const current = lessonTypeIdsByAccessId.get(item.student_access_id) ?? [];
    current.push(item.lesson_type_id);
    lessonTypeIdsByAccessId.set(item.student_access_id, current);
  }

  let showClientPrices = true;
  let visibleSchoolIds: Set<string> | null = null;

  if (membership.isInstructor && membership.instructorId) {
    const payoutSettings = await getInstructorPayoutSettings({
      organizationId: membership.organizationId,
      instructorId: membership.instructorId,
    });

    showClientPrices = payoutSettings?.show_client_prices !== false;

    if (payoutSettings?.source_visibility_mode === "selected_only") {
      const sourceVisibility = await getInstructorSourceVisibility({
        organizationId: membership.organizationId,
        instructorId: membership.instructorId,
      });
      visibleSchoolIds = new Set(
        sourceVisibility
          .filter((item) => item.is_visible)
          .map((item) => item.school_id),
      );
    }
  }

  const visibleSchools = visibleSchoolIds
    ? schools.filter((school) => visibleSchoolIds?.has(school.id))
    : schools;
  const studentAccesses = baseStudentAccesses
    .filter(
      (access) =>
        !visibleSchoolIds ||
        !access.school_id ||
        visibleSchoolIds.has(access.school_id),
    )
    .map((access) => ({
      ...access,
      lesson_type_ids: lessonTypeIdsByAccessId.get(access.id) ?? [],
    })) as StudentAccess[];
  const slotIds = slots.map((slot) => slot.id);

  bookings =
    slotIds.length > 0
      ? await queryRows<Booking>(
          `
            select id, slot_id, student_label, student_access_id,
                   student_lesson_package_id, school_id, created_at::text as created_at,
                   price_amount, paid_amount, is_paid, paid_at::text as paid_at,
                   payment_note, booking_category, lesson_state,
                   lesson_units,
                   completed_at::text as completed_at, instructor_note
            from public.bookings
            where slot_id = any($1::uuid[])
              and status = 'confirmed'
          `,
          [slotIds],
        )
      : [];

  const visibleBookings = showClientPrices
    ? bookings
    : bookings.map((booking) => ({
        ...booking,
        price_amount: null,
        paid_amount: null,
        is_paid: false,
        paid_at: null,
        payment_note: null,
      }));
  const schedulableLessonTypes = getSchedulableLessonTypes(lessonTypeCatalog);
  const slotCountsByScheduleDay = new Map<string, number>();

  for (const slot of slots) {
    slotCountsByScheduleDay.set(
      slot.schedule_day_id,
      (slotCountsByScheduleDay.get(slot.schedule_day_id) ?? 0) + 1,
    );
  }

  const defaultWeekDate = getLocalDate(
    instructors.find((instructor) => instructor.id === initialInstructorId)
      ?.timezone ?? DEFAULT_TIMEZONE,
  );

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Расписание
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Неделя
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Посмотрите загрузку на 7 дней, найдите свободные окна и быстро
              добавьте нужные слоты.
            </p>
            <Link
              href="/admin/schedule?create=slot#schedule-quick-actions"
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <CalendarPlus className="size-4" />
              Добавить слот
            </Link>
          </div>
        </header>

        <AdminScheduleWorkspace
          instructors={instructors}
          lessonTypes={schedulableLessonTypes}
          schools={visibleSchools}
          scheduleDays={scheduleDays.map((day) => ({
            ...day,
            slot_count: slotCountsByScheduleDay.get(day.id) ?? 0,
          }))}
          slots={slots}
          bookings={visibleBookings}
          studentAccesses={studentAccesses}
          defaultWeekDate={defaultWeekDate}
          initialInstructorId={initialInstructorId}
          canSelectInstructor={false}
          adminEnabled={adminEnabled}
          canUseExamRoute={canUseExamRoute}
          showClientPrices={showClientPrices}
          initialOpenSlotForm={createParam === "slot"}
          initialSlotDate={dateParam}
        />

      </div>
    </main>
  );
}
