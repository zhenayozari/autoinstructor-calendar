"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeBookingAccessCode,
  verifyBookingAccessCode,
} from "@/lib/booking-access-code";
import { createClient } from "@/lib/supabase/server";

export type BookingActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function bookSlotAction(
  previousState: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  void previousState;

  const slotId = formData.get("slot_id");
  const rawStudentLabel = formData.get("student_label");
  const rawAccessCode = formData.get("access_code");

  if (typeof slotId !== "string" || !slotId) {
    return {
      status: "error",
      message: "Не удалось определить выбранный слот",
    };
  }

  if (typeof rawStudentLabel !== "string") {
    return {
      status: "error",
      message: "Введите имя или кодовое слово",
    };
  }

  const studentLabel = rawStudentLabel.trim();
  const accessCode =
    typeof rawAccessCode === "string" ? rawAccessCode.trim() : "";

  if (studentLabel.length < 1 || studentLabel.length > 80) {
    return {
      status: "error",
      message: "Имя или кодовое слово должно содержать от 1 до 80 символов",
    };
  }

  const supabase = await createClient();
  const { data: slot, error: slotError } = await supabase
    .from("public_schedule_slots")
    .select("id, instructor_id, status, is_booked")
    .eq("id", slotId)
    .maybeSingle();

  if (slotError) {
    console.error("bookSlotAction slot lookup:", slotError);

    return {
      status: "error",
      message: "Не удалось проверить слот. Попробуйте ещё раз",
    };
  }

  if (!slot || slot.status !== "available") {
    return {
      status: "error",
      message: "Этот слот больше недоступен",
    };
  }

  if (slot.is_booked) {
    return {
      status: "error",
      message: "Этот слот уже занят",
    };
  }

  try {
    const adminSupabase = createAdminClient();
    const { data: settings, error: settingsError } = await adminSupabase
      .from("instructor_settings")
      .select("booking_access_code, booking_access_code_hash")
      .eq("instructor_id", slot.instructor_id)
      .maybeSingle();

    if (settingsError) {
      console.error("bookSlotAction settings lookup:", settingsError);

      return {
        status: "error",
        message: "Не удалось проверить кодовое слово. Попробуйте ещё раз",
      };
    }

    const hasPlainAccessCode = Boolean(settings?.booking_access_code);
    const isPlainAccessCodeValid =
      hasPlainAccessCode &&
      normalizeBookingAccessCode(accessCode) ===
        normalizeBookingAccessCode(settings?.booking_access_code ?? "");
    const isHashAccessCodeValid =
      Boolean(settings?.booking_access_code_hash) &&
      verifyBookingAccessCode(
        accessCode,
        settings?.booking_access_code_hash ?? "",
      );

    if (
      (hasPlainAccessCode || settings?.booking_access_code_hash) &&
      !isPlainAccessCodeValid &&
      !isHashAccessCodeValid
    ) {
      return {
        status: "error",
        message: "Неверное кодовое слово",
      };
    }
  } catch (error) {
    console.error("bookSlotAction access code verification:", error);

    return {
      status: "error",
      message: "Не удалось проверить кодовое слово. Попробуйте ещё раз",
    };
  }

  const { error } = await createAdminClient().from("bookings").insert({
    slot_id: slotId,
    student_label: studentLabel,
  });

  if (error) {
    console.error("bookSlotAction insert:", error);

    if (error.code === "23505") {
      return {
        status: "error",
        message: "Этот слот уже занят",
      };
    }

    return {
      status: "error",
      message: "Не удалось записаться. Попробуйте ещё раз",
    };
  }

  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath("/instructors");

  return {
    status: "success",
    message: "Вы успешно записаны",
  };
}
