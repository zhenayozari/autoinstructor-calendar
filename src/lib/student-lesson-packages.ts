import "server-only";

import { isMissingPricingTableError } from "@/lib/pricing";
import { queryOne, queryRows } from "@/lib/db/postgres";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookingCategory } from "@/lib/types";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

export type StudentPackageAccess = {
  id: string;
  organization_id: string;
  instructor_id: string;
  school_id: string | null;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
};

export type SelectedStudentLessonPackage = {
  id: string | null;
  schoolId: string | null;
  bookingCategory: BookingCategory;
  usesLegacyAccess: boolean;
};

type PackageRow = {
  id: string;
  school_id: string | null;
  booking_category: BookingCategory | string | null;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
  student_lesson_package_types?: { lesson_type_id: string }[];
};

function normalizeBookingCategory(value: unknown): BookingCategory {
  if (value === "extra" || value === "gift") {
    return value;
  }

  return "regular";
}

function addDaysToDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getWeekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

async function countConfirmedBookings({
  supabase,
  accessId,
  packageId,
}: {
  supabase: SupabaseAdminClient;
  accessId: string;
  packageId: string | null;
}) {
  let query = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed");

  query = packageId
    ? query.eq("student_lesson_package_id", packageId)
    : query.eq("student_access_id", accessId);

  const { count, error } = await query;

  if (error) {
    if (packageId && isMissingPricingTableError(error)) {
      return countConfirmedBookings({ supabase, accessId, packageId: null });
    }

    throw new Error(error.message);
  }

  return count ?? 0;
}

async function countConfirmedBookingsInWeek({
  supabase,
  accessId,
  packageId,
  instructorId,
  weekStart,
  weekEnd,
}: {
  supabase: SupabaseAdminClient;
  accessId: string;
  packageId: string | null;
  instructorId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const { data: dayData, error: dayError } = await supabase
    .from("schedule_days")
    .select("id")
    .eq("instructor_id", instructorId)
    .gte("date", weekStart)
    .lte("date", weekEnd);

  if (dayError) {
    throw new Error(dayError.message);
  }

  const dayIds = (dayData ?? []).map((day) => day.id);

  if (dayIds.length === 0) {
    return 0;
  }

  const { data: slotData, error: slotError } = await supabase
    .from("slots")
    .select("id")
    .in("schedule_day_id", dayIds);

  if (slotError) {
    throw new Error(slotError.message);
  }

  const slotIds = (slotData ?? []).map((slot) => slot.id);

  if (slotIds.length === 0) {
    return 0;
  }

  let query = supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "confirmed")
    .in("slot_id", slotIds);

  query = packageId
    ? query.eq("student_lesson_package_id", packageId)
    : query.eq("student_access_id", accessId);

  const { count, error } = await query;

  if (error) {
    if (packageId && isMissingPricingTableError(error)) {
      return countConfirmedBookingsInWeek({
        supabase,
        accessId,
        packageId: null,
        instructorId,
        weekStart,
        weekEnd,
      });
    }

    throw new Error(error.message);
  }

  return count ?? 0;
}

function readCount(value: string | number | bigint | null | undefined) {
  return Number(value ?? 0);
}

async function countConfirmedBookingsPostgres({
  accessId,
  packageId,
}: {
  accessId: string;
  packageId: string | null;
}) {
  const row = packageId
    ? await queryOne<{ count: string }>(
        `
          select count(*)::text as count
          from public.bookings
          where status = 'confirmed'
            and student_lesson_package_id = $1
        `,
        [packageId],
      )
    : await queryOne<{ count: string }>(
        `
          select count(*)::text as count
          from public.bookings
          where status = 'confirmed'
            and student_access_id = $1
        `,
        [accessId],
      );

  return readCount(row?.count);
}

async function countConfirmedBookingsInWeekPostgres({
  accessId,
  packageId,
  instructorId,
  weekStart,
  weekEnd,
}: {
  accessId: string;
  packageId: string | null;
  instructorId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const row = packageId
    ? await queryOne<{ count: string }>(
        `
          select count(*)::text as count
          from public.bookings b
          join public.slots s on s.id = b.slot_id
          join public.schedule_days d on d.id = s.schedule_day_id
          where b.status = 'confirmed'
            and b.student_lesson_package_id = $1
            and s.instructor_id = $2
            and d.date >= $3::date
            and d.date <= $4::date
        `,
        [packageId, instructorId, weekStart, weekEnd],
      )
    : await queryOne<{ count: string }>(
        `
          select count(*)::text as count
          from public.bookings b
          join public.slots s on s.id = b.slot_id
          join public.schedule_days d on d.id = s.schedule_day_id
          where b.status = 'confirmed'
            and b.student_access_id = $1
            and s.instructor_id = $2
            and d.date >= $3::date
            and d.date <= $4::date
        `,
        [accessId, instructorId, weekStart, weekEnd],
      );

  return readCount(row?.count);
}

async function packageHasRoom({
  supabase,
  access,
  packageId,
  totalLessonLimit,
  weeklyLessonLimit,
  lessonDate,
}: {
  supabase: SupabaseAdminClient;
  access: StudentPackageAccess;
  packageId: string | null;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  lessonDate: string;
}) {
  if (totalLessonLimit !== null) {
    const totalUsed = await countConfirmedBookings({
      supabase,
      accessId: access.id,
      packageId,
    });

    if (totalUsed >= totalLessonLimit) {
      return false;
    }
  }

  if (weeklyLessonLimit !== null) {
    const weekStart = getWeekStart(lessonDate);
    const weekEnd = addDaysToDate(weekStart, 6);
    const weeklyUsed = await countConfirmedBookingsInWeek({
      supabase,
      accessId: access.id,
      packageId,
      instructorId: access.instructor_id,
      weekStart,
      weekEnd,
    });

    if (weeklyUsed >= weeklyLessonLimit) {
      return false;
    }
  }

  return true;
}

async function packageHasRoomPostgres({
  access,
  packageId,
  totalLessonLimit,
  weeklyLessonLimit,
  lessonDate,
}: {
  access: StudentPackageAccess;
  packageId: string | null;
  totalLessonLimit: number | null;
  weeklyLessonLimit: number | null;
  lessonDate: string;
}) {
  if (totalLessonLimit !== null) {
    const totalUsed = await countConfirmedBookingsPostgres({
      accessId: access.id,
      packageId,
    });

    if (totalUsed >= totalLessonLimit) {
      return false;
    }
  }

  if (weeklyLessonLimit !== null) {
    const weekStart = getWeekStart(lessonDate);
    const weekEnd = addDaysToDate(weekStart, 6);
    const weeklyUsed = await countConfirmedBookingsInWeekPostgres({
      accessId: access.id,
      packageId,
      instructorId: access.instructor_id,
      weekStart,
      weekEnd,
    });

    if (weeklyUsed >= weeklyLessonLimit) {
      return false;
    }
  }

  return true;
}

export async function selectStudentLessonPackageForBooking({
  supabase,
  access,
  lessonTypeId,
  lessonDate,
  legacyLessonTypeIds,
}: {
  supabase: SupabaseAdminClient;
  access: StudentPackageAccess;
  lessonTypeId: string;
  lessonDate: string;
  legacyLessonTypeIds: string[];
}): Promise<SelectedStudentLessonPackage> {
  const { data, error } = await supabase
    .from("student_lesson_packages")
    .select(
      "id, school_id, booking_category, total_lesson_limit, weekly_lesson_limit, student_lesson_package_types(lesson_type_id)",
    )
    .eq("student_access_id", access.id)
    .eq("organization_id", access.organization_id)
    .eq("instructor_id", access.instructor_id)
    .eq("is_active", true)
    .order("sort_order")
    .order("created_at");

  if (error) {
    if (!isMissingPricingTableError(error)) {
      throw new Error(error.message);
    }

    if (!legacyLessonTypeIds.includes(lessonTypeId)) {
      throw new Error("Этот тип занятия недоступен ученику");
    }

    const hasRoom = await packageHasRoom({
      supabase,
      access,
      packageId: null,
      totalLessonLimit: access.total_lesson_limit,
      weeklyLessonLimit: access.weekly_lesson_limit,
      lessonDate,
    });

    if (!hasRoom) {
      throw new Error("Лимит занятий закончился. Добавьте ученику новый доступ.");
    }

    return {
      id: null,
      schoolId: access.school_id,
      bookingCategory: "regular",
      usesLegacyAccess: true,
    };
  }

  const packages = (data ?? []) as PackageRow[];
  let hasPackageForLessonType = false;

  for (const item of packages) {
    const lessonTypeIds =
      item.student_lesson_package_types?.map((type) => type.lesson_type_id) ?? [];

    if (!lessonTypeIds.includes(lessonTypeId)) {
      continue;
    }

    hasPackageForLessonType = true;

    const hasRoom = await packageHasRoom({
      supabase,
      access,
      packageId: item.id,
      totalLessonLimit: item.total_lesson_limit,
      weeklyLessonLimit: item.weekly_lesson_limit,
      lessonDate,
    });

    if (!hasRoom) {
      continue;
    }

    return {
      id: item.id,
      schoolId: item.school_id,
      bookingCategory: normalizeBookingCategory(item.booking_category),
      usesLegacyAccess: false,
    };
  }

  if (!hasPackageForLessonType) {
    throw new Error("Этот тип занятия недоступен ученику");
  }

  throw new Error("Лимит занятий закончился. Добавьте ученику новый доступ.");
}

export async function selectStudentLessonPackageForBookingPostgres({
  access,
  lessonTypeId,
  lessonDate,
  legacyLessonTypeIds,
}: {
  access: StudentPackageAccess;
  lessonTypeId: string;
  lessonDate: string;
  legacyLessonTypeIds: string[];
}): Promise<SelectedStudentLessonPackage> {
  const packages = await queryRows<PackageRow>(
    `
      select id, school_id, booking_category, total_lesson_limit, weekly_lesson_limit
      from public.student_lesson_packages
      where student_access_id = $1
        and organization_id = $2
        and instructor_id = $3
        and is_active = true
      order by sort_order, created_at
    `,
    [access.id, access.organization_id, access.instructor_id],
  );

  if (packages.length === 0) {
    if (!legacyLessonTypeIds.includes(lessonTypeId)) {
      throw new Error("Этот тип занятия недоступен ученику");
    }

    const hasRoom = await packageHasRoomPostgres({
      access,
      packageId: null,
      totalLessonLimit: access.total_lesson_limit,
      weeklyLessonLimit: access.weekly_lesson_limit,
      lessonDate,
    });

    if (!hasRoom) {
      throw new Error("Лимит занятий закончился. Добавьте ученику новый доступ.");
    }

    return {
      id: null,
      schoolId: access.school_id,
      bookingCategory: "regular",
      usesLegacyAccess: true,
    };
  }

  const packageIds = packages.map((item) => item.id);
  const packageTypes = await queryRows<{
    package_id: string;
    lesson_type_id: string;
  }>(
    `
      select package_id, lesson_type_id
      from public.student_lesson_package_types
      where package_id = any($1::uuid[])
    `,
    [packageIds],
  );
  const lessonTypeIdsByPackageId = new Map<string, string[]>();

  for (const item of packageTypes) {
    const lessonTypeIds = lessonTypeIdsByPackageId.get(item.package_id) ?? [];
    lessonTypeIds.push(item.lesson_type_id);
    lessonTypeIdsByPackageId.set(item.package_id, lessonTypeIds);
  }

  let hasPackageForLessonType = false;

  for (const item of packages) {
    const lessonTypeIds = lessonTypeIdsByPackageId.get(item.id) ?? [];

    if (!lessonTypeIds.includes(lessonTypeId)) {
      continue;
    }

    hasPackageForLessonType = true;

    const hasRoom = await packageHasRoomPostgres({
      access,
      packageId: item.id,
      totalLessonLimit: item.total_lesson_limit,
      weeklyLessonLimit: item.weekly_lesson_limit,
      lessonDate,
    });

    if (!hasRoom) {
      continue;
    }

    return {
      id: item.id,
      schoolId: item.school_id,
      bookingCategory: normalizeBookingCategory(item.booking_category),
      usesLegacyAccess: false,
    };
  }

  if (!hasPackageForLessonType) {
    throw new Error("Этот тип занятия недоступен ученику");
  }

  throw new Error("Лимит занятий закончился. Добавьте ученику новый доступ.");
}
