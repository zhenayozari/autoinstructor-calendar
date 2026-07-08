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

export const dynamic = "force-dynamic";

export default function StudentRegisterPage() {
  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-8 text-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col justify-center">
        <Link
          href="/student/login"
          className="mb-6 text-center text-sm font-semibold text-zinc-500 hover:text-zinc-950"
        >
          Уже есть доступ? Войти
        </Link>

        <Card className="rounded-[2rem] shadow-xl shadow-zinc-950/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white">
              <UserPlus className="size-6" />
            </div>
            <CardTitle className="text-2xl">Заявка ученика</CardTitle>
            <CardDescription>
              Заполните данные и придумайте логин с PIN. Доступ появится после
              подтверждения инструктором.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentRegistrationForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
