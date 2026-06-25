"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashBookingAccessCode } from "@/lib/booking-access-code";
import {
  requireActiveOrganizationMember,
  requireInstructorAccess,
} from "@/lib/auth";

export type SlotActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type AccessCodeActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type QuickCreateDayActionState = {
  status: "idle" | "success" | "error";
  message: string;
  createdCount: number;
  conflicts: string[];
};

export type CopyScheduleActionState = {
  status: "idle" | "success" | "error";
  message: string;
  createdCount: number;
  conflicts: string[];
};

export type PublicationActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type LessonTypeActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

const INITIAL_STATE: SlotActionState = {
  status: "idle",
  message: "",
};

type LessonTypeCategory = "driving" | "theory" | "gift";

function readRequiredString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value.trim();
}

function readOptionalString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function readOptionalNote(formData: FormData) {
  const value = formData.get("note");

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const note = value.trim();

  if (note.length > 500) {
    throw new Error("Внутренняя заметка должна содержать не более 500 символов");
  }

  return note;
}

function getUtcDate(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const localTimestamp = Date.UTC(year, month - 1, day, hour, minute);
  let result = new Date(localTimestamp);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(result);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const renderedTimestamp = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    const offset = renderedTimestamp - result.getTime();
    result = new Date(localTimestamp - offset);
  }

  return result;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Не удалось выполнить операцию";
}

function requireLessonTypeCategory(value: string): LessonTypeCategory {
  if (value === "driving" || value === "theory" || value === "gift") {
    return value;
  }

  throw new Error("Выберите корректную категорию типа занятия");
}

function getLessonTypePersistence(category: LessonTypeCategory) {
  if (category === "theory") {
    return {
      kind: "theory" as const,
      requires_vehicle: false,
      tags: ["theory"],
      defaultDuration: 60,
    };
  }

  if (category === "gift") {
    return {
      kind: "driving" as const,
      requires_vehicle: true,
      tags: ["gift"],
      defaultDuration: 90,
    };
  }

  return {
    kind: "driving" as const,
    requires_vehicle: true,
    tags: ["driving"],
    defaultDuration: 90,
  };
}

function makeCustomLessonTypeCode() {
  return `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function requireLessonTypeManager() {
  const membership = await requireActiveOrganizationMember();

  if (!membership.isOwnerOrAdmin) {
    throw new Error("Управлять типами занятий могут только owner или admin");
  }

  return membership;
}

function readInteger(
  formData: FormData,
  field: string,
  minimum: number,
  maximum: number,
) {
  const rawValue = readRequiredString(formData, field);
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `Поле «${field}» должно быть целым числом от ${minimum} до ${maximum}`,
    );
  }

  return value;
}

function formatTimeRange(start: Date, end: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });

  return `${formatter.format(start)}–${formatter.format(end)}`;
}

function parseDateValue(value: string) {
  const date = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Проверьте выбранную дату");
  }

  return date;
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysToDate(value: string, days: number) {
  const date = parseDateValue(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateValue(date);
}

function getWeekStart(value: string) {
  const date = parseDateValue(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return formatDateValue(date);
}

function getLocalTime(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.hour}:${values.minute}:${values.second}`;
}

function getPublicationAt(formData: FormData, timezone: string) {
  const mode = formData.get("publication_mode");

  if (mode === "hidden") {
    return null;
  }

  if (mode === "scheduled") {
    const value = readRequiredString(formData, "publication_at");
    const [date, time] = value.split("T");

    if (!date || !time) {
      throw new Error("Укажите дату и время публикации");
    }

    const publicationAt = getUtcDate(date, time, timezone);

    if (Number.isNaN(publicationAt.getTime())) {
      throw new Error("Проверьте дату и время публикации");
    }

    return publicationAt.toISOString();
  }

  return new Date().toISOString();
}

type SourceSlot = {
  lesson_type_id: string;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked";
  note: string | null;
};

async function getOrCreateCopyTargetDay({
  instructorId,
  date,
  transmission,
  publishedAt,
}: {
  instructorId: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  publishedAt: string | null;
}) {
  const supabase = createAdminClient();
  const { data: existingDay, error: lookupError } = await supabase
    .from("schedule_days")
    .select("id, transmission")
    .eq("instructor_id", instructorId)
    .eq("date", date)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  if (!existingDay) {
    const { data, error } = await supabase
      .from("schedule_days")
      .insert({
        instructor_id: instructorId,
        date,
        transmission,
        published_at: publishedAt,
      })
      .select("id, transmission")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  if (
    transmission &&
    existingDay.transmission &&
    existingDay.transmission !== transmission
  ) {
    throw new Error(
      `На ${date} уже установлена ${
        existingDay.transmission === "automatic" ? "АКПП" : "МКПП"
      }`,
    );
  }

  const { data, error } = await supabase
    .from("schedule_days")
    .update({
      transmission: existingDay.transmission ?? transmission,
      published_at: publishedAt,
    })
    .eq("id", existingDay.id)
    .eq("instructor_id", instructorId)
    .select("id, transmission")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function copySlotsToDate({
  instructorId,
  sourceSlots,
  targetDate,
  timezone,
  scheduleDayId,
}: {
  instructorId: string;
  sourceSlots: SourceSlot[];
  targetDate: string;
  timezone: string;
  scheduleDayId: string;
}) {
  const supabase = createAdminClient();
  const conflicts: string[] = [];
  let createdCount = 0;

  for (const slot of sourceSlots) {
    const sourceStart = new Date(slot.start_time);
    const sourceEnd = new Date(slot.end_time);
    const duration = sourceEnd.getTime() - sourceStart.getTime();
    const targetStart = getUtcDate(
      targetDate,
      getLocalTime(slot.start_time, timezone),
      timezone,
    );
    const targetEnd = new Date(targetStart.getTime() + duration);
    const label = `${targetDate}, ${formatTimeRange(
      targetStart,
      targetEnd,
      timezone,
    )}`;
    const { error } = await supabase.from("slots").insert({
      instructor_id: instructorId,
      schedule_day_id: scheduleDayId,
      lesson_type_id: slot.lesson_type_id,
      start_time: targetStart.toISOString(),
      end_time: targetEnd.toISOString(),
      location_type: slot.location_type,
      status: slot.status,
      note: slot.note,
    });

    if (!error) {
      createdCount += 1;
    } else if (error.code === "23P01") {
      conflicts.push(label);
    } else {
      throw new Error(`Ошибка при копировании ${label}: ${error.message}`);
    }
  }

  return { createdCount, conflicts };
}

export async function copyDayAction(
  previousState: CopyScheduleActionState,
  formData: FormData,
): Promise<CopyScheduleActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const sourceDate = readRequiredString(formData, "source_date");
    const targetDate = readRequiredString(formData, "target_date");
    const preserveTransmission =
      formData.get("preserve_transmission") === "on";

    if (sourceDate === targetDate) {
      throw new Error("Дата-источник и дата-назначение должны отличаться");
    }

    parseDateValue(sourceDate);
    parseDateValue(targetDate);
    const supabase = createAdminClient();
    const [
      { data: instructor, error: instructorError },
      { data: sourceDay, error: sourceDayError },
    ] = await Promise.all([
      supabase
        .from("instructors")
        .select("id, timezone")
        .eq("id", instructorId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("schedule_days")
        .select("id, transmission")
        .eq("instructor_id", instructorId)
        .eq("date", sourceDate)
        .maybeSingle(),
    ]);

    if (instructorError || !instructor) {
      throw new Error("Инструктор не найден или отключён");
    }

    if (sourceDayError || !sourceDay) {
      throw new Error("На дате-источнике нет дня расписания");
    }

    const { data, error } = await supabase
      .from("slots")
      .select(
        "lesson_type_id, start_time, end_time, location_type, status, note",
      )
      .eq("instructor_id", instructorId)
      .eq("schedule_day_id", sourceDay.id)
      .in("status", ["available", "blocked"])
      .order("start_time");

    if (error) {
      throw new Error(error.message);
    }

    const sourceSlots = (data ?? []) as SourceSlot[];

    if (sourceSlots.length === 0) {
      throw new Error("На дате-источнике нет активных слотов");
    }

    if (!preserveTransmission && sourceDay.transmission) {
      throw new Error(
        "Для дня с практическими занятиями включите «Сохранить коробку передач»",
      );
    }

    const targetDay = await getOrCreateCopyTargetDay({
      instructorId,
      date: targetDate,
      transmission: preserveTransmission ? sourceDay.transmission : null,
      publishedAt: getPublicationAt(formData, instructor.timezone),
    });
    const result = await copySlotsToDate({
      instructorId,
      sourceSlots,
      targetDate,
      timezone: instructor.timezone,
      scheduleDayId: targetDay.id,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");

    return {
      status: "success",
      message:
        result.conflicts.length > 0
          ? `Скопировано слотов: ${result.createdCount}. Конфликты пропущены.`
          : `День скопирован: ${result.createdCount} слотов.`,
      createdCount: result.createdCount,
      conflicts: result.conflicts,
    };
  } catch (error) {
    console.error("copyDayAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
      createdCount: 0,
      conflicts: [],
    };
  }
}

export async function copyWeekAction(
  previousState: CopyScheduleActionState,
  formData: FormData,
): Promise<CopyScheduleActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const sourceWeekStart = getWeekStart(
      readRequiredString(formData, "source_week"),
    );
    const targetWeekStart = getWeekStart(
      readRequiredString(formData, "target_week"),
    );

    if (sourceWeekStart === targetWeekStart) {
      throw new Error("Неделя-источник и неделя-назначение должны отличаться");
    }

    const supabase = createAdminClient();
    const [
      { data: instructor, error: instructorError },
      { data: sourceDaysData, error: sourceDaysError },
    ] = await Promise.all([
      supabase
        .from("instructors")
        .select("id, timezone")
        .eq("id", instructorId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("schedule_days")
        .select("id, date, transmission")
        .eq("instructor_id", instructorId)
        .gte("date", sourceWeekStart)
        .lte("date", addDaysToDate(sourceWeekStart, 6))
        .order("date"),
    ]);

    if (instructorError || !instructor) {
      throw new Error("Инструктор не найден или отключён");
    }

    if (sourceDaysError) {
      throw new Error(sourceDaysError.message);
    }

    const sourceDays = sourceDaysData ?? [];

    if (sourceDays.length === 0) {
      throw new Error("На неделе-источнике нет расписания");
    }

    let createdCount = 0;
    const conflicts: string[] = [];
    const publishedAt = getPublicationAt(formData, instructor.timezone);

    for (const sourceDay of sourceDays) {
      const dayOffset = Math.round(
        (parseDateValue(sourceDay.date).getTime() -
          parseDateValue(sourceWeekStart).getTime()) /
          86_400_000,
      );
      const targetDate = addDaysToDate(targetWeekStart, dayOffset);
      const { data, error } = await supabase
        .from("slots")
        .select(
          "lesson_type_id, start_time, end_time, location_type, status, note",
        )
        .eq("instructor_id", instructorId)
        .eq("schedule_day_id", sourceDay.id)
        .in("status", ["available", "blocked"])
        .order("start_time");

      if (error) {
        throw new Error(error.message);
      }

      const sourceSlots = (data ?? []) as SourceSlot[];

      if (sourceSlots.length === 0) {
        continue;
      }

      try {
        const targetDay = await getOrCreateCopyTargetDay({
          instructorId,
          date: targetDate,
          transmission: sourceDay.transmission,
          publishedAt,
        });
        const result = await copySlotsToDate({
          instructorId,
          sourceSlots,
          targetDate,
          timezone: instructor.timezone,
          scheduleDayId: targetDay.id,
        });
        createdCount += result.createdCount;
        conflicts.push(...result.conflicts);
      } catch (error) {
        conflicts.push(`${targetDate}: ${getErrorMessage(error)}`);
      }
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");

    return {
      status: "success",
      message:
        conflicts.length > 0
          ? `Скопировано слотов: ${createdCount}. Часть интервалов пропущена.`
          : `Неделя скопирована: ${createdCount} слотов.`,
      createdCount,
      conflicts,
    };
  } catch (error) {
    console.error("copyWeekAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
      createdCount: 0,
      conflicts: [],
    };
  }
}

export async function updateDayPublicationAction(
  previousState: PublicationActionState,
  formData: FormData,
): Promise<PublicationActionState> {
  void previousState;

  try {
    const scheduleDayId = readRequiredString(formData, "schedule_day_id");
    const supabase = createAdminClient();
    const { data: scheduleDay, error: scheduleDayError } = await supabase
      .from("schedule_days")
      .select("id, instructor_id")
      .eq("id", scheduleDayId)
      .maybeSingle();

    if (scheduleDayError || !scheduleDay) {
      throw new Error("День расписания не найден");
    }

    await requireInstructorAccess(scheduleDay.instructor_id);
    const { data: instructor, error: instructorError } = await supabase
      .from("instructors")
      .select("timezone")
      .eq("id", scheduleDay.instructor_id)
      .maybeSingle();

    if (instructorError || !instructor) {
      throw new Error("Инструктор не найден");
    }

    const publishedAt = getPublicationAt(formData, instructor.timezone);
    const { error } = await supabase
      .from("schedule_days")
      .update({ published_at: publishedAt })
      .eq("id", scheduleDayId)
      .eq("instructor_id", scheduleDay.instructor_id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");

    return {
      status: "success",
      message:
        publishedAt === null
          ? "День скрыт"
          : new Date(publishedAt) > new Date()
            ? "Публикация дня запланирована"
            : "День опубликован",
    };
  } catch (error) {
    console.error("updateDayPublicationAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateWeekPublicationAction(
  previousState: PublicationActionState,
  formData: FormData,
): Promise<PublicationActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const weekStart = getWeekStart(readRequiredString(formData, "week_date"));
    const operation = readRequiredString(formData, "operation");

    if (operation !== "publish" && operation !== "hide") {
      throw new Error("Неизвестное действие публикации");
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("schedule_days")
      .update({
        published_at:
          operation === "publish" ? new Date().toISOString() : null,
      })
      .eq("instructor_id", instructorId)
      .gte("date", weekStart)
      .lte("date", addDaysToDate(weekStart, 6))
      .select("id");

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");

    return {
      status: "success",
      message:
        operation === "publish"
          ? `Опубликовано дней: ${data.length}`
          : `Скрыто дней: ${data.length}`,
    };
  } catch (error) {
    console.error("updateWeekPublicationAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function quickCreateDayAction(
  previousState: QuickCreateDayActionState,
  formData: FormData,
): Promise<QuickCreateDayActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const lessonTypeId = readRequiredString(formData, "lesson_type_id");
    const date = readRequiredString(formData, "date");
    const workStartTime = readRequiredString(formData, "work_start_time");
    const workEndTime = readRequiredString(formData, "work_end_time");
    const durationMinutes = readInteger(
      formData,
      "duration_minutes",
      15,
      480,
    );
    const breakMinutes = readInteger(formData, "break_minutes", 0, 240);
    const note = readOptionalNote(formData);
    const requestedTransmission = formData.get("transmission");
    const transmission =
      requestedTransmission === "automatic" ||
      requestedTransmission === "manual"
        ? requestedTransmission
        : null;
    const supabase = createAdminClient();
    const [
      { data: instructor, error: instructorError },
      { data: lessonType, error: lessonTypeError },
    ] = await Promise.all([
      supabase
        .from("instructors")
        .select("id, timezone")
        .eq("id", instructorId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("lesson_types")
        .select("id, kind")
        .eq("id", lessonTypeId)
        .eq("is_active", true)
        .maybeSingle(),
    ]);

    if (instructorError || !instructor) {
      throw new Error("Инструктор не найден или отключён");
    }

    if (lessonTypeError || !lessonType) {
      throw new Error("Тип занятия не найден или отключён");
    }

    if (lessonType.kind === "driving" && !transmission) {
      throw new Error("Для практических занятий выберите АКПП или МКПП");
    }

    const publishedAt = getPublicationAt(formData, instructor.timezone);
    const workStartsAt = getUtcDate(
      date,
      workStartTime,
      instructor.timezone,
    );
    const workEndsAt = getUtcDate(date, workEndTime, instructor.timezone);

    if (
      Number.isNaN(workStartsAt.getTime()) ||
      Number.isNaN(workEndsAt.getTime())
    ) {
      throw new Error("Проверьте дату и время рабочего дня");
    }

    if (workEndsAt <= workStartsAt) {
      throw new Error(
        "Время окончания рабочего дня должно быть позже времени начала",
      );
    }

    const candidates: Array<{ start: Date; end: Date }> = [];
    let nextStart = workStartsAt;

    while (candidates.length < 100) {
      const nextEnd = new Date(
        nextStart.getTime() + durationMinutes * 60_000,
      );

      if (nextEnd > workEndsAt) {
        break;
      }

      candidates.push({ start: nextStart, end: nextEnd });
      nextStart = new Date(nextEnd.getTime() + breakMinutes * 60_000);
    }

    if (candidates.length === 0) {
      throw new Error(
        "В выбранный рабочий интервал не помещается ни одного занятия",
      );
    }

    const scheduleDayResult = await supabase
      .from("schedule_days")
      .select("id, transmission, published_at")
      .eq("instructor_id", instructorId)
      .eq("date", date)
      .maybeSingle();

    if (scheduleDayResult.error) {
      throw new Error(scheduleDayResult.error.message);
    }

    let scheduleDay = scheduleDayResult.data;

    if (!scheduleDay) {
      const { data, error } = await supabase
        .from("schedule_days")
        .insert({
          instructor_id: instructorId,
          date,
          transmission: lessonType.kind === "driving" ? transmission : null,
          published_at: publishedAt,
        })
        .select("id, transmission, published_at")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      scheduleDay = data;
    } else {
      if (
        lessonType.kind === "driving" &&
        scheduleDay.transmission &&
        scheduleDay.transmission !== transmission
      ) {
        throw new Error(
          `На выбранную дату уже установлена ${
            scheduleDay.transmission === "automatic" ? "АКПП" : "МКПП"
          }`,
        );
      }

      const dayUpdates: {
        published_at: string | null;
        transmission?: "automatic" | "manual";
      } = { published_at: publishedAt };

      if (
        lessonType.kind === "driving" &&
        !scheduleDay.transmission &&
        transmission
      ) {
        dayUpdates.transmission = transmission;
      }

      if (Object.keys(dayUpdates).length > 0) {
        const { data, error } = await supabase
          .from("schedule_days")
          .update(dayUpdates)
          .eq("id", scheduleDay.id)
          .eq("instructor_id", instructorId)
          .select("id, transmission, published_at")
          .single();

        if (error) {
          throw new Error(error.message);
        }

        scheduleDay = data;
      }
    }

    const conflicts: string[] = [];
    let createdCount = 0;
    const locationType =
      lessonType.kind === "driving" ? "in_car" : "online";

    for (const candidate of candidates) {
      const { error } = await supabase.from("slots").insert({
        instructor_id: instructorId,
        schedule_day_id: scheduleDay.id,
        lesson_type_id: lessonTypeId,
        start_time: candidate.start.toISOString(),
        end_time: candidate.end.toISOString(),
        location_type: locationType,
        status: "available",
        note,
      });

      if (!error) {
        createdCount += 1;
        continue;
      }

      if (error.code === "23P01") {
        conflicts.push(
          formatTimeRange(
            candidate.start,
            candidate.end,
            instructor.timezone,
          ),
        );
        continue;
      }

      throw new Error(
        `Создано слотов: ${createdCount}. Ошибка на интервале ${formatTimeRange(
          candidate.start,
          candidate.end,
          instructor.timezone,
        )}: ${error.message}`,
      );
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");

    return {
      status: "success",
      message:
        conflicts.length > 0
          ? `Создано слотов: ${createdCount}. Часть интервалов пропущена из-за конфликтов.`
          : `День создан: ${createdCount} слотов.`,
      createdCount,
      conflicts,
    };
  } catch (error) {
    console.error("quickCreateDayAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
      createdCount: 0,
      conflicts: [],
    };
  }
}

export async function createSlotAction(
  previousState: SlotActionState = INITIAL_STATE,
  formData: FormData,
): Promise<SlotActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const lessonTypeId = readRequiredString(formData, "lesson_type_id");
    const date = readRequiredString(formData, "date");
    const startTime = readRequiredString(formData, "start_time");
    const locationType = readRequiredString(formData, "location_type");
    const note = readOptionalNote(formData);
    const requestedTransmission = formData.get("transmission");
    const transmission =
      requestedTransmission === "automatic" || requestedTransmission === "manual"
        ? requestedTransmission
        : null;

    const supabase = createAdminClient();
    const [{ data: instructor, error: instructorError }, { data: lessonType, error: lessonError }] =
      await Promise.all([
        supabase
          .from("instructors")
          .select("id, timezone")
          .eq("id", instructorId)
          .eq("is_active", true)
          .single(),
        supabase
          .from("lesson_types")
          .select("id, kind, default_duration_minutes")
          .eq("id", lessonTypeId)
          .eq("is_active", true)
          .single(),
      ]);

    if (instructorError || !instructor) {
      throw new Error("Инструктор не найден или отключён");
    }

    if (lessonError || !lessonType) {
      throw new Error("Тип занятия не найден или отключён");
    }

    if (lessonType.kind === "driving" && !transmission) {
      throw new Error("Для практического занятия выберите АКПП или МКПП");
    }

    const scheduleDayResult = await supabase
      .from("schedule_days")
      .select("id, transmission")
      .eq("instructor_id", instructorId)
      .eq("date", date)
      .maybeSingle();
    let scheduleDay = scheduleDayResult.data;

    if (scheduleDayResult.error) {
      throw new Error(scheduleDayResult.error.message);
    }

    if (!scheduleDay) {
      const { data, error } = await supabase
        .from("schedule_days")
        .insert({
          instructor_id: instructorId,
          date,
          transmission: lessonType.kind === "driving" ? transmission : null,
          published_at: new Date().toISOString(),
        })
        .select("id, transmission")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      scheduleDay = data;
    } else if (lessonType.kind === "driving") {
      if (scheduleDay.transmission && scheduleDay.transmission !== transmission) {
        throw new Error(
          `На выбранную дату уже установлена ${
            scheduleDay.transmission === "automatic" ? "АКПП" : "МКПП"
          }`,
        );
      }

      if (!scheduleDay.transmission) {
        const { data, error } = await supabase
          .from("schedule_days")
          .update({ transmission })
          .eq("id", scheduleDay.id)
          .select("id, transmission")
          .single();

        if (error) {
          throw new Error(error.message);
        }

        scheduleDay = data;
      }
    }

    const startsAt = getUtcDate(date, startTime, instructor.timezone);
    const endsAt = new Date(
      startsAt.getTime() + lessonType.default_duration_minutes * 60_000,
    );
    const { error: slotError } = await supabase.from("slots").insert({
      instructor_id: instructorId,
      schedule_day_id: scheduleDay.id,
      lesson_type_id: lessonTypeId,
      start_time: startsAt.toISOString(),
      end_time: endsAt.toISOString(),
      location_type: locationType,
      status: "available",
      note,
    });

    if (slotError) {
      if (slotError.code === "23P01") {
        throw new Error("У инструктора уже есть занятие в это время");
      }

      throw new Error(slotError.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");

    return {
      status: "success",
      message: "Слот создан",
    };
  } catch (error) {
    console.error("createSlotAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function deleteSlotAction(formData: FormData) {
  await requireActiveOrganizationMember();
  const slotId = readRequiredString(formData, "slot_id");

  try {
    const supabase = createAdminClient();
    const { data: slot, error: slotLookupError } = await supabase
      .from("slots")
      .select("instructor_id")
      .eq("id", slotId)
      .maybeSingle();

    if (slotLookupError || !slot) {
      throw new Error("Слот не найден");
    }

    await requireInstructorAccess(slot.instructor_id);

    const { error } = await supabase
      .from("slots")
      .delete()
      .eq("id", slotId)
      .eq("instructor_id", slot.instructor_id);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");
  } catch (error) {
    console.error("deleteSlotAction:", error);
    throw error;
  }
}

export async function cancelBookingAction(formData: FormData) {
  await requireActiveOrganizationMember();
  const bookingId = readRequiredString(formData, "booking_id");

  try {
    const supabase = createAdminClient();
    const { data: booking, error: bookingLookupError } = await supabase
      .from("bookings")
      .select("slot_id")
      .eq("id", bookingId)
      .maybeSingle();

    if (bookingLookupError || !booking) {
      throw new Error("Запись не найдена");
    }

    const { data: slot, error: slotLookupError } = await supabase
      .from("slots")
      .select("instructor_id")
      .eq("id", booking.slot_id)
      .maybeSingle();

    if (slotLookupError || !slot) {
      throw new Error("Слот записи не найден");
    }

    await requireInstructorAccess(slot.instructor_id);

    const { error } = await supabase
      .from("bookings")
      .update({
        status: "cancelled",
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", bookingId)
      .eq("status", "confirmed");

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");
  } catch (error) {
    console.error("cancelBookingAction:", error);
    throw error;
  }
}

export async function createLessonTypeAction(
  previousState: LessonTypeActionState,
  formData: FormData,
): Promise<LessonTypeActionState> {
  void previousState;

  try {
    await requireLessonTypeManager();
    const name = readRequiredString(formData, "name");
    const category = requireLessonTypeCategory(
      readRequiredString(formData, "category"),
    );
    const color = readRequiredString(formData, "color");
    const durationMinutes = readInteger(
      formData,
      "default_duration_minutes",
      15,
      480,
    );
    const description = readOptionalString(formData, "description");
    const isActive = formData.get("is_active") === "on";

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error("Укажите цвет в формате HEX, например #FF9900");
    }

    if (name.length > 120) {
      throw new Error("Название типа занятия должно быть не длиннее 120 символов");
    }

    const persistence = getLessonTypePersistence(category);
    const supabase = createAdminClient();
    const { data: lastType, error: lastTypeError } = await supabase
      .from("lesson_types")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .order("name", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastTypeError) {
      throw new Error(lastTypeError.message);
    }

    const { error } = await supabase.from("lesson_types").insert({
      code: makeCustomLessonTypeCode(),
      name,
      description,
      color,
      kind: persistence.kind,
      requires_vehicle: persistence.requires_vehicle,
      default_duration_minutes: durationMinutes,
      tags: persistence.tags,
      sort_order: (lastType?.sort_order ?? 0) + 10,
      is_active: isActive,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");
    revalidatePath("/instructors");

    return {
      status: "success",
      message: "Тип занятия создан",
    };
  } catch (error) {
    console.error("createLessonTypeAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateLessonTypeAction(
  previousState: LessonTypeActionState,
  formData: FormData,
): Promise<LessonTypeActionState> {
  void previousState;

  try {
    await requireLessonTypeManager();
    const lessonTypeId = readRequiredString(formData, "lesson_type_id");
    const name = readRequiredString(formData, "name");
    const category = requireLessonTypeCategory(
      readRequiredString(formData, "category"),
    );
    const color = readRequiredString(formData, "color");
    const durationMinutes = readInteger(
      formData,
      "default_duration_minutes",
      15,
      480,
    );
    const description = readOptionalString(formData, "description");
    const isActive = formData.get("is_active") === "on";

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error("Укажите цвет в формате HEX, например #FF9900");
    }

    if (name.length > 120) {
      throw new Error("Название типа занятия должно быть не длиннее 120 символов");
    }

    const persistence = getLessonTypePersistence(category);
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("lesson_types")
      .update({
        name,
        description,
        color,
        kind: persistence.kind,
        requires_vehicle: persistence.requires_vehicle,
        default_duration_minutes: durationMinutes,
        tags: persistence.tags,
        is_active: isActive,
      })
      .eq("id", lessonTypeId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");
    revalidatePath("/instructors");

    return {
      status: "success",
      message: "Тип занятия обновлён",
    };
  } catch (error) {
    console.error("updateLessonTypeAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function toggleLessonTypeActiveAction(formData: FormData) {
  await requireLessonTypeManager();
  const lessonTypeId = readRequiredString(formData, "lesson_type_id");
  const isActive = formData.get("is_active") === "true";

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("lesson_types")
      .update({ is_active: isActive })
      .eq("id", lessonTypeId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");
    revalidatePath("/instructors");
  } catch (error) {
    console.error("toggleLessonTypeActiveAction:", error);
    throw error;
  }
}

export async function moveLessonTypeAction(formData: FormData) {
  await requireLessonTypeManager();
  const lessonTypeId = readRequiredString(formData, "lesson_type_id");
  const direction = readRequiredString(formData, "direction");

  if (direction !== "up" && direction !== "down") {
    throw new Error("Неизвестное направление сортировки");
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("lesson_types")
      .select("id, sort_order, name")
      .order("sort_order")
      .order("name");

    if (error) {
      throw new Error(error.message);
    }

    const lessonTypes = data ?? [];
    const currentIndex = lessonTypes.findIndex(
      (lessonType) => lessonType.id === lessonTypeId,
    );
    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (
      currentIndex === -1 ||
      targetIndex < 0 ||
      targetIndex >= lessonTypes.length
    ) {
      return;
    }

    const current = lessonTypes[currentIndex];
    const target = lessonTypes[targetIndex];
    const { error: currentError } = await supabase
      .from("lesson_types")
      .update({ sort_order: target.sort_order })
      .eq("id", current.id);

    if (currentError) {
      throw new Error(currentError.message);
    }

    const { error: targetError } = await supabase
      .from("lesson_types")
      .update({ sort_order: current.sort_order })
      .eq("id", target.id);

    if (targetError) {
      throw new Error(targetError.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");
    revalidatePath("/");
    revalidatePath("/schedule");
    revalidatePath("/instructors");
  } catch (error) {
    console.error("moveLessonTypeAction:", error);
    throw error;
  }
}

export async function saveBookingAccessCodeAction(
  previousState: AccessCodeActionState,
  formData: FormData,
): Promise<AccessCodeActionState> {
  void previousState;

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    await requireInstructorAccess(instructorId);
    const accessCode = readRequiredString(formData, "access_code");

    if (accessCode.length > 100) {
      return {
        status: "error",
        message: "Кодовое слово должно содержать не более 100 символов",
      };
    }

    const supabase = createAdminClient();
    const { error } = await supabase.rpc("set_booking_access_code", {
      target_instructor_id: instructorId,
      new_access_code: accessCode,
      new_access_code_hash: hashBookingAccessCode(accessCode),
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/bookings");

    return {
      status: "success",
      message: "Кодовое слово сохранено",
    };
  } catch (error) {
    console.error("saveBookingAccessCodeAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
