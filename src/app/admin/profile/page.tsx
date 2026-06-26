import Link from "next/link";
import { ArrowLeft, UserRoundPen } from "lucide-react";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
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

type InstructorProfile = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
  photo_url: string | null;
  short_bio: string | null;
  contact_text: string | null;
  car_description: string | null;
  experience_text: string | null;
  public_is_visible: boolean;
  profile_updated_at: string | null;
};

type SearchParams = Promise<{
  instructor?: string | string[];
}>;

function formatUpdatedAt(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Irkutsk",
  }).format(new Date(value));
}

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
      : null;
  const selectedInstructorId = membership.isInstructor
    ? membership.instructorId
    : requestedInstructorId &&
        instructors.some(
          (instructor) => instructor.id === requestedInstructorId,
        )
      ? requestedInstructorId
      : defaultInstructorId;
  const profile =
    instructors.find(
      (instructor) => instructor.id === selectedInstructorId,
    ) ?? null;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 pb-24 pt-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <AdminMobileNav
          role={membership.role}
          email={membership.user.email}
          instructorName={profile?.public_name ?? profile?.name}
          showTeam={membership.isOwnerOrAdmin}
        />

        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Настройки инструктора
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              Публичный профиль
            </h1>
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

        {membership.isOwnerOrAdmin && (
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
                  className="border-input bg-background h-10 flex-1 rounded-lg border px-3 text-sm"
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
