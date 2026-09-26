"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAuditEvent } from "@/lib/audit-log";
import { isPostgresBackend } from "@/lib/backend-mode";
import { requireDirectorAccess } from "@/lib/director-auth";
import {
  cancelInstructorPayoutPayment,
  createInstructorPayoutReturn,
  createInstructorPayoutPayment,
  markInstructorDebtForWithholding,
} from "@/lib/instructor-payouts";

function readOptionalString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim();
}

function readRequiredString(formData: FormData, field: string) {
  const value = readOptionalString(formData, field);

  if (!value) {
    throw new Error(`Поле "${field}" обязательно`);
  }

  return value;
}

function readOptionalInteger(formData: FormData, field: string) {
  const value = readOptionalString(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function validateLength(value: string | null, max: number, label: string) {
  if (value && value.length > max) {
    throw new Error(`${label} не должно быть длиннее ${max} символов`);
  }

  return value;
}

function readReturnSearchParams(formData: FormData, status: string) {
  const params = new URLSearchParams({ payout: status });
  const period = readOptionalString(formData, "return_period");
  const from = readOptionalString(formData, "return_from");
  const to = readOptionalString(formData, "return_to");
  const instructor = readOptionalString(formData, "return_instructor");

  if (period) params.set("period", period);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (instructor) params.set("instructor", instructor);

  return params;
}

function isNextRedirectError(error: unknown) {
  return (
    error &&
    typeof error === "object" &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("NEXT_REDIRECT")
  );
}

export async function createDirectorReportPayoutPaymentAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "paid";
  let paymentId: string | null = null;

  try {
    if (!isPostgresBackend()) {
      throw new Error("Выплаты доступны только в PostgreSQL-режиме");
    }

    const instructorId = readRequiredString(formData, "instructor_id");
    const amount = readOptionalInteger(formData, "amount");

    if (amount === null || amount <= 0) {
      throw new Error("Укажите сумму выдачи");
    }

    const payment = await createInstructorPayoutPayment({
      organizationId: membership.organizationId,
      instructorId,
      amount,
      paymentNote: validateLength(
        readOptionalString(formData, "payment_note"),
        500,
        "Комментарий",
      ),
      createdByMemberId: membership.id,
    });

    paymentId = payment.id;

    await logAuditEvent({
      membership,
      action: "director_report_payout_payment.created",
      entityType: "instructor_payout_payment",
      entityId: payment.id,
      metadata: {
        instructor_id: instructorId,
        amount: payment.amount,
      },
    });

    revalidatePath("/director/reports");
    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("createDirectorReportPayoutPaymentAction:", error);
    status = "error";
  }

  const params = readReturnSearchParams(formData, status);
  if (paymentId) params.set("paymentId", paymentId);

  redirect(`/director/reports?${params.toString()}`);
}

export async function cancelDirectorReportPayoutPaymentAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "cancelled";

  try {
    if (!isPostgresBackend()) {
      throw new Error("Отмена выплат доступна только в PostgreSQL-режиме");
    }

    const paymentId = readRequiredString(formData, "payment_id");
    const payment = await cancelInstructorPayoutPayment({
      organizationId: membership.organizationId,
      paymentId,
    });

    if (!payment) {
      throw new Error("Выплата не найдена или уже отменена");
    }

    await logAuditEvent({
      membership,
      action: "director_report_payout_payment.cancelled",
      entityType: "instructor_payout_payment",
      entityId: payment.id,
      metadata: {
        instructor_id: payment.instructor_id,
        amount: payment.amount,
      },
    });

    revalidatePath("/director/reports");
    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("cancelDirectorReportPayoutPaymentAction:", error);
    status = "error";
  }

  const params = readReturnSearchParams(formData, status);
  redirect(`/director/reports?${params.toString()}`);
}

export async function createDirectorInstructorReturnAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "returned";

  try {
    if (!isPostgresBackend()) {
      throw new Error("Возвраты доступны только в PostgreSQL-режиме");
    }

    const instructorId = readRequiredString(formData, "instructor_id");
    const amount = readOptionalInteger(formData, "amount");
    if (amount === null || amount <= 0) {
      throw new Error("Укажите сумму возврата");
    }

    const payoutReturn = await createInstructorPayoutReturn({
      organizationId: membership.organizationId,
      instructorId,
      amount,
      returnedAt: readOptionalString(formData, "returned_at"),
      returnNote: validateLength(
        readOptionalString(formData, "return_note"),
        500,
        "Комментарий",
      ),
      createdByMemberId: membership.id,
    });

    await logAuditEvent({
      membership,
      action: "director_report_payout_return.created",
      entityType: "instructor_payout_return",
      entityId: payoutReturn.id,
      metadata: { instructor_id: instructorId, amount: payoutReturn.amount },
    });

    revalidatePath("/director/reports");
    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("createDirectorInstructorReturnAction:", error);
    status = "error";
  }

  redirect(`/director/reports?${readReturnSearchParams(formData, status).toString()}`);
}

export async function markDirectorInstructorDebtWithholdingAction(
  formData: FormData,
) {
  const membership = await requireDirectorAccess();
  let status = "withheld";

  try {
    if (!isPostgresBackend()) {
      throw new Error("Удержания доступны только в PostgreSQL-режиме");
    }

    const instructorId = readRequiredString(formData, "instructor_id");
    await markInstructorDebtForWithholding({
      organizationId: membership.organizationId,
      instructorId,
      note: validateLength(
        readOptionalString(formData, "withhold_note"),
        500,
        "Комментарий",
      ),
    });

    await logAuditEvent({
      membership,
      action: "director_report_payout_debt.withheld",
      entityType: "instructor_payout_entry",
      entityId: instructorId,
      metadata: { instructor_id: instructorId },
    });

    revalidatePath("/director/reports");
    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error("markDirectorInstructorDebtWithholdingAction:", error);
    status = "error";
  }

  redirect(`/director/reports?${readReturnSearchParams(formData, status).toString()}`);
}
