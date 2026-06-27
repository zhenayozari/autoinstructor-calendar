import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { getCurrentStudentAccess } from "@/lib/student-session";
import { StudentLoginForm } from "@/components/student/student-login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function StudentLoginPage() {
  const access = await getCurrentStudentAccess();

  if (access) {
    redirect("/student");
  }

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-8 text-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <Link
          href="/"
          className="mb-6 text-center text-sm font-semibold text-zinc-500 hover:text-zinc-950"
        >
          Автоинструктор
        </Link>

        <Card className="rounded-[2rem] shadow-xl shadow-zinc-950/5">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white">
              <KeyRound className="size-6" />
            </div>
            <CardTitle className="text-2xl">Вход ученика</CardTitle>
            <CardDescription>
              Введите логин и PIN/пароль, которые передал инструктор.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StudentLoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
