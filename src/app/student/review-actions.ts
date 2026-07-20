"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentStudentAccess } from "@/lib/student-session";
import { createAdminClient } from "@/lib/supabase/admin";

export type LessonReviewActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось сохранить отзыв";
}

function readRequiredString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value.trim();
}

function readRating(formData: FormData) {
  const value = Number(formData.get("rating"));

  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("Выберите оценку от 1 до 5");
  }

  return value;
}

function readComment(formData: FormData) {
  const value = formData.get("comment");

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const comment = value.trim();

  if (comment.length > 1000) {
    throw new Error("Комментарий должен быть не длиннее 1000 символов");
  }

  return comment;
}

export async function submitLessonReviewAction(
  previousState: LessonReviewActionState,
  formData: FormData,
): Promise<LessonReviewActionState> {
  void previousState;

  try {
    const access = await requireCurrentStudentAccess();
    const bookingId = readRequiredString(formData, "booking_id");
    const rating = readRating(formData);
    const comment = readComment(formData);
    const supabase = createAdminClient();
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select("id, slot_id, student_access_id, lesson_state, status")
      .eq("id", bookingId)
      .eq("student_access_id", access.id)
      .maybeSingle();

    if (bookingError) {
      throw new Error(bookingError.message);
    }

    if (!booking || booking.status !== "confirmed") {
      throw new Error("Запись не найдена");
    }

    if (booking.lesson_state !== "completed") {
      throw new Error("Отзыв можно оставить только после проведённого занятия");
    }

    const { error } = await supabase.from("lesson_reviews").upsert(
      {
        organization_id: access.organizationId,
        instructor_id: access.instructorId,
        booking_id: booking.id,
        student_access_id: access.id,
        rating,
        comment,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "booking_id" },
    );

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/student");
    revalidatePath("/admin/rating");
    revalidatePath("/director/audit");

    return {
      status: "success",
      message: "Спасибо, отзыв сохранён",
    };
  } catch (error) {
    console.error("submitLessonReviewAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
