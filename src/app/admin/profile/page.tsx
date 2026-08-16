import { UserRoundPen } from "lucide-react";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { formatUpdatedAt, selectClassName } from "@/lib/formatters";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { InstructorProfile } from "@/lib/types";
import { ProfileForm } from "@/components/admin/profile-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  instructor?: string | string[];
}>;

export default async function InstructorProfilePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const membership = await requireActiveOrganizationMember();
  const params = await searchParams;
  const requestedInstructorId = Array.isArray(params.instructor)
    ? params.instructor[0]
    : params.instructor;
  void requestedInstructorId;

  const supabase = createAdminClient();
  let instructorsQuery = supabase
    .from("instructors")
    .select(
      "id, name, slug, public_name, photo_url, short_bio, contact_text, car_description, experience_text, public_is_visible, profile_updated_at",
    )
    .eq("organization_id", membership.organizationId)
    .order("name");

  if (membership.isInstructor) {
    instructorsQuery = instructorsQuery.eq("id", membership.instructorId!);
  }

  const { data, error } = await instructorsQuery;
  const instructors = (data ?? []) as InstructorProfile[];
  const defaultInstructorId =
    membership.instructorId &&
    instructors.some((instructor) => instructor.id === membership.instructorId)
      ? membership.instructorId
      : instructors[0]?.id ?? null;
  const selectedInstructorId = defaultInstructorId;
  const profile =
    instructors.find(
      (instructor) => instructor.id === selectedInstructorId,
    ) ?? null;

  return (
    <main className="px-4 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Настройки инструктора
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Публичный профиль
            </h1>
          </div>
        </header>

        {false && membership.isOwnerOrAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Выберите профиль</CardTitle>
              <CardDescription>
                Редактируется только явно выбранный инструктор.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form method="get" className="flex flex-col gap-3 sm:flex-row">
                <select
                  name="instructor"
                  defaultValue={selectedInstructorId ?? ""}
                  className={selectClassName}
                  required
                >
                  <option value="" disabled>
                    Выберите инструктора
                  </option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.public_name ?? instructor.name} /{" "}
                      {instructor.slug}
                    </option>
                  ))}
                </select>
                <Button type="submit">Открыть профиль</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-zinc-100">
                <UserRoundPen className="size-5" />
              </div>
              <div>
                <CardTitle>Данные профиля</CardTitle>
                <CardDescription>
                  {profile?.profile_updated_at
                    ? `Последнее обновление: ${formatUpdatedAt(
                        profile.profile_updated_at,
                        DEFAULT_TIMEZONE,
                      )}`
                    : "Профиль ещё не обновлялся"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {error || !profile ? (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                Не удалось загрузить профиль:{" "}
                {error?.message ??
                  "выберите инструктора, профиль которого нужно редактировать"}
              </div>
            ) : (
              <ProfileForm
                key={profile.id}
                instructorId={profile.id}
                profile={profile}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
