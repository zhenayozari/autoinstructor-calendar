"use server";

import { revalidatePath } from "next/cache";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit-log";
import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryOne, queryRows } from "@/lib/db/postgres";
import { isMissingPricingTableError } from "@/lib/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

export type PriceMatrixActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось сохранить цены";
}

function readRequiredString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value.trim();
}

function parseOptionalPrice(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 10_000_000) {
    throw new Error("Цена должна быть целым числом от 0 до 10 000 000");
  }

  return normalized;
}

async function requirePriceManager() {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner") {
    throw new Error("Управлять ценами может только руководитель");
  }

  return membership;
}

export async function updateSchoolLessonTypePricesAction(
  previousState: PriceMatrixActionState,
  formData: FormData,
): Promise<PriceMatrixActionState> {
  void previousState;

  try {
    const membership = await requirePriceManager();
    const schoolId = readRequiredString(formData, "school_id");
    const lessonTypeIds = formData
      .getAll("lesson_type_id")
      .filter((value): value is string => typeof value === "string" && Boolean(value));

    if (lessonTypeIds.length === 0) {
      throw new Error("Нет типов занятий для сохранения");
    }

    if (isPostgresBackend()) {
      const [school, lessonTypes] = await Promise.all([
        queryOne<{ id: string }>(
          `
            select id
            from public.schools
            where id = $1
              and organization_id = $2
            limit 1
          `,
          [schoolId, membership.organizationId],
        ),
        queryRows<{ id: string }>(
          `
            select id
            from public.lesson_types
            where id = any($1::uuid[])
          `,
          [lessonTypeIds],
        ),
      ]);

      if (!school) throw new Error("Источник не найден");

      const validLessonTypeIds = new Set(lessonTypes.map((item) => item.id));
      const upserts: Array<{
        lessonTypeId: string;
        priceAmount: number;
      }> = [];
      const deleteIds: string[] = [];

      for (const lessonTypeId of lessonTypeIds) {
        if (!validLessonTypeIds.has(lessonTypeId)) {
          continue;
        }

        const priceAmount = parseOptionalPrice(
          formData.get(`price_amount_${lessonTypeId}`),
        );

        if (priceAmount === null) {
          deleteIds.push(lessonTypeId);
        } else {
          upserts.push({
            lessonTypeId,
            priceAmount,
          });
        }
      }

      if (deleteIds.length > 0) {
        await executeQuery(
          `
            delete from public.school_lesson_type_prices
            where organization_id = $1
              and school_id = $2
              and lesson_type_id = any($3::uuid[])
          `,
          [membership.organizationId, schoolId, deleteIds],
        );
      }

      for (const item of upserts) {
        await executeQuery(
          `
            insert into public.school_lesson_type_prices (
              organization_id, school_id, lesson_type_id, price_amount,
              updated_at
            )
            values ($1, $2, $3, $4, $5)
            on conflict (organization_id, school_id, lesson_type_id) do update
            set price_amount = excluded.price_amount,
                updated_at = excluded.updated_at
          `,
          [
            membership.organizationId,
            schoolId,
            item.lessonTypeId,
            item.priceAmount,
            new Date().toISOString(),
          ],
        );
      }

      await logAuditEvent({
        membership,
        action: "price_matrix.updated",
        entityType: "price_matrix",
        entityId: schoolId,
        metadata: {
          configured_count: upserts.length,
          cleared_count: deleteIds.length,
        },
      });

      revalidatePath("/admin/settings");
      revalidatePath("/director/settings");
      revalidatePath("/director/audit");

      return {
        status: "success",
        message: "Цены сохранены",
      };
    }

    const supabase = createAdminClient();
    const [
      { data: school, error: schoolError },
      { data: lessonTypes, error: lessonTypesError },
    ] = await Promise.all([
      supabase
        .from("schools")
        .select("id")
        .eq("id", schoolId)
        .eq("organization_id", membership.organizationId)
        .maybeSingle(),
      supabase
        .from("lesson_types")
        .select("id")
        .in("id", lessonTypeIds),
    ]);

    if (schoolError) throw new Error(schoolError.message);
    if (lessonTypesError) throw new Error(lessonTypesError.message);
    if (!school) throw new Error("Источник не найден");

    const validLessonTypeIds = new Set((lessonTypes ?? []).map((item) => item.id));
    const upserts: Array<{
      organization_id: string;
      school_id: string;
      lesson_type_id: string;
      price_amount: number;
      updated_at: string;
    }> = [];
    const deleteIds: string[] = [];

    for (const lessonTypeId of lessonTypeIds) {
      if (!validLessonTypeIds.has(lessonTypeId)) {
        continue;
      }

      const priceAmount = parseOptionalPrice(
        formData.get(`price_amount_${lessonTypeId}`),
      );

      if (priceAmount === null) {
        deleteIds.push(lessonTypeId);
      } else {
        upserts.push({
          organization_id: membership.organizationId,
          school_id: schoolId,
          lesson_type_id: lessonTypeId,
          price_amount: priceAmount,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (deleteIds.length > 0) {
      const { error } = await supabase
        .from("school_lesson_type_prices")
        .delete()
        .eq("organization_id", membership.organizationId)
        .eq("school_id", schoolId)
        .in("lesson_type_id", deleteIds);

      if (error && !isMissingPricingTableError(error)) {
        throw new Error(error.message);
      }
    }

    if (upserts.length > 0) {
      const { error } = await supabase
        .from("school_lesson_type_prices")
        .upsert(upserts, {
          onConflict: "organization_id,school_id,lesson_type_id",
        });

      if (error) {
        if (isMissingPricingTableError(error)) {
          throw new Error(
            "Сначала примените миграцию цен по источникам в Supabase",
          );
        }

        throw new Error(error.message);
      }
    }

    await logAuditEvent({
      membership,
      action: "price_matrix.updated",
      entityType: "price_matrix",
      entityId: schoolId,
      metadata: {
        configured_count: upserts.length,
        cleared_count: deleteIds.length,
      },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/director/settings");
    revalidatePath("/director/audit");

    return {
      status: "success",
      message: "Цены сохранены",
    };
  } catch (error) {
    console.error("updateSchoolLessonTypePricesAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
