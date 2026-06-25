import { redirect } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();

  if (user) {
    redirect("/admin");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4 py-10">
      <Card className="w-full max-w-md shadow-xl shadow-zinc-950/5">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white">
            <CalendarClock className="size-6" />
          </div>
          <CardTitle className="text-2xl">Вход для инструктора</CardTitle>
          <CardDescription>
            Используйте аккаунт, созданный в Supabase Dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
