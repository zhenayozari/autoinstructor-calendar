import Link from "next/link";
import { UserPlus } from "lucide-react";
import { StaffRegistrationForm } from "@/components/staff/staff-registration-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import type { StaffInvitation } from "@/lib/types";

export const dynamic = "force-dynamic";

type StaffRegisterPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

type InvitationView = Pick<
  StaffInvitation,
  | "token"
  | "status"
  | "invited_name"
  | "invited_email"
  | "invited_phone"
  | "expires_at"
> & {
  organizations: {
    name: string;
  } | null;
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
          href="/login"
          className="block rounded-xl border px-4 py-3 text-center text-sm font-semibold hover:bg-zinc-50"
        >
          Перейти ко входу
        </Link>
      </CardContent>
    </Card>
  );
}

export default async function StaffRegisterPage({
  searchParams,
}: StaffRegisterPageProps) {
  const params = await searchParams;
  const token = params?.token?.trim();

  let invitation: InvitationView | null = null;
  let loadError: string | null = null;

  if (!hasSupabaseAdminKey()) {
    loadError = "Регистрация сотрудников временно недоступна.";
  } else if (!token) {
    loadError = "Ссылка приглашения неполная.";
  } else {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("staff_invitations")
      .select(
        "token, status, invited_name, invited_email, invited_phone, expires_at, organizations(name)",
      )
      .eq("token", token)
      .maybeSingle();

    if (error) {
      loadError = error.message;
    } else {
      invitation = data as InvitationView | null;
    }
  }

  const nowIso = new Date().toISOString();
  const isExpired = invitation ? invitation.expires_at < nowIso : false;

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-8 text-zinc-950">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-lg flex-col justify-center">
        <Link
          href="/login"
          className="mb-6 text-center text-sm font-semibold text-zinc-500 hover:text-zinc-950"
        >
          Уже есть доступ? Войти
        </Link>

        {loadError ? (
          <MessageCard title="Приглашение недоступно" description={loadError} />
        ) : !invitation ? (
          <MessageCard
            title="Приглашение не найдено"
            description="Попросите руководителя отправить новую ссылку."
          />
        ) : invitation.status === "submitted" ? (
          <MessageCard
            title="Заявка уже отправлена"
            description="Руководитель увидит её в кабинете и подтвердит доступ."
          />
        ) : invitation.status === "approved" ? (
          <MessageCard
            title="Доступ подтверждён"
            description="Можно войти в кабинет инструктора с эл. почтой и паролем."
          />
        ) : invitation.status !== "invited" || isExpired ? (
          <MessageCard
            title="Ссылка не активна"
            description="Попросите руководителя создать новое приглашение."
          />
        ) : (
          <Card className="rounded-[2rem] shadow-xl shadow-zinc-950/5">
            <CardHeader className="text-center">
              <div className="mx-auto mb-2 grid size-12 place-items-center rounded-2xl bg-zinc-950 text-white">
                <UserPlus className="size-6" />
              </div>
              <CardTitle className="text-2xl">Заявка сотрудника</CardTitle>
              <CardDescription>
                {invitation.organizations?.name
                  ? `${invitation.organizations.name}: заполните данные для кабинета инструктора.`
                  : "Заполните данные для кабинета инструктора."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StaffRegistrationForm
                token={invitation.token}
                defaultName={invitation.invited_name}
                defaultEmail={invitation.invited_email}
                defaultPhone={invitation.invited_phone}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
