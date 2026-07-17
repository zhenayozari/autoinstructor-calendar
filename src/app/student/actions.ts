"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearStudentSession,
  requireCurrentStudentAccess,
} from "@/lib/student-session";
import { createAdminClient } from "@/lib/supabase/admin";

export type StudentBookingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function studentLogoutAction() {
  await clearStudentSession();
  redirect("/student/login");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(value: string) {
  const date = parseDate(value);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (weekday === 0 ? -6 : 1 - weekday));
  return formatDateValue(date);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateValue(date);
}

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

async function getDefaultPriceAmount(
  supabase: ReturnType<typeof createAdminClient>,
  lessonTypeId: string,
) {
  const { data, error } = await supabase
    .from("lesson_types")
    .select("default_price_amount")
    .eq("id", lessonTypeId)
    .maybeSingle();

  if (error) {
    if (isMissingColumnError(error)) {
      return null;
    }

    throw new Error(error.message);
  }

  return typeof data?.default_price_amount === "number"
    ? data.default_price_amount
    : null;
}

async function insertStudentBooking({
  supabase,
  slotId,
  accessId,
  studentLabel,
  priceAmount,
}: {
  supabase: ReturnType<typeof createAdminClient>;
  slotId: string;
  accessId: string;
  studentLabel: string;
  priceAmount: number | null;
}) {
  const payload = {
    slot_id: slotId,
    student_access_id: accessId,
    student_label: studentLabel,
    status: "confirmed",
  };
  const { error } = await supabase.from("bookings").insert({
    ...payload,
    price_amount: priceAmount,
  });

  if (!error || !isMissingColumnError(error)) {
    return error;
  }

  const { error: fallbackError } = await supabase
    .from("bookings")
    .insert(payload);

  return fallbackError;
}

async function countConfirmedBookingsForAccess(accessId: string) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("student_access_id", accessId)
    .eq("status", "confirmed");

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function countConfirmedBookingsForAccessInWeek({
  accessId,
  weekStart,
  weekEnd,
}: {
  accessId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const supabase = createAdminClient();
  const { data: dayData, error: dayError } = await supabase
    .from("schedule_days")
    .select("id")
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

  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("student_access_id", accessId)
    .eq("status", "confirmed")
    .in("slot_id", slotIds);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

export async function studentBookSlotAction(
  previousState: StudentBookingActionState,
  formData: FormData,
): Promise<StudentBookingActionState> {
  void previousState;

  try {
    const access = await requireCurrentStudentAccess();
    const slotId = formData.get("slot_id");

    if (typeof slotId !== "string" || !slotId) {
      throw new Error("Не удалось определить выбранный слот");
    }

    const supabase = createAdminClient();
    const { data: slot, error: slotError } = await supabase
      .from("public_schedule_slots")
      .select(
        "id, instructor_id, lesson_type_id, status, is_booked, date, lesson_type_name",
      )
      .eq("id", slotId)
      .maybeSingle();

    if (slotError && isMissingColumnError(slotError)) {
      throw new Error("Расписание обновляется. Попробуйте обновить страницу позже");
    }

    if (slotError) {
      throw new Error(slotError.message);
    }

    if (!slot || slot.instructor_id !== access.instructorId) {
      throw new Error("Этот слот недоступен для вашего доступа");
    }

    if (slot.status !== "available" || slot.is_booked) {
      throw new Error("Этот слот уже занят");
    }

    if (!access.lessonTypeIds.includes(slot.lesson_type_id)) {
      throw new Error("Этот тип занятия вам недоступен");
    }

    if (access.totalLessonLimit !== null) {
      const totalUsed = await countConfirmedBookingsForAccess(access.id);

      if (totalUsed >= access.totalLessonLimit) {
        throw new Error(
          "Общий лимит занятий закончился. Свяжитесь с инструктором",
        );
      }
    }

    if (access.weeklyLessonLimit !== null) {
      const weekStart = getWeekStart(slot.date);
      const weekEnd = addDays(weekStart, 6);
      const weeklyUsed = await countConfirmedBookingsForAccessInWeek({
        accessId: access.id,
        weekStart,
        weekEnd,
      });

      if (weeklyUsed >= access.weeklyLessonLimit) {
        throw new Error(
          "Лимит занятий на эту неделю закончился. Выберите другую неделю или свяжитесь с инструктором",
        );
      }
    }

    const priceAmount = await getDefaultPriceAmount(
      supabase,
      slot.lesson_type_id,
    );
    const error = await insertStudentBooking({
      supabase,
      slotId: slot.id,
      accessId: access.id,
      studentLabel: access.displayLabel,
      priceAmount,
    });

    if (error) {
      if (error.code === "23505") {
        throw new Error("Этот слот уже занят");
      }

      throw new Error(error.message);
    }

    revalidatePath("/student");
    revalidatePath("/admin");
    revalidatePath("/admin/bookings");
    revalidatePath("/admin/schedule");
    revalidatePath("/schedule");
    revalidatePath("/instructors");

    return {
      status: "success",
      message: "Вы записаны на занятие",
    };
  } catch (error) {
    console.error("studentBookSlotAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
