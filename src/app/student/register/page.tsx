import Link from "next/link";
import { UserPlus } from "lucide-react";
import { StudentRegistrationForm } from "@/components/student/student-registration-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type StudentRegisterPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

type RegistrationInstructorView = {
  id: string;
  name: string;
  public_name: string | null;
  is_active: boolean;
};

function MessageCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card className="rounded-[2rem] shadow-xl shadow-zinc-950/5">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white">
          <UserPlus className="size-6" />
        </div>
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link
          href="/student/login"
          className="block rounded-xl border px-4 py-3 text-center text-sm font-semibold hover:bg-zinc-50"
        >
          Перейти ко входу
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function StudentRegisterPage({
  searchParams,
}: StudentRegisterPageProps) {
  const params = await searchParams;
  const token = params?.token?.trim();
  let instructor: RegistrationInstructorView | null = null;
  let loadError: string | null = null;

  if (!hasSupabaseAdminKey()) {
    loadError = "Регистрация сейчас недоступна.";
  } else if (!token) {
    loadError = "Ссылка регистрации неполная.";
  } else {
    const supabase = createAdminClient();
    const { data: settings, error: settingsError } = await supabase
      .from("instructor_settings")
      .select("instructor_id, student_registration_enabled")
      .eq("student_registration_token", token)
      .maybeSingle();

    if (settingsError) {
      loadError = settingsError.message;
    } else if (!settings?.student_registration_enabled) {
      loadError = "Ссылка регистрации недоступна.";
    } else {
      const { data, error } = await supabase
        .from("instructors")
        .select("id, name, public_name, is_active")
        .eq("id", settings.instructor_id)
        .maybeSingle();

      if (error) {
        loadError = error.message;
      } else {
        instructor = data as RegistrationInstructorView | null;
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-8 text-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col justify-center">
        <Link
          href="/student/login"
          className="mb-6 text-center text-sm font-semibold text-zinc-500 hover:text-zinc-950"
        >
          Уже есть доступ? Войти
        </Link>

        {loadError ? (
          <MessageCard title="Регистрация недоступна" description={loadError} />
        ) : !token || !instructor?.is_active ? (
          <MessageCard
            title="Ссылка не активна"
            description="Попросите инструктора отправить новую ссылку регистрации."
          />
        ) : (
          <Card className="rounded-[2rem] shadow-xl shadow-zinc-950/5">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white">
                <UserPlus className="size-6" />
              </div>
              <CardTitle className="text-2xl">Заявка ученика</CardTitle>
              <CardDescription>
                Заполните данные и придумайте логин с ПИН-кодом. Доступ появится
                после подтверждения инструктором.
              </CardDescription>
              <p className="pt-1 text-sm font-semibold text-zinc-500">
                Инструктор: {instructor.public_name ?? instructor.name}
              </p>
            </CardHeader>
            <CardContent>
              <StudentRegistrationForm token={token} />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
