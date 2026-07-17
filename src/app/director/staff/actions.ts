"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirectorAccess } from "@/lib/director-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { createAdminClient } from "@/lib/supabase/admin";

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

function redirectWithStatus(status: string) {
  redirect(`/director/staff?invite=${encodeURIComponent(status)}`);
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
    const supabase = createAdminClient();
    const { data: invitation, error } = await supabase
      .from("staff_invitations")
      .insert({
        organization_id: membership.organizationId,
        invited_by_member_id: membership.id,
        token,
        invited_name: invitedName,
        invited_email: invitedEmail,
        invited_phone: invitedPhone,
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (error || !invitation) {
      throw new Error(error?.message ?? "Не удалось создать приглашение");
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
  } catch (error) {
    console.error("createStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

export async function approveStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "approved";

  try {
    const invitationId = readRequiredString(formData, "invitation_id");
    const supabase = createAdminClient();
    const { data: invitation, error: invitationError } = await supabase
      .from("staff_invitations")
      .select("id, organization_id, status, user_id, instructor_id")
      .eq("id", invitationId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (invitationError || !invitation) {
      throw new Error(invitationError?.message ?? "Приглашение не найдено");
    }

    if (invitation.status !== "submitted") {
      throw new Error("Подтвердить можно только отправленную заявку");
    }

    if (!invitation.user_id || !invitation.instructor_id) {
      throw new Error("В заявке нет связанного аккаунта сотрудника");
    }

    const { error: instructorError } = await supabase
      .from("instructors")
      .update({
        is_active: true,
        public_is_visible: true,
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.instructor_id)
      .eq("organization_id", membership.organizationId);

    if (instructorError) {
      throw new Error(instructorError.message);
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .update({ is_active: true })
      .eq("organization_id", membership.organizationId)
      .eq("user_id", invitation.user_id)
      .eq("instructor_id", invitation.instructor_id)
      .eq("role", "instructor");

    if (memberError) {
      throw new Error(memberError.message);
    }

    const { error: updateError } = await supabase
      .from("staff_invitations")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updateError) {
      throw new Error(updateError.message);
    }

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
  } catch (error) {
    console.error("approveStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

export async function rejectStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "rejected";

  try {
    const invitationId = readRequiredString(formData, "invitation_id");
    const supabase = createAdminClient();
    const { data: invitation, error: invitationError } = await supabase
      .from("staff_invitations")
      .select("id, organization_id, instructor_id, user_id")
      .eq("id", invitationId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (invitationError || !invitation) {
      throw new Error(invitationError?.message ?? "Приглашение не найдено");
    }

    if (invitation.instructor_id) {
      await supabase
        .from("instructors")
        .update({ is_active: false, public_is_visible: false })
        .eq("id", invitation.instructor_id)
        .eq("organization_id", membership.organizationId);
    }

    if (invitation.user_id) {
      await supabase
        .from("organization_members")
        .update({ is_active: false })
        .eq("organization_id", membership.organizationId)
        .eq("user_id", invitation.user_id);
    }

    const { error: updateError } = await supabase
      .from("staff_invitations")
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updateError) {
      throw new Error(updateError.message);
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
  } catch (error) {
    console.error("rejectStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

export async function deleteStaffInvitationAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "invitation-deleted";

  try {
    const invitationId = readRequiredString(formData, "invitation_id");
    const supabase = createAdminClient();
    const { data: invitation, error: invitationError } = await supabase
      .from("staff_invitations")
      .select("id, organization_id, status, instructor_id")
      .eq("id", invitationId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (invitationError || !invitation) {
      throw new Error(invitationError?.message ?? "Приглашение не найдено");
    }

    if (invitation.status !== "invited") {
      throw new Error("Удалить можно только активную ссылку без заявки");
    }

    if (invitation.instructor_id) {
      throw new Error("У этого приглашения уже есть сотрудник. Используйте отклонение или удаление сотрудника.");
    }

    const { error: deleteError } = await supabase
      .from("staff_invitations")
      .delete()
      .eq("id", invitation.id)
      .eq("organization_id", membership.organizationId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

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
  } catch (error) {
    console.error("deleteStaffInvitationAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

export async function updateStaffInstructorStatusAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "staff-updated";

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    const nextActive = readRequiredString(formData, "next_active") === "true";
    const supabase = createAdminClient();
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("id, role, user_id")
      .eq("organization_id", membership.organizationId)
      .eq("instructor_id", instructorId)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message);
    }

    if (member?.role === "owner") {
      throw new Error("Руководителя нельзя отключить отсюда");
    }

    const { error: instructorError } = await supabase
      .from("instructors")
      .update({
        is_active: nextActive,
        public_is_visible: nextActive,
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", instructorId)
      .eq("organization_id", membership.organizationId);

    if (instructorError) {
      throw new Error(instructorError.message);
    }

    if (member) {
      const { error: updateMemberError } = await supabase
        .from("organization_members")
        .update({ is_active: nextActive })
        .eq("id", member.id)
        .eq("organization_id", membership.organizationId);

      if (updateMemberError) {
        throw new Error(updateMemberError.message);
      }
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
  } catch (error) {
    console.error("updateStaffInstructorStatusAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}

export async function deleteStaffInstructorAction(formData: FormData) {
  const membership = await requireDirectorAccess();
  let status = "staff-deleted";

  try {
    const instructorId = readRequiredString(formData, "instructor_id");

    if (formData.get("confirm_delete") !== "yes") {
      throw new Error("Подтвердите удаление сотрудника");
    }

    const supabase = createAdminClient();
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("id, role, user_id")
      .eq("organization_id", membership.organizationId)
      .eq("instructor_id", instructorId)
      .maybeSingle();

    if (memberError) {
      throw new Error(memberError.message);
    }

    if (member?.role === "owner") {
      throw new Error("Руководителя нельзя удалить отсюда");
    }

    const staffUserId =
      typeof member?.user_id === "string" ? member.user_id : null;
    let shouldDeleteAuthUser = false;

    if (staffUserId) {
      const { count, error: membershipsCountError } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("user_id", staffUserId);

      if (membershipsCountError) {
        throw new Error(membershipsCountError.message);
      }

      shouldDeleteAuthUser = (count ?? 0) <= 1;
    }

    const { data: instructor, error: instructorError } = await supabase
      .from("instructors")
      .select("id")
      .eq("id", instructorId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();

    if (instructorError || !instructor) {
      throw new Error(instructorError?.message ?? "Сотрудник не найден");
    }

    const { error: invitationsDeleteError } = await supabase
      .from("staff_invitations")
      .delete()
      .eq("organization_id", membership.organizationId)
      .eq("instructor_id", instructorId);

    if (invitationsDeleteError) {
      throw new Error(invitationsDeleteError.message);
    }

    const { error: deleteError } = await supabase
      .from("instructors")
      .delete()
      .eq("id", instructorId)
      .eq("organization_id", membership.organizationId);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (staffUserId && shouldDeleteAuthUser) {
      const { error: authDeleteError } =
        await supabase.auth.admin.deleteUser(staffUserId);

      if (authDeleteError) {
        throw new Error(authDeleteError.message);
      }
    }

    await logAuditEvent({
      membership,
      action: "staff.deleted",
      entityType: "instructor",
      entityId: instructorId,
      metadata: {
        auth_user_deleted: Boolean(staffUserId && shouldDeleteAuthUser),
      },
    });

    revalidatePath("/director");
    revalidatePath("/director/staff");
    revalidatePath("/director/schedule");
    revalidatePath("/director/students");
    revalidatePath("/director/reports");
    revalidatePath("/admin");
  } catch (error) {
    console.error("deleteStaffInstructorAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}
