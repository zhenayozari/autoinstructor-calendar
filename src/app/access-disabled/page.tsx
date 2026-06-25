import { ShieldOff } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AccessDisabledPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-zinc-100 px-4 py-10">
      <Card className="w-full max-w-md text-center shadow-xl shadow-zinc-950/5">
        <CardHeader>
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-red-100 text-red-700">
            <ShieldOff className="size-6" />
          </div>
          <CardTitle className="text-2xl">Доступ отключён</CardTitle>
          <CardDescription>
            Ваш аккаунт существует, но доступ к административной панели
            деактивирован. Обратитесь к owner или admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutAction}>
            <Button type="submit" className="w-full">
              Выйти
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
