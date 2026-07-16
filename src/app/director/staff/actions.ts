"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireDirectorAccess } from "@/lib/director-auth";
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
    const { error } = await supabase.from("staff_invitations").insert({
      organization_id: membership.organizationId,
      invited_by_member_id: membership.id,
      token,
      invited_name: invitedName,
      invited_email: invitedEmail,
      invited_phone: invitedPhone,
      expires_at: expiresAt,
    });

    if (error) {
      throw new Error(error.message);
    }

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

    revalidatePath("/director/staff");
  } catch (error) {
    console.error("rejectStaffInvitationAction:", error);
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
      .select("id, role")
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

    revalidatePath("/director/staff");
    revalidatePath("/director");
  } catch (error) {
    console.error("updateStaffInstructorStatusAction:", error);
    status = "error";
  }

  redirectWithStatus(status);
}
