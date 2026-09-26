"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAuditEvent } from "@/lib/audit-log";
import { isPostgresBackend } from "@/lib/backend-mode";
import { requireDirectorAccess } from "@/lib/director-auth";
import { createInstructorPayoutPayment } from "@/lib/instructor-payouts";

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
