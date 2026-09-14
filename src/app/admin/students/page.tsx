import { headers } from "next/headers";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
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
import { getSchedulableLessonTypes } from "@/lib/lesson-types";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import type {
  Booking,
  Instructor,
  LessonType,
  School,
  Slot,
  InstructorSetting,
  StudentLessonPackage,
  StudentRegistrationRequest,
} from "@/lib/types";
import {
  StudentAccessesPanel,
  type StudentAccessCrm,
  type StudentAccessCrmSummary,
} from "@/components/admin/student-accesses-panel";
import { getPublicOrigin } from "@/lib/public-origin";
import { isMissingPricingTableError } from "@/lib/pricing";

export const dynamic = "force-dynamic";

type AdminStudentsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    student?: string;
  }>;
};

type StudentAccessRow = {
  id: string;
  instructor_id: string;
  display_label: string;
  first_name?: string | null;
  last_name?: string | null;
  student_phone: string | null;
  login: string;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
  school_id: string | null;
  is_active: boolean;
  is_archived: boolean;
  archived_at: string | null;
  profile_completed_at?: string | null;
  personal_data_consent_at?: string | null;
  personal_data_consent_source?: string | null;
  created_at: string;
  updated_at: string;
};

type StudentAccessLessonTypeRow = {
  student_access_id: string;
  lesson_type_id: string;
};

type StudentLessonPackageRow = Omit<StudentLessonPackage, "lesson_type_ids">;

type StudentLessonPackageTypeRow = {
  package_id: string;
  lesson_type_id: string;
};

type StudentBookingRow = Pick<
  Booking,
  | "id"
  | "slot_id"
  | "student_access_id"
  | "student_lesson_package_id"
  | "school_id"
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
  const requestHeaders = await headers();
  const membership = await requireActiveOrganizationMember();
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend || hasSupabaseAdminKey();
  const origin = getPublicOrigin(requestHeaders);
  let instructors: Instructor[] = [];
  let lessonTypes: LessonType[] = [];
  let schools: School[] = [];
  let accesses: StudentAccessRow[] = [];
  let pendingRequests: StudentRegistrationRequest[] = [];
  let settingData: Partial<InstructorSetting>[] = [];
  let accessLessonTypes: StudentAccessLessonTypeRow[] = [];
  let packages: StudentLessonPackageRow[] = [];
  let packageLessonTypes: StudentLessonPackageTypeRow[] = [];
  let studentBookings: StudentBookingRow[] = [];
  let studentSlots: StudentSlotRow[] = [];
  let loadError: { message: string } | null = null;

  if (postgresBackend) {
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
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: instructorData, error: instructorError } =
      await buildActiveInstructorsQuery(
        supabase,
        membership,
        "id, name, slug, public_name",
      );

    instructors = (instructorData ?? []) as Instructor[];
    loadError = instructorError;
  }

  const selectedInstructorId = getSelectedInstructorId(
    membership,
    params.instructor,
  );
  const selectedInstructor = getSelectedInstructor(
    instructors,
    selectedInstructorId,
  );
  const selectedInstructorIds = selectedInstructor ? [selectedInstructor.id] : [];
  await autoCompletePastBookings({ instructorIds: selectedInstructorIds });

  if (postgresBackend) {
    const [
      lessonTypeData,
      schoolData,
      accessData,
      requestData,
      settingsData,
    ] = await Promise.all([
      queryRows<LessonType>(
        `
          select id, code, name, color, kind, tags, sort_order, is_active,
                 default_duration_minutes, default_price_amount, requires_vehicle
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
      selectedInstructorIds.length > 0
        ? queryRows<StudentAccessRow>(
            `
              select id, instructor_id, display_label, first_name, last_name,
                     student_phone, login,
                     total_lesson_limit, weekly_lesson_limit, school_id,
                     is_active, is_archived, archived_at::text as archived_at,
                     profile_completed_at::text as profile_completed_at,
                     personal_data_consent_at::text as personal_data_consent_at,
                     personal_data_consent_source,
                     created_at::text as created_at, updated_at::text as updated_at
              from public.student_accesses
              where organization_id = $1
                and instructor_id = any($2::uuid[])
              order by created_at desc
            `,
            [membership.organizationId, selectedInstructorIds],
          )
        : Promise.resolve([]),
      selectedInstructorIds.length > 0
        ? queryRows<StudentRegistrationRequest>(
            `
              select id, organization_id, instructor_id, first_name, last_name,
                     student_phone, school_text, login, status,
                     reviewed_at::text as reviewed_at, created_at::text as created_at,
                     updated_at::text as updated_at
              from public.student_registration_requests
              where organization_id = $1
                and instructor_id = any($2::uuid[])
                and status = 'pending'
              order by created_at desc
            `,
            [membership.organizationId, selectedInstructorIds],
          )
        : Promise.resolve([]),
      selectedInstructorIds.length > 0
        ? queryRows<Partial<InstructorSetting>>(
            `
              select instructor_id, student_registration_token,
                     student_registration_enabled,
                     student_registration_token_updated_at::text
                       as student_registration_token_updated_at
              from public.instructor_settings
              where instructor_id = any($1::uuid[])
            `,
            [selectedInstructorIds],
          )
        : Promise.resolve([]),
    ]);

    lessonTypes = lessonTypeData;
    schools = schoolData;
    accesses = accessData;
    pendingRequests = requestData;
    settingData = settingsData;
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const [
      { data: lessonTypeData, error: lessonTypeError },
      { data: schoolData, error: schoolError },
      { data: accessData, error: accessError },
      { data: requestData, error: requestError },
      { data: settingsData, error: settingError },
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
      adminEnabled && selectedInstructorIds.length > 0
        ? supabase
            .from("instructor_settings")
            .select(
              "instructor_id, student_registration_token, student_registration_enabled, student_registration_token_updated_at",
            )
            .in("instructor_id", selectedInstructorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    lessonTypes = (lessonTypeData ?? []) as LessonType[];
    schools = (schoolData ?? []) as School[];
    accesses = (accessData ?? []) as StudentAccessRow[];
    pendingRequests = (requestData ?? []) as StudentRegistrationRequest[];
    settingData = (settingsData ?? []) as Partial<InstructorSetting>[];
    loadError =
      loadError ??
      lessonTypeError ??
      schoolError ??
      accessError ??
      requestError ??
      settingError;
  }

  const accessIds = accesses.map((access) => access.id);

  if (postgresBackend) {
    accessLessonTypes =
      accessIds.length > 0
        ? await queryRows<StudentAccessLessonTypeRow>(
            `
              select student_access_id, lesson_type_id
              from public.student_access_lesson_types
              where student_access_id = any($1::uuid[])
            `,
            [accessIds],
          )
        : [];
    packages =
      accessIds.length > 0
        ? await queryRows<StudentLessonPackageRow>(
            `
              select id, student_access_id, organization_id, instructor_id,
                     school_id, booking_category, total_lesson_limit,
                     weekly_lesson_limit, is_active, sort_order,
                     created_at::text as created_at, updated_at::text as updated_at
              from public.student_lesson_packages
              where student_access_id = any($1::uuid[])
              order by sort_order, created_at
            `,
            [accessIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: accessLessonTypeData, error: accessLessonTypeError } =
      adminEnabled && accessIds.length > 0
        ? await supabase
            .from("student_access_lesson_types")
            .select("student_access_id, lesson_type_id")
            .in("student_access_id", accessIds)
        : { data: [], error: null };
    const { data: packageData, error: packageError } =
      adminEnabled && accessIds.length > 0
        ? await supabase
            .from("student_lesson_packages")
            .select(
              "id, student_access_id, organization_id, instructor_id, school_id, booking_category, total_lesson_limit, weekly_lesson_limit, is_active, sort_order, created_at, updated_at",
            )
            .in("student_access_id", accessIds)
            .order("sort_order")
            .order("created_at")
        : { data: [], error: null };

    accessLessonTypes = (accessLessonTypeData ??
      []) as StudentAccessLessonTypeRow[];
    packages = (packageData ?? []) as StudentLessonPackageRow[];
    loadError =
      loadError ??
      accessLessonTypeError ??
      (packageError && !isMissingPricingTableError(packageError)
        ? packageError
        : null);
  }

  const packageIds = packages.map((item) => item.id);

  if (postgresBackend) {
    packageLessonTypes =
      packageIds.length > 0
        ? await queryRows<StudentLessonPackageTypeRow>(
            `
              select package_id, lesson_type_id
              from public.student_lesson_package_types
              where package_id = any($1::uuid[])
            `,
            [packageIds],
          )
        : [];
    studentBookings =
      accessIds.length > 0
        ? await queryRows<StudentBookingRow>(
            `
              select id, slot_id, student_access_id, student_lesson_package_id,
                     school_id, price_amount, paid_amount, is_paid, lesson_state
              from public.bookings
              where student_access_id = any($1::uuid[])
                and status = 'confirmed'
            `,
            [accessIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: packageLessonTypeData, error: packageLessonTypeError } =
      adminEnabled && packageIds.length > 0
        ? await supabase
            .from("student_lesson_package_types")
            .select("package_id, lesson_type_id")
            .in("package_id", packageIds)
        : { data: [], error: null };
    const { data: bookingData, error: bookingError } =
      adminEnabled && accessIds.length > 0
        ? await supabase
            .from("bookings")
            .select(
              "id, slot_id, student_access_id, student_lesson_package_id, school_id, price_amount, paid_amount, is_paid, lesson_state",
            )
            .in("student_access_id", accessIds)
            .eq("status", "confirmed")
        : { data: [], error: null };

    packageLessonTypes = (packageLessonTypeData ??
      []) as StudentLessonPackageTypeRow[];
    studentBookings = (bookingData ?? []) as StudentBookingRow[];
    loadError =
      loadError ??
      (packageLessonTypeError && !isMissingPricingTableError(packageLessonTypeError)
        ? packageLessonTypeError
        : null) ??
      bookingError;
  }

  const bookedSlotIds = studentBookings.map((booking) => booking.slot_id);

  if (postgresBackend) {
    studentSlots =
      bookedSlotIds.length > 0
        ? await queryRows<StudentSlotRow>(
            `
              select id, lesson_type_id, start_time::text as start_time,
                     end_time::text as end_time, school_id
              from public.slots
              where id = any($1::uuid[])
              order by start_time desc
            `,
            [bookedSlotIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: slotData, error: slotError } =
      adminEnabled && bookedSlotIds.length > 0
        ? await supabase
            .from("slots")
            .select("id, lesson_type_id, start_time, end_time, school_id")
            .in("id", bookedSlotIds)
            .order("start_time", { ascending: false })
        : { data: [], error: null };

    studentSlots = (slotData ?? []) as StudentSlotRow[];
    loadError = loadError ?? slotError;
  }

  const lessonTypeIdsByAccessId = new Map<string, string[]>();

  for (const item of accessLessonTypes) {
    const ids = lessonTypeIdsByAccessId.get(item.student_access_id) ?? [];
    ids.push(item.lesson_type_id);
    lessonTypeIdsByAccessId.set(item.student_access_id, ids);
  }

  const schedulableLessonTypes = getSchedulableLessonTypes(lessonTypes);
  const registrationSettings = ((settingData ?? []) as Pick<
    InstructorSetting,
    | "instructor_id"
    | "student_registration_token"
    | "student_registration_enabled"
    | "student_registration_token_updated_at"
  >[])[0];
  const registrationLink =
    registrationSettings?.student_registration_token &&
    registrationSettings.student_registration_enabled
      ? `${origin}/student/register?token=${registrationSettings.student_registration_token}`
      : null;
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const slotsById = new Map(studentSlots.map((slot) => [slot.id, slot]));
  const bookingsByAccessId = new Map<string, StudentBookingRow[]>();
  const packageLessonTypeIdsByPackageId = new Map<string, string[]>();
  const packagesByAccessId = new Map<string, StudentLessonPackageRow[]>();
  const bookingsByPackageId = new Map<string, StudentBookingRow[]>();

  for (const booking of studentBookings) {
    const items = bookingsByAccessId.get(booking.student_access_id) ?? [];
    items.push(booking);
    bookingsByAccessId.set(booking.student_access_id, items);

    if (booking.student_lesson_package_id) {
      const packageBookings =
        bookingsByPackageId.get(booking.student_lesson_package_id) ?? [];
      packageBookings.push(booking);
      bookingsByPackageId.set(booking.student_lesson_package_id, packageBookings);
    }
  }

  for (const item of packageLessonTypes) {
    const ids = packageLessonTypeIdsByPackageId.get(item.package_id) ?? [];
    ids.push(item.lesson_type_id);
    packageLessonTypeIdsByPackageId.set(item.package_id, ids);
  }

  for (const item of packages) {
    const items = packagesByAccessId.get(item.student_access_id) ?? [];
    items.push(item);
    packagesByAccessId.set(item.student_access_id, items);
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
      lastLessons: lessons.map(({ booking, slot, lessonType }) => ({
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
      packages: (packagesByAccessId.get(access.id) ?? []).map((item) => ({
        ...item,
        school: item.school_id ? schoolsById.get(item.school_id) ?? null : null,
        lesson_type_ids: packageLessonTypeIdsByPackageId.get(item.id) ?? [],
        lessonTypes: (packageLessonTypeIdsByPackageId.get(item.id) ?? [])
          .map((lessonTypeId) => lessonTypesById.get(lessonTypeId))
          .filter((lessonType): lessonType is LessonType => Boolean(lessonType)),
        usedCount: (bookingsByPackageId.get(item.id) ?? []).length,
      })),
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
              <p className="font-semibold">1. Создаёте доступ</p>
              <p className="mt-1 text-blue-900/80">
                Указываете логин, ПИН-код, источник и типы занятий. Имя и
                фамилию ученик заполнит сам.
              </p>
            </div>
            <div className="rounded-xl bg-white/70 p-3">
              <p className="font-semibold">2. Ученик подтверждает согласие</p>
              <p className="mt-1 text-blue-900/80">
                При первом входе кабинет закрыт до заполнения профиля и
                согласия на обработку персональных данных.
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
            lessonTypes={schedulableLessonTypes}
            schools={schools}
            accesses={activeAccesses}
            archivedAccesses={archivedAccesses}
            pendingRequests={pendingRequests}
            selectedInstructorId={selectedInstructor.id}
            canSelectInstructor={false}
            adminEnabled={adminEnabled}
            registrationLink={registrationLink}
            registrationLinkUpdatedAt={
              registrationSettings?.student_registration_token_updated_at ?? null
            }
            canDeleteStudents={membership.role === "owner"}
            highlightedStudentAccessId={params.student ?? null}
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
