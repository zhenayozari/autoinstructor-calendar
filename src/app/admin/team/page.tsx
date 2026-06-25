import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  KeyRound,
  Settings2,
  UserRoundCog,
  UserRoundPlus,
  UsersRound,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrganizationManager } from "@/lib/organization-access";
import { CreateTeamMemberForm } from "@/components/admin/create-team-member-form";
import { CreateProfileAccessForm } from "@/components/admin/create-profile-access-form";
import { CleanupDemoProfilesAction } from "@/components/admin/cleanup-demo-profiles-action";
import { InstructorProfileActions } from "@/components/admin/instructor-profile-actions";
import { InstructorVisibilityAction } from "@/components/admin/instructor-visibility-action";
import { MemberAccessForm } from "@/components/admin/member-access-form";
import { MemberStatusAction } from "@/components/admin/member-status-action";
import { RemoveMemberAccessAction } from "@/components/admin/remove-member-access-action";
import { ResetPasswordForm } from "@/components/admin/reset-password-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

type TeamMember = {
  id: string;
  user_id: string;
  instructor_id: string | null;
  role: "owner" | "admin" | "instructor";
  is_active: boolean;
  created_at: string;
};

type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
  is_active: boolean;
  public_is_visible: boolean;
};

type Capability = "driving" | "theory";

type CapabilityRow = {
  instructor_id: string;
  capability: Capability;
};

type TeamCard = {
  key: string;
  member: TeamMember | null;
  instructor: Instructor | null;
};

const roleLabels = {
  owner: "Владелец",
  admin: "Администратор",
  instructor: "Инструктор",
};

const capabilityLabels = {
  driving: "Вождение",
  theory: "Теория",
};

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Irkutsk",
  }).format(new Date(value));
}

export default async function TeamPage() {
  const manager = await requireOrganizationManager();
  const supabase = createAdminClient();
  const [
    { data: memberData, error: memberError },
    { data: instructorData, error: instructorError },
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("id, user_id, instructor_id, role, is_active, created_at")
      .eq("organization_id", manager.organizationId)
      .order("created_at"),
    supabase
      .from("instructors")
      .select("id, name, slug, public_name, is_active, public_is_visible")
      .eq("organization_id", manager.organizationId)
      .order("name"),
  ]);

  const members = (memberData ?? []) as TeamMember[];
  const instructors = (instructorData ?? []) as Instructor[];
  const instructorIds = instructors.map((instructor) => instructor.id);
  const [{ data: capabilityData, error: capabilityError }, usersResult] =
    await Promise.all([
      instructorIds.length > 0
        ? supabase
            .from("instructor_capabilities")
            .select("instructor_id, capability")
            .in("instructor_id", instructorIds)
        : Promise.resolve({ data: [], error: null }),
      supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

  const loadError =
    memberError ?? instructorError ?? capabilityError ?? usersResult.error;
  const capabilities = (capabilityData ?? []) as CapabilityRow[];
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const emailsByUserId = new Map(
    (usersResult.data?.users ?? []).map((user) => [
      user.id,
      user.email ?? "Email не указан",
    ]),
  );
  const capabilitiesByInstructor = new Map<string, Capability[]>();

  for (const row of capabilities) {
    const current = capabilitiesByInstructor.get(row.instructor_id) ?? [];
    current.push(row.capability);
    capabilitiesByInstructor.set(row.instructor_id, current);
  }

  const linkedInstructorIds = new Set(
    members
      .map((member) => member.instructor_id)
      .filter((id): id is string => Boolean(id)),
  );
  const teamCards: TeamCard[] = [
    ...members.map((member) => ({
      key: `member-${member.id}`,
      member,
      instructor: member.instructor_id
        ? (instructorsById.get(member.instructor_id) ?? null)
        : null,
    })),
    ...instructors
      .filter((instructor) => !linkedInstructorIds.has(instructor.id))
      .map((instructor) => ({
        key: `instructor-${instructor.id}`,
        member: null,
        instructor,
      })),
  ];

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Управление организацией
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Команда
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Создавайте профиль сотрудника и доступ к платформе одним
              действием.
            </p>
          </div>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/admin" />}
          >
            <ArrowLeft />
            Вернуться в админку
          </Button>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-4 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-zinc-100">
                <UserRoundPlus className="size-5" />
              </div>
              <div>
                <CardTitle>Добавить инструктора / сотрудника</CardTitle>
                <CardDescription>
                  Для инструктора профиль и доступ создаются вместе.
                  Администратор может работать без публичного профиля.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <CreateTeamMemberForm currentRole={manager.role} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-zinc-100">
                <UsersRound className="size-5" />
              </div>
              <div>
                <CardTitle>Команда</CardTitle>
                <CardDescription>
                  Профили, роли и доступ сотрудников собраны в одном месте.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {teamCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-5 py-12 text-center">
                <p className="font-medium">В команде пока никого нет</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  Добавьте первого сотрудника с помощью формы выше.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {teamCards.map(({ key, member, instructor }) => {
                  const instructorCapabilities = instructor
                    ? (capabilitiesByInstructor.get(instructor.id) ?? [])
                    : [];
                  const displayName =
                    instructor?.public_name ??
                    instructor?.name ??
                    (member
                      ? emailsByUserId.get(member.user_id)
                      : "Сотрудник");
                  const email = member
                    ? (emailsByUserId.get(member.user_id) ??
                      "Auth-пользователь не найден")
                    : null;
                  const canManageMember =
                    member?.role !== "owner" &&
                    (manager.role === "owner" ||
                      member?.role === "instructor");

                  return (
                    <article
                      key={key}
                      className="flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm"
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold">
                            {displayName}
                          </h3>
                          {instructor?.public_name &&
                            instructor.public_name !== instructor.name && (
                              <p className="text-muted-foreground mt-1 text-sm">
                                {instructor.name}
                              </p>
                            )}
                          <p className="text-muted-foreground mt-2 text-sm">
                            {email ?? "Доступ к платформе ещё не создан"}
                          </p>
                        </div>

                        {member ? (
                          <Badge variant="secondary">
                            {roleLabels[member.role]}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Профиль без доступа</Badge>
                        )}
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {instructorCapabilities.map((capability) => (
                          <Badge key={capability} variant="secondary">
                            {capabilityLabels[capability]}
                          </Badge>
                        ))}

                        <Badge
                          className={
                            member?.is_active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-100 text-zinc-600"
                          }
                        >
                          {member
                            ? member.is_active
                              ? "Доступ активен"
                              : "Доступ отключён"
                            : "Доступ не создан"}
                        </Badge>

                        {instructor && (
                          <Badge
                            className={
                              instructor.public_is_visible
                                ? "bg-blue-100 text-blue-800"
                                : "bg-zinc-100 text-zinc-600"
                            }
                          >
                            {instructor.public_is_visible
                              ? "Публичный профиль"
                              : "Профиль скрыт"}
                          </Badge>
                        )}

                        {instructor && (
                          <Badge
                            className={
                              instructor.is_active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-700"
                            }
                          >
                            {instructor.is_active
                              ? "Профиль активен"
                              : "Профиль деактивирован"}
                          </Badge>
                        )}
                      </div>

                      {member && (
                        <p className="text-muted-foreground mt-4 text-xs">
                          Добавлен: {formatCreatedAt(member.created_at)}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap gap-2 pt-5">
                        {instructor ? (
                          <Button
                            variant="outline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                href={`/admin/profile?instructor=${instructor.id}`}
                              />
                            }
                          >
                            <UserRoundCog />
                            Редактировать профиль
                          </Button>
                        ) : null}

                        {instructor && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              nativeButton={false}
                              render={
                                <Link
                                  href={`/instructors/${instructor.slug}`}
                                  target="_blank"
                                />
                              }
                            >
                              <ExternalLink />
                              Публичная страница
                            </Button>
                            <InstructorVisibilityAction
                              instructorId={instructor.id}
                              isVisible={instructor.public_is_visible}
                            />
                          </>
                        )}

                        {!member && instructor && (
                          <CreateProfileAccessForm
                            instructorId={instructor.id}
                            currentRole={manager.role}
                          />
                        )}
                      </div>

                      {member && canManageMember && (
                        <div className="mt-4 space-y-3 border-t pt-4">
                          <ResetPasswordForm memberId={member.id} />
                          <MemberStatusAction
                            memberId={member.id}
                            isActive={member.is_active}
                          />
                          <RemoveMemberAccessAction memberId={member.id} />
                        </div>
                      )}

                      {instructor && (
                        <div className="mt-4 border-t pt-4">
                          <InstructorProfileActions
                            instructorId={instructor.id}
                            isActive={instructor.is_active}
                            protectedProfile={
                              instructor.slug === "main-instructor" ||
                              member?.role === "owner"
                            }
                          />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <CleanupDemoProfilesAction />

        <details className="group rounded-2xl border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5">
            <span className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-zinc-100">
                <Settings2 className="size-5" />
              </span>
              <span>
                <span className="block font-semibold">Расширенный режим</span>
                <span className="text-muted-foreground mt-1 block text-sm">
                  Ручная привязка уже созданного Auth-пользователя по UID.
                </span>
              </span>
            </span>
            <KeyRound className="text-muted-foreground size-5 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t px-6 py-6">
            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              Используйте этот режим, только если пользователь уже создан
              вручную в Supabase Authentication.
            </div>
            <MemberAccessForm
              instructors={instructors.map(
                ({ id, name, public_name }) => ({
                  id,
                  name,
                  public_name,
                }),
              )}
              currentRole={manager.role}
            />
          </div>
        </details>
      </div>
    </main>
  );
}
