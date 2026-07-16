"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type SchoolActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function readRequiredString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value.trim();
}

function readOptionalInteger(
  formData: FormData,
  field: string,
  min: number,
  max: number,
) {
  const raw = formData.get(field);

  if (typeof raw !== "string" || !raw.trim()) {
    return null;
  }

  const value = Number(raw.trim());

  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(
      `Поле «${field}» должно быть целым числом от ${min} до ${max}`,
    );
  }

  return value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
}

async function requireSchoolManager() {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner") {
    throw new Error("Управлять источниками может только руководитель");
  }

  return membership;
}

export async function createSchoolAction(
  previousState: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  void previousState;

  try {
    const membership = await requireSchoolManager();
    const name = readRequiredString(formData, "name");
    const color = readRequiredString(formData, "color");
    const defaultPrice = readOptionalInteger(formData, "default_price", 0, 10_000_000);
    const isActive = formData.get("is_active") === "on";

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error("Укажите цвет в формате HEX, например #FF9900");
    }

    if (name.length > 80) {
      throw new Error("Название источника должно быть не длиннее 80 символов");
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from("schools").insert({
      organization_id: membership.organizationId,
      name,
      color,
      default_price: defaultPrice,
      is_active: isActive,
    });

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    revalidatePath("/admin/schedule");

    return { status: "success", message: "Источник добавлен" };
  } catch (error) {
    console.error("createSchoolAction:", error);

    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function updateSchoolAction(
  previousState: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  void previousState;

  try {
    const membership = await requireSchoolManager();
    const schoolId = readRequiredString(formData, "school_id");
    const name = readRequiredString(formData, "name");
    const color = readRequiredString(formData, "color");
    const defaultPrice = readOptionalInteger(formData, "default_price", 0, 10_000_000);
    const isActive = formData.get("is_active") === "on";

    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      throw new Error("Укажите цвет в формате HEX, например #FF9900");
    }

    if (name.length > 80) {
      throw new Error("Название источника должно быть не длиннее 80 символов");
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("schools")
      .update({ name, color, default_price: defaultPrice, is_active: isActive })
      .eq("id", schoolId)
      .eq("organization_id", membership.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    revalidatePath("/admin/schedule");

    return { status: "success", message: "Источник обновлён" };
  } catch (error) {
    console.error("updateSchoolAction:", error);

    return { status: "error", message: getErrorMessage(error) };
  }
}

export async function toggleSchoolActiveAction(
  formData: FormData,
): Promise<void> {
  try {
    const membership = await requireSchoolManager();
    const schoolId = readRequiredString(formData, "school_id");
    const isActive = formData.get("is_active") === "true";
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("schools")
      .update({ is_active: isActive })
      .eq("id", schoolId)
      .eq("organization_id", membership.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
  } catch (error) {
    console.error("toggleSchoolActiveAction:", error);
    throw error;
  }
}

export async function deleteSchoolAction(
  previousState: SchoolActionState,
  formData: FormData,
): Promise<SchoolActionState> {
  void previousState;

  try {
    const membership = await requireSchoolManager();
    const schoolId = readRequiredString(formData, "school_id");
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("schools")
      .delete()
      .eq("id", schoolId)
      .eq("organization_id", membership.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin/reports");
    revalidatePath("/admin/students");

    return { status: "success", message: "Источник удалён навсегда" };
  } catch (error) {
    console.error("deleteSchoolAction:", error);

    return { status: "error", message: getErrorMessage(error) };
  }
}
