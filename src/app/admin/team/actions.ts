"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationManager } from "@/lib/organization-access";

export type CreateInstructorActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type MemberActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type CreateTeamMemberActionState = MemberActionState;

function readRequiredString(formData: FormData, field: string) {
  const value = formData.get(field);

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Поле «${field}» обязательно`);
  }

  return value.trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Не удалось выполнить операцию";
}

function validateTemporaryPassword(password: string) {
  if (password.length < 8 || password.length > 72) {
    throw new Error("Временный пароль должен содержать от 8 до 72 символов");
  }
}

async function validateInstructorSelection(
  organizationId: string,
  role: string,
  instructorId: string | null,
) {
  if (role === "instructor" && !instructorId) {
    throw new Error("Для роли instructor выберите инструктора");
  }

  if (!instructorId) {
    return;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("instructors")
    .select("id")
    .eq("id", instructorId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Выбранный инструктор не найден в текущей организации");
  }
}

function validateAssignableRole(
  managerRole: "owner" | "admin",
  role: string,
) {
  if (role !== "admin" && role !== "instructor") {
    throw new Error("Можно назначить только роль admin или instructor");
  }

  if (managerRole === "admin" && role === "admin") {
    throw new Error("Только owner может назначать роль admin");
  }
}

async function getManageableMember(
  organizationId: string,
  memberId: string,
  managerRole: "owner" | "admin",
) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("organization_members")
    .select("id, user_id, role, is_active")
    .eq("id", memberId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Участник не найден");
  }

  if (data.role === "owner") {
    throw new Error("Owner нельзя изменять на этом этапе");
  }

  if (managerRole === "admin" && data.role === "admin") {
    throw new Error("Admin не может изменять другого admin");
  }

  return data as {
    id: string;
    user_id: string;
    role: "admin" | "instructor";
    is_active: boolean;
  };
}

async function getManageableInstructor(
  organizationId: string,
  instructorId: string,
) {
  const supabase = createAdminClient();
  const { data: instructor, error } = await supabase
    .from("instructors")
    .select("id, slug, is_active, public_is_visible")
    .eq("id", instructorId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !instructor) {
    throw new Error("Профиль инструктора не найден");
  }

  const { data: ownerMember, error: ownerError } = await supabase
    .from("organization_members")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("instructor_id", instructorId)
    .eq("role", "owner")
    .maybeSingle();

  if (ownerError) {
    throw new Error(ownerError.message);
  }

  if (instructor.slug === "main-instructor" || ownerMember) {
    throw new Error("Основной профиль owner нельзя деактивировать или удалить");
  }

  return instructor as {
    id: string;
    slug: string;
    is_active: boolean;
    public_is_visible: boolean;
  };
}

export async function createInstructorAction(
  previousState: CreateInstructorActionState,
  formData: FormData,
): Promise<CreateInstructorActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const name = readRequiredString(formData, "name");
    const slug = readRequiredString(formData, "slug").toLowerCase();
    const publicName = readRequiredString(formData, "public_name");
    const capabilities = ["driving", "theory"].filter(
      (capability) => formData.get(capability) === "on",
    );
    const isActive = formData.get("is_active") === "on";
    const publicIsVisible = formData.get("public_is_visible") === "on";

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return {
        status: "error",
        message:
          "Slug может содержать только латинские буквы, цифры и дефисы",
      };
    }

    if (capabilities.length === 0) {
      return {
        status: "error",
        message: "Выберите хотя бы одно направление",
      };
    }

    const supabase = createAdminClient();
    const { data: instructor, error: instructorError } = await supabase
      .from("instructors")
      .insert({
        organization_id: manager.organizationId,
        name,
        slug,
        public_name: publicName,
        timezone: "Asia/Irkutsk",
        is_active: isActive,
        public_is_visible: publicIsVisible,
        profile_updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (instructorError || !instructor) {
      if (instructorError?.code === "23505") {
        throw new Error("Инструктор с таким slug уже существует");
      }

      throw new Error(
        instructorError?.message ?? "Не удалось создать инструктора",
      );
    }

    const { error: settingsError } = await supabase
      .from("instructor_settings")
      .insert({ instructor_id: instructor.id });

    if (settingsError) {
      await supabase.from("instructors").delete().eq("id", instructor.id);
      throw new Error(settingsError.message);
    }

    const { error: capabilitiesError } = await supabase
      .from("instructor_capabilities")
      .insert(
        capabilities.map((capability) => ({
          instructor_id: instructor.id,
          capability,
        })),
      );

    if (capabilitiesError) {
      await supabase.from("instructors").delete().eq("id", instructor.id);
      throw new Error(capabilitiesError.message);
    }

    revalidatePath("/admin/team");
    revalidatePath("/instructors");

    return {
      status: "success",
      message: "Инструктор создан",
    };
  } catch (error) {
    console.error("createInstructorAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function saveOrganizationMemberAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const email = readRequiredString(formData, "email").toLowerCase();
    const userId = readRequiredString(formData, "user_id");
    const role = readRequiredString(formData, "role");
    const instructorValue = formData.get("instructor_id");
    const instructorId =
      typeof instructorValue === "string" && instructorValue
        ? instructorValue
        : null;
    const isActive = formData.get("is_active") === "on";

    validateAssignableRole(manager.role, role);
    await validateInstructorSelection(
      manager.organizationId,
      role,
      instructorId,
    );

    const supabase = createAdminClient();
    const { data: authUserData, error: authUserError } =
      await supabase.auth.admin.getUserById(userId);

    if (authUserError || !authUserData.user) {
      return {
        status: "error",
        message: "Auth-пользователь с таким UID не найден",
      };
    }

    if (authUserData.user.email?.toLowerCase() !== email) {
      return {
        status: "error",
        message: "Email не совпадает с email Auth-пользователя",
      };
    }

    const { data: existingMember, error: existingMemberError } = await supabase
      .from("organization_members")
      .select("id, role")
      .eq("organization_id", manager.organizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (existingMemberError) {
      throw new Error(existingMemberError.message);
    }

    if (existingMember?.role === "owner") {
      return {
        status: "error",
        message: "Owner нельзя изменять на этом этапе",
      };
    }

    if (manager.role === "admin" && existingMember?.role === "admin") {
      return {
        status: "error",
        message: "Admin не может изменять другого admin",
      };
    }

    const { error } = await supabase.from("organization_members").upsert(
      {
        organization_id: manager.organizationId,
        user_id: userId,
        instructor_id: instructorId,
        role,
        is_active: isActive,
      },
      {
        onConflict: "organization_id,user_id",
      },
    );

    if (error) {
      if (error.code === "23505" && instructorId) {
        throw new Error(
          "Этот инструктор уже связан с другим пользователем",
        );
      }

      throw new Error(error.message);
    }

    revalidatePath("/admin/team");

    return {
      status: "success",
      message: existingMember ? "Доступ обновлён" : "Доступ добавлен",
    };
  } catch (error) {
    console.error("saveOrganizationMemberAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateMemberStatusAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const memberId = readRequiredString(formData, "member_id");
    const nextActive = formData.get("is_active") === "true";
    await getManageableMember(
      manager.organizationId,
      memberId,
      manager.role,
    );
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("organization_members")
      .update({ is_active: nextActive })
      .eq("id", memberId)
      .eq("organization_id", manager.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/team");

    return {
      status: "success",
      message: nextActive ? "Участник активирован" : "Участник деактивирован",
    };
  } catch (error) {
    console.error("updateMemberStatusAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function createEmployeeUserAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const email = readRequiredString(formData, "email").toLowerCase();
    const password = readRequiredString(formData, "password");
    const role = readRequiredString(formData, "role");
    const instructorValue = formData.get("instructor_id");
    const instructorId =
      typeof instructorValue === "string" && instructorValue
        ? instructorValue
        : null;
    const isActive = formData.get("is_active") === "on";

    validateTemporaryPassword(password);
    validateAssignableRole(manager.role, role);
    await validateInstructorSelection(
      manager.organizationId,
      role,
      instructorId,
    );

    const supabase = createAdminClient();
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      const message = authError?.message.toLowerCase() ?? "";

      if (
        message.includes("already") ||
        message.includes("registered") ||
        message.includes("exists")
      ) {
        throw new Error(
          "Пользователь с таким email уже существует. Используйте блок привязки по UID/email.",
        );
      }

      throw new Error(
        authError?.message ?? "Не удалось создать Auth-пользователя",
      );
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: manager.organizationId,
        user_id: authData.user.id,
        instructor_id: instructorId,
        role,
        is_active: isActive,
      });

    if (memberError) {
      await supabase.auth.admin.deleteUser(authData.user.id);

      if (memberError.code === "23505" && instructorId) {
        throw new Error(
          "Этот инструктор уже связан с другим пользователем",
        );
      }

      throw new Error(memberError.message);
    }

    revalidatePath("/admin/team");

    return {
      status: "success",
      message:
        "Пользователь создан. Сохраните временный пароль и передайте сотруднику.",
    };
  } catch (error) {
    console.error("createEmployeeUserAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function createAccessForInstructorAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const profileInstructorId = readRequiredString(
      formData,
      "instructor_id",
    );
    const email = readRequiredString(formData, "email").toLowerCase();
    const password = readRequiredString(formData, "password");
    const role = readRequiredString(formData, "role");
    const isActive = formData.get("is_active") === "on";
    const adminAlsoTeaches = formData.get("admin_also_teaches") === "on";
    const instructorId =
      role === "instructor" || (role === "admin" && adminAlsoTeaches)
        ? profileInstructorId
        : null;

    validateTemporaryPassword(password);
    validateAssignableRole(manager.role, role);
    await validateInstructorSelection(
      manager.organizationId,
      role,
      instructorId,
    );

    const supabase = createAdminClient();
    const { data: linkedMember, error: linkedMemberError } = await supabase
      .from("organization_members")
      .select("id")
      .eq("organization_id", manager.organizationId)
      .eq("instructor_id", profileInstructorId)
      .maybeSingle();

    if (linkedMemberError) {
      throw new Error(linkedMemberError.message);
    }

    if (linkedMember && instructorId) {
      throw new Error("У этого профиля уже есть доступ к платформе");
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      const message = authError?.message.toLowerCase() ?? "";

      if (
        message.includes("already") ||
        message.includes("registered") ||
        message.includes("exists")
      ) {
        throw new Error(
          "Пользователь с таким email уже существует. Используйте расширенный режим привязки по UID.",
        );
      }

      throw new Error(
        authError?.message ?? "Не удалось создать Auth-пользователя",
      );
    }

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: manager.organizationId,
        user_id: authData.user.id,
        instructor_id: instructorId,
        role,
        is_active: isActive,
      });

    if (memberError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(memberError.message);
    }

    revalidatePath("/admin/team");

    return {
      status: "success",
      message:
        "Доступ создан. Сохраните временный пароль и передайте сотруднику.",
    };
  } catch (error) {
    console.error("createAccessForInstructorAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function resetEmployeePasswordAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const memberId = readRequiredString(formData, "member_id");
    const password = readRequiredString(formData, "password");
    validateTemporaryPassword(password);

    const member = await getManageableMember(
      manager.organizationId,
      memberId,
      manager.role,
    );
    const supabase = createAdminClient();
    const { error } = await supabase.auth.admin.updateUserById(member.user_id, {
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      status: "success",
      message:
        "Пароль сброшен. Сохраните его и передайте сотруднику вручную.",
    };
  } catch (error) {
    console.error("resetEmployeePasswordAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function removeMemberAccessAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const memberId = readRequiredString(formData, "member_id");
    await getManageableMember(
      manager.organizationId,
      memberId,
      manager.role,
    );

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("id", memberId)
      .eq("organization_id", manager.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin/team");

    return {
      status: "success",
      message:
        "Доступ удалён. Auth-пользователь и профиль инструктора сохранены.",
    };
  } catch (error) {
    console.error("removeMemberAccessAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function createTeamMemberAction(
  previousState: CreateTeamMemberActionState,
  formData: FormData,
): Promise<CreateTeamMemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();
  const supabase = createAdminClient();
  let createdInstructorId: string | null = null;
  let createdAuthUserId: string | null = null;

  try {
    const role = readRequiredString(formData, "role");
    const email = readRequiredString(formData, "email").toLowerCase();
    const password = readRequiredString(formData, "temporary_password");
    const adminAlsoTeaches = formData.get("admin_also_teaches") === "on";
    const needsInstructorProfile =
      role === "instructor" || (role === "admin" && adminAlsoTeaches);
    const isActive = formData.get("is_active") === "on";

    validateAssignableRole(manager.role, role);
    validateTemporaryPassword(password);

    if (needsInstructorProfile) {
      const internalName = readRequiredString(formData, "internal_name");
      const publicName = readRequiredString(formData, "public_name");
      const slug = readRequiredString(formData, "slug").toLowerCase();
      const capabilities = ["driving", "theory"].filter(
        (capability) => formData.get(capability) === "on",
      );
      const publicIsVisible = formData.get("public_is_visible") === "on";

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error(
          "Slug может содержать только латинские буквы, цифры и дефисы",
        );
      }

      if (capabilities.length === 0) {
        throw new Error("Выберите хотя бы одно направление");
      }

      const { data: instructor, error: instructorError } = await supabase
        .from("instructors")
        .insert({
          organization_id: manager.organizationId,
          name: internalName,
          slug,
          public_name: publicName,
          timezone: "Asia/Irkutsk",
          is_active: isActive,
          public_is_visible: publicIsVisible,
          profile_updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (instructorError || !instructor) {
        if (instructorError?.code === "23505") {
          throw new Error("Инструктор с таким slug уже существует");
        }

        throw new Error(
          instructorError?.message ?? "Не удалось создать профиль инструктора",
        );
      }

      createdInstructorId = instructor.id;

      const { error: settingsError } = await supabase
        .from("instructor_settings")
        .insert({ instructor_id: createdInstructorId });

      if (settingsError) {
        throw new Error(settingsError.message);
      }

      const { error: capabilitiesError } = await supabase
        .from("instructor_capabilities")
        .insert(
          capabilities.map((capability) => ({
            instructor_id: createdInstructorId,
            capability,
          })),
        );

      if (capabilitiesError) {
        throw new Error(capabilitiesError.message);
      }
    }

    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      const message = authError?.message.toLowerCase() ?? "";

      if (
        message.includes("already") ||
        message.includes("registered") ||
        message.includes("exists")
      ) {
        throw new Error(
          "Пользователь с таким email уже существует. Используйте «Расширенный режим» для привязки существующего Auth-пользователя.",
        );
      }

      throw new Error(
        authError?.message ?? "Не удалось создать Auth-пользователя",
      );
    }

    createdAuthUserId = authData.user.id;

    const { error: memberError } = await supabase
      .from("organization_members")
      .insert({
        organization_id: manager.organizationId,
        user_id: createdAuthUserId,
        instructor_id: createdInstructorId,
        role,
        is_active: isActive,
      });

    if (memberError) {
      throw new Error(memberError.message);
    }

    revalidatePath("/admin/team");
    revalidatePath("/instructors");

    if (createdInstructorId) {
      const slugValue = formData.get("slug");
      if (typeof slugValue === "string" && slugValue.trim()) {
        revalidatePath(`/instructors/${slugValue.trim().toLowerCase()}`);
      }
    }

    return {
      status: "success",
      message:
        "Сотрудник создан. Сохраните временный пароль и передайте его сотруднику вручную.",
    };
  } catch (error) {
    console.error("createTeamMemberAction:", error);

    if (createdAuthUserId) {
      const { error: authCleanupError } =
        await supabase.auth.admin.deleteUser(createdAuthUserId);

      if (authCleanupError) {
        console.error(
          "createTeamMemberAction auth rollback:",
          authCleanupError,
        );
      }
    }

    if (createdInstructorId) {
      const { error: instructorCleanupError } = await supabase
        .from("instructors")
        .delete()
        .eq("id", createdInstructorId)
        .eq("organization_id", manager.organizationId);

      if (instructorCleanupError) {
        console.error(
          "createTeamMemberAction instructor rollback:",
          instructorCleanupError,
        );
      }
    }

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateInstructorVisibilityAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    const nextVisible = formData.get("public_is_visible") === "true";
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("instructors")
      .update({
        public_is_visible: nextVisible,
        profile_updated_at: new Date().toISOString(),
      })
      .eq("id", instructorId)
      .eq("organization_id", manager.organizationId)
      .select("slug")
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      throw new Error("Профиль инструктора не найден");
    }

    revalidatePath("/admin/team");
    revalidatePath("/instructors");
    revalidatePath(`/instructors/${data.slug}`);
    revalidatePath("/");

    return {
      status: "success",
      message: nextVisible
        ? "Профиль снова показывается публично"
        : "Профиль скрыт из публичного каталога",
    };
  } catch (error) {
    console.error("updateInstructorVisibilityAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function updateInstructorStatusAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    const nextActive = formData.get("is_active") === "true";

    if (!nextActive) {
      await getManageableInstructor(manager.organizationId, instructorId);
    }

    const supabase = createAdminClient();
    const updates: {
      is_active: boolean;
      profile_updated_at: string;
      public_is_visible?: boolean;
    } = {
      is_active: nextActive,
      profile_updated_at: new Date().toISOString(),
    };

    if (!nextActive) {
      updates.public_is_visible = false;
    }

    const { data, error } = await supabase
      .from("instructors")
      .update(updates)
      .eq("id", instructorId)
      .eq("organization_id", manager.organizationId)
      .select("slug")
      .maybeSingle();

    if (error || !data) {
      throw new Error(error?.message ?? "Профиль инструктора не найден");
    }

    revalidatePath("/admin");
    revalidatePath("/admin/team");
    revalidatePath("/");
    revalidatePath("/instructors");
    revalidatePath(`/instructors/${data.slug}`);

    return {
      status: "success",
      message: nextActive
        ? "Профиль активирован"
        : "Профиль деактивирован и скрыт публично",
    };
  } catch (error) {
    console.error("updateInstructorStatusAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function deleteInstructorProfileAction(
  previousState: MemberActionState,
  formData: FormData,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const instructorId = readRequiredString(formData, "instructor_id");
    const instructor = await getManageableInstructor(
      manager.organizationId,
      instructorId,
    );
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("instructors")
      .delete()
      .eq("id", instructorId)
      .eq("organization_id", manager.organizationId);

    if (error) {
      throw new Error(error.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/team");
    revalidatePath("/");
    revalidatePath("/instructors");
    revalidatePath(`/instructors/${instructor.slug}`);

    return {
      status: "success",
      message: "Профиль и связанное расписание удалены",
    };
  } catch (error) {
    console.error("deleteInstructorProfileAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}

export async function cleanupDemoProfilesAction(
  previousState: MemberActionState,
): Promise<MemberActionState> {
  void previousState;
  const manager = await requireOrganizationManager();

  try {
    const demoSlugs = [
      "ivanov-ivan",
      "anna-petrova",
      "demo-excel-import",
    ];
    const supabase = createAdminClient();
    const { data: instructors, error: instructorsError } = await supabase
      .from("instructors")
      .select("id, slug")
      .eq("organization_id", manager.organizationId)
      .in("slug", demoSlugs);

    if (instructorsError) {
      throw new Error(instructorsError.message);
    }

    const candidateIds = (instructors ?? []).map(
      (instructor) => instructor.id,
    );
    const { data: ownerLinks, error: ownerLinksError } =
      candidateIds.length > 0
        ? await supabase
            .from("organization_members")
            .select("instructor_id")
            .eq("organization_id", manager.organizationId)
            .eq("role", "owner")
            .in("instructor_id", candidateIds)
        : { data: [], error: null };

    if (ownerLinksError) {
      throw new Error(ownerLinksError.message);
    }

    const ownerInstructorIds = new Set(
      (ownerLinks ?? [])
        .map((member) => member.instructor_id)
        .filter((id): id is string => Boolean(id)),
    );
    const safeInstructors = (instructors ?? []).filter(
      (instructor) =>
        instructor.slug !== "main-instructor" &&
        !ownerInstructorIds.has(instructor.id),
    );
    const instructorIds = safeInstructors.map((instructor) => instructor.id);

    if (instructorIds.length === 0) {
      return {
        status: "success",
        message: "Тестовые профили не найдены",
      };
    }

    const { error: daysError } = await supabase
      .from("schedule_days")
      .delete()
      .in("instructor_id", instructorIds);

    if (daysError) {
      throw new Error(daysError.message);
    }

    const { error: profilesError } = await supabase
      .from("instructors")
      .update({
        is_active: false,
        public_is_visible: false,
        profile_updated_at: new Date().toISOString(),
      })
      .in("id", instructorIds)
      .eq("organization_id", manager.organizationId);

    if (profilesError) {
      throw new Error(profilesError.message);
    }

    const { error: accessError } = await supabase
      .from("organization_members")
      .update({ is_active: false })
      .eq("organization_id", manager.organizationId)
      .in("instructor_id", instructorIds)
      .neq("role", "owner");

    if (accessError) {
      throw new Error(accessError.message);
    }

    revalidatePath("/admin");
    revalidatePath("/admin/team");
    revalidatePath("/");
    revalidatePath("/instructors");

    return {
      status: "success",
      message: `Очищено тестовых профилей: ${instructorIds.length}. Профили сохранены, скрыты и деактивированы.`,
    };
  } catch (error) {
    console.error("cleanupDemoProfilesAction:", error);

    return {
      status: "error",
      message: getErrorMessage(error),
    };
  }
}
