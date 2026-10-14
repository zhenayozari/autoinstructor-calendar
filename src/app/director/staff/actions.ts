"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirectorAccess } from "@/lib/director-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { revokeAllAppUserSessions } from "@/lib/app-users/session";
import { executeQuery, queryOne, withTransaction } from "@/lib/db/postgres";
import { purgeInstructorFinancialData } from "@/lib/destructive-data-cleanup";
import {
  backfillInstructorPayoutEntries,
  createInstructorPayoutPayment,
  createInstructorPayoutRateRule,
  updateInstructorPayoutSettingsAndVisibility,
  updateOwnerPayoutPolicy,
} from "@/lib/instructor-payouts";
import type {
  BookingCategory,
  InstructorPayoutAccrualPolicy,
  InstructorSourceVisibilityMode,
} from "@/lib/types";

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

function validateLength(value: string | null, max: number, label: string) {
  if (value && value.length > max) {
    throw new Error(`${label} не должно быть длиннее ${max} символов`);
  }

  return value;
}

function normalizeEmail(email: string | null) {
  return email ? email.toLowerCase() : null;
}

function redirectWithStatus(status: string, staffId?: string | null) {
  const params = new URLSearchParams({ invite: status });

  if (staffId) {
    params.set("staff", staffId);
  }

  redirect(`/director/staff?${params.toString()}`);
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

export async function createStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "created";

  try {
    const invitedName = validateLength(
      readOptionalString(formData, "invited_name"),
      160,
      "Имя",
    );
    const invitedEmail = normalizeEmail(
      validateLength(readOptionalString(formData, "invited_email"), 254, "Эл. почта"),
    );
    const invitedPhone = validateLength(
      readOptionalString(formData, "invited_phone"),
      40,
      "Телефон",
    );
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();

    const invitation = await queryOne<{ id: string }>(
        `
          insert into public.staff_invitations (
            organization_id, invited_by_member_id, token, invited_name,
            invited_email, invited_phone, expires_at
          )
          values ($1, $2, $3, $4, $5, $6, $7)
          returning id
        `,
        [
          membership.organizationId,
          membership.id,
          token,
          invitedName,
          invitedEmail,
          invitedPhone,
          expiresAt,
        ],
      );

    if (!invitation) {
      throw new Error("Не удалось создать приглашение");
    }

    await logAuditEvent({
      membership,
      action: "staff_invitation.created",
      entityType: "staff_invitation",
      entityId: invitation.id,
      metadata: {
        has_email: Boolean(invitedEmail),
        has_phone: Boolean(invitedPhone),
      },
    });

    revalidatePath("/director/staff");
    redirectWithStatus(status);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("createStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status, readOptionalString(formData, "instructor_id"));
}

export async function approveStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "approved";

  try {
    const invitationId = readRequiredString(formData, "invitation_id");

    const invitation = await queryOne<{
        id: string;
        organization_id: string;
        status: string;
        user_id: string | null;
        instructor_id: string | null;
      }>(
        `
          select id, organization_id, status, user_id, instructor_id
          from public.staff_invitations
          where id = $1
            and organization_id = $2
        `,
        [invitationId, membership.organizationId],
      );

      if (!invitation) {
        throw new Error("Приглашение не найдено");
      }

      if (invitation.status !== "submitted") {
        throw new Error("Подтвердить можно только отправленную заявку");
      }

      if (!invitation.user_id || !invitation.instructor_id) {
        throw new Error("В заявке нет связанного аккаунта сотрудника");
      }

      await withTransaction(async (client) => {
        await client.query(
          `
            update public.instructors
            set is_active = true,
                public_is_visible = true,
                profile_updated_at = now()
            where id = $1
              and organization_id = $2
          `,
          [invitation.instructor_id, membership.organizationId],
        );
        await client.query(
          `
            update public.organization_members
            set is_active = true
            where organization_id = $1
              and user_id = $2
              and instructor_id = $3
              and role = 'instructor'
          `,
          [
            membership.organizationId,
            invitation.user_id,
            invitation.instructor_id,
          ],
        );
        await client.query(
          `
            update public.staff_invitations
            set status = 'approved',
                reviewed_at = now(),
                updated_at = now()
            where id = $1
          `,
          [invitation.id],
        );
      });

      await logAuditEvent({
        membership,
        action: "staff_invitation.approved",
        entityType: "staff_invitation",
        entityId: invitation.id,
        metadata: {
          instructor_id: invitation.instructor_id,
        },
      });

      revalidatePath("/director/staff");
      revalidatePath("/director");
      redirectWithStatus(status);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("approveStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status, readOptionalString(formData, "instructor_id"));
}

export async function rejectStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "rejected";

  try {
    const invitationId = readRequiredString(formData, "invitation_id");

    const invitation = await queryOne<{
        id: string;
        organization_id: string;
        instructor_id: string | null;
        user_id: string | null;
      }>(
        `
          select id, organization_id, instructor_id, user_id
          from public.staff_invitations
          where id = $1
            and organization_id = $2
        `,
        [invitationId, membership.organizationId],
      );

      if (!invitation) {
        throw new Error("Приглашение не найдено");
      }

      await withTransaction(async (client) => {
        if (invitation.instructor_id) {
          await client.query(
            `
              update public.instructors
              set is_active = false,
                  public_is_visible = false
              where id = $1
                and organization_id = $2
            `,
            [invitation.instructor_id, membership.organizationId],
          );
        }

        if (invitation.user_id) {
          await client.query(
            `
              update public.organization_members
              set is_active = false
              where organization_id = $1
                and user_id = $2
            `,
            [membership.organizationId, invitation.user_id],
          );
        }

        await client.query(
          `
            update public.staff_invitations
            set status = 'rejected',
                reviewed_at = now(),
                updated_at = now()
            where id = $1
          `,
          [invitation.id],
        );
      });

      if (invitation.user_id) {
        await revokeAllAppUserSessions(invitation.user_id);
      }

      await logAuditEvent({
        membership,
        action: "staff_invitation.rejected",
        entityType: "staff_invitation",
        entityId: invitation.id,
        metadata: {
          instructor_id: invitation.instructor_id,
        },
      });

      revalidatePath("/director/staff");
      redirectWithStatus(status);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("rejectStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status, readOptionalString(formData, "instructor_id"));
}

export async function deleteStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "invitation-deleted";

  try {
    const invitationId = readRequiredString(formData, "invitation_id");

    const invitation = await queryOne<{
        id: string;
        organization_id: string;
        status: string;
        instructor_id: string | null;
      }>(
        `
          select id, organization_id, status, instructor_id
          from public.staff_invitations
          where id = $1
            and organization_id = $2
        `,
        [invitationId, membership.organizationId],
      );

      if (!invitation) {
        throw new Error("Приглашение не найдено");
      }

      if (invitation.status !== "invited") {
        throw new Error("Удалить можно только активную ссылку без заявки");
      }

      if (invitation.instructor_id) {
        throw new Error("У этого приглашения уже есть сотрудник. Используйте отклонение или удаление сотрудника.");
      }

      await executeQuery(
        `
          delete from public.staff_invitations
          where id = $1
            and organization_id = $2
        `,
        [invitation.id, membership.organizationId],
      );

      await logAuditEvent({
        membership,
        action: "staff_invitation.deleted",
        entityType: "staff_invitation",
        entityId: invitation.id,
        metadata: {
          status: invitation.status,
        },
      });

      revalidatePath("/director/staff");
      redirectWithStatus(status);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("deleteStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status, readOptionalString(formData, "instructor_id"));
}

export async function updateStaffInstructorStatusAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "staff-updated";

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    const nextActive = readRequiredString(formData, "next_active") === "true";

    const member = await queryOne<{
        id: string;
        role: "owner" | "admin" | "instructor";
        user_id: string;
      }>(
        `
          select id, role, user_id
          from public.organization_members
          where organization_id = $1
            and instructor_id = $2
        `,
        [membership.organizationId, instructorId],
      );

      if (member?.role === "owner") {
        throw new Error("Руководителя нельзя отключить отсюда");
      }

      await withTransaction(async (client) => {
        await client.query(
          `
            update public.instructors
            set is_active = $1,
                public_is_visible = $1,
                profile_updated_at = now()
            where id = $2
              and organization_id = $3
          `,
          [nextActive, instructorId, membership.organizationId],
        );

        if (member) {
          await client.query(
            `
              update public.organization_members
              set is_active = $1
              where id = $2
                and organization_id = $3
            `,
            [nextActive, member.id, membership.organizationId],
          );
        }
      });

      if (!nextActive && member?.user_id) {
        await revokeAllAppUserSessions(member.user_id);
      }

      await logAuditEvent({
        membership,
        action: nextActive ? "staff.enabled" : "staff.disabled",
        entityType: "instructor",
        entityId: instructorId,
        metadata: {
          is_active: nextActive,
        },
      });

      revalidatePath("/director/staff");
      revalidatePath("/director");
      redirectWithStatus(status);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("updateStaffInstructorStatusAction:", error);
    status = "error";
  }

  redirectWithStatus(status, readOptionalString(formData, "instructor_id"));
}

export async function deleteStaffInstructorAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "staff-deleted";

  try {
    const instructorId = readRequiredString(formData, "instructor_id");

    if (formData.get("confirm_delete") !== "yes") {
      throw new Error("Подтвердите удаление сотрудника");
    }

    const member = await queryOne<{
        id: string;
        role: "owner" | "admin" | "instructor";
        user_id: string | null;
      }>(
        `
          select id, role, user_id
          from public.organization_members
          where organization_id = $1
            and instructor_id = $2
        `,
        [membership.organizationId, instructorId],
      );

      if (member?.role === "owner") {
        throw new Error("Руководителя нельзя удалить отсюда");
      }

      const staffUserId =
        typeof member?.user_id === "string" ? member.user_id : null;
      let shouldDeleteAppUser = false;

      if (staffUserId) {
        const membershipsCount = await queryOne<{ count: string }>(
          `
            select count(*)::text as count
            from public.organization_members
            where user_id = $1
          `,
          [staffUserId],
        );
        shouldDeleteAppUser = Number(membershipsCount?.count ?? 0) <= 1;
      }

      const instructor = await queryOne<{ id: string }>(
        `
          select id
          from public.instructors
          where id = $1
            and organization_id = $2
        `,
        [instructorId, membership.organizationId],
      );

      if (!instructor) {
        throw new Error("Сотрудник не найден");
      }

      await withTransaction(async (client) => {
        await purgeInstructorFinancialData({
          client,
          organizationId: membership.organizationId,
          instructorId,
        });
        await client.query(
          `
            delete from public.staff_invitations
            where organization_id = $1
              and instructor_id = $2
          `,
          [membership.organizationId, instructorId],
        );
        await client.query(
          `
            delete from public.instructors
            where id = $1
              and organization_id = $2
          `,
          [instructorId, membership.organizationId],
        );

        if (staffUserId && shouldDeleteAppUser) {
          await client.query(
            `
              delete from public.app_users
              where id = $1
            `,
            [staffUserId],
          );
        }
      });

      if (staffUserId && !shouldDeleteAppUser) {
        await revokeAllAppUserSessions(staffUserId);
      }

      await logAuditEvent({
        membership,
        action: "staff.deleted",
        entityType: "instructor",
        entityId: instructorId,
        metadata: {
          app_user_deleted: Boolean(staffUserId && shouldDeleteAppUser),
        },
      });

      revalidatePath("/director");
      revalidatePath("/director/staff");
      revalidatePath("/director/schedule");
      revalidatePath("/director/students");
      revalidatePath("/director/reports");
      revalidatePath("/admin");
      redirectWithStatus(status);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("deleteStaffInstructorAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

function readOptionalUuid(formData: FormData, field: string) {
  const value = readOptionalString(formData, field);
  return value === "all" ? null : value;
}

function readOptionalInteger(formData: FormData, field: string) {
  const value = readOptionalString(formData, field);

  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Поле "${field}" должно быть целым числом`);
  }

  return parsed;
}

function readAccrualPolicy(value: string): InstructorPayoutAccrualPolicy {
  if (value === "prepaid" || value === "postpaid") {
    return value;
  }

  throw new Error("Некорректный режим начисления");
}

function readSourceVisibilityMode(value: string): InstructorSourceVisibilityMode {
  if (value === "all_active" || value === "selected_only") {
    return value;
  }

  throw new Error("Некорректная видимость источников");
}

function readBookingCategory(value: string | null): BookingCategory | null {
  if (!value || value === "all") {
    return null;
  }

  if (value === "regular" || value === "extra" || value === "gift") {
    return value;
  }

  throw new Error("Некорректная категория записи");
}

function readStringList(formData: FormData, field: string) {
  return formData
    .getAll(field)
    .filter((value): value is string => typeof value === "string" && Boolean(value));
}

export async function updateStaffPayoutSettingsAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "payout-updated";
  let instructorId: string | null = null;

  try {
    instructorId = readRequiredString(formData, "instructor_id");
    const accrualPolicy = readAccrualPolicy(
      readRequiredString(formData, "accrual_policy"),
    );
    const sourceVisibilityMode = readSourceVisibilityMode(
      readRequiredString(formData, "source_visibility_mode"),
    );
    const weeklyLessonLimit = readOptionalInteger(
      formData,
      "weekly_lesson_limit",
    );
    const showClientPrices = formData.get("show_client_prices") === "true";
    const canManageStudentPackages =
      formData.get("can_manage_student_packages") === "true";
    const privateExtraFullPayoutEnabled =
      formData.get("private_extra_full_payout_enabled") === "true";
    const visibleSchoolIds = readStringList(formData, "visible_school_id");

    await updateInstructorPayoutSettingsAndVisibility({
      organizationId: membership.organizationId,
      instructorId,
      accrualPolicy,
      weeklyLessonLimit,
      sourceVisibilityMode,
      showClientPrices,
      canManageStudentPackages,
      privateExtraFullPayoutEnabled,
      visibleSchoolIds,
    });

    await logAuditEvent({
      membership,
      action: "staff_payout_settings.updated",
      entityType: "instructor",
      entityId: instructorId,
      metadata: {
        accrual_policy: accrualPolicy,
        weekly_lesson_limit: weeklyLessonLimit,
        source_visibility_mode: sourceVisibilityMode,
        show_client_prices: showClientPrices,
        can_manage_student_packages: canManageStudentPackages,
        private_extra_full_payout_enabled: privateExtraFullPayoutEnabled,
        visible_school_count: visibleSchoolIds.length,
      },
    });

    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("updateStaffPayoutSettingsAction:", error);
    status = "error";
  }

  redirectWithStatus(status, instructorId);
}

export async function updateOwnerPayoutPolicyAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "owner-payout-updated";

  try {
    const includeOwnerInPayouts =
      formData.get("include_owner_in_payouts") === "true";

    await updateOwnerPayoutPolicy({
      organizationId: membership.organizationId,
      includeOwnerInPayouts,
    });

    await logAuditEvent({
      membership,
      action: "owner_payout_policy.updated",
      entityType: "organization",
      entityId: membership.organizationId,
      metadata: {
        include_owner_in_payouts: includeOwnerInPayouts,
      },
    });

    revalidatePath("/director/staff");
    revalidatePath("/director/reports");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("updateOwnerPayoutPolicyAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

export async function createStaffPayoutRateRuleAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "payout-rate-created";
  let instructorId: string | null = null;

  try {
    instructorId = readRequiredString(formData, "instructor_id");
    const amount = readOptionalInteger(formData, "amount");

    if (amount === null || amount < 0) {
      throw new Error("Укажите сумму выплаты инструктору");
    }

    const rule = await createInstructorPayoutRateRule({
      organizationId: membership.organizationId,
      instructorId,
      schoolId: readOptionalUuid(formData, "school_id"),
      lessonTypeId: readOptionalUuid(formData, "lesson_type_id"),
      bookingCategory: readBookingCategory(readOptionalString(formData, "booking_category")),
      amount,
      isActive: true,
      effectiveFrom: readRequiredString(formData, "effective_from"),
      effectiveTo: readOptionalString(formData, "effective_to"),
      note: validateLength(readOptionalString(formData, "note"), 300, "Комментарий"),
    });

    await logAuditEvent({
      membership,
      action: "staff_payout_rate.created",
      entityType: "instructor_payout_rate_rule",
      entityId: rule.id,
      metadata: {
        instructor_id: instructorId,
        amount,
      },
    });

    revalidatePath("/director/staff");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("createStaffPayoutRateRuleAction:", error);
    status = "error";
  }

  redirectWithStatus(status, instructorId);
}

export async function disableStaffPayoutRateRuleAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "payout-rate-disabled";
  let instructorId: string | null = null;

  try {
    const ruleId = readRequiredString(formData, "rule_id");

    const rule = await queryOne<{
      id: string;
      instructor_id: string;
      organization_id: string;
    }>(
      `
        update public.instructor_payout_rate_rules
        set is_active = false,
            disabled_at = coalesce(disabled_at, now()),
            effective_to = case
              when effective_from >= current_date then effective_from
              when effective_to is null or effective_to >= current_date then current_date - 1
              else effective_to
            end,
            updated_at = now()
        where id = $1
          and organization_id = $2
        returning id, instructor_id, organization_id
      `,
      [ruleId, membership.organizationId],
    );

    if (!rule) {
      throw new Error("Ставка не найдена");
    }

    instructorId = rule.instructor_id;

    await logAuditEvent({
      membership,
      action: "staff_payout_rate.disabled",
      entityType: "instructor_payout_rate_rule",
      entityId: rule.id,
      metadata: {
        instructor_id: rule.instructor_id,
      },
    });

    revalidatePath("/director/staff");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("disableStaffPayoutRateRuleAction:", error);
    status = "error";
  }

  redirectWithStatus(status, instructorId);
}

export async function createStaffPayoutPaymentAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "payout-paid";
  let instructorId: string | null = null;

  try {
    instructorId = readRequiredString(formData, "instructor_id");
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

    await logAuditEvent({
      membership,
      action: "staff_payout_payment.created",
      entityType: "instructor_payout_payment",
      entityId: payment.id,
      metadata: {
        instructor_id: instructorId,
        amount: payment.amount,
      },
    });

    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("createStaffPayoutPaymentAction:", error);
    status = "error";
  }

  redirectWithStatus(status, instructorId);
}

export async function backfillStaffPayoutEntriesAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "payout-backfilled";
  let instructorId: string | null = null;

  try {
    instructorId = readRequiredString(formData, "instructor_id");
    const result = await backfillInstructorPayoutEntries({
      organizationId: membership.organizationId,
      instructorId,
      createdByMemberId: membership.id,
    });

    await logAuditEvent({
      membership,
      action: "staff_payout_entries.backfilled",
      entityType: "instructor",
      entityId: instructorId,
      metadata: {
        checked_count: result.checkedCount,
        created_count: result.createdCount,
        skipped_count: result.skippedCount,
        skipped_reasons: result.skippedReasons,
      },
    });

    revalidatePath("/director/staff");
    revalidatePath("/director");
    revalidatePath("/admin");
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error("backfillStaffPayoutEntriesAction:", error);
    status = "error";
  }

  redirectWithStatus(status, instructorId);
}
