import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  FileClock,
  GraduationCap,
  UsersRound,
} from "lucide-react";
import { requireDirectorAccess } from "@/lib/director-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

const financeSections = [
  {
    href: "/director/reports",
    icon: UsersRound,
    title: "Расчёты с инструкторами",
    description:
      "Начисления, выплаты, возвраты от инструкторов и суммы, которые ещё нужно выдать или удержать.",
    linkLabel: "Открыть расчёты",
    tone: "border-amber-200 bg-amber-50/50",
  },
  {
    href: "/director/students",
    icon: GraduationCap,
    title: "Оплаты учеников",
    description:
      "Предоплаты, использованные занятия, остатки, корректировки и фактические возвраты ученикам.",
    linkLabel: "Открыть оплаты учеников",
    tone: "border-blue-200 bg-blue-50/50",
  },
  {
    href: "/director/audit",
    icon: FileClock,
    title: "История операций",
    description:
      "Единый журнал действий: кто и когда создал оплату, выплату, возврат или корректировку.",
    linkLabel: "Открыть журнал",
    tone: "border-zinc-200 bg-zinc-50",
  },
] as const;

type DirectorFinancesPageProps = {
  searchParams?: Promise<{ section?: string }>;
};

export default async function DirectorFinancesPage({
  searchParams,
}: DirectorFinancesPageProps) {
  await requireDirectorAccess();
  const params = (await searchParams) ?? {};
  const selectedSection =
    params.section === "student-payments" ||
    params.section === "instructor-settlements" ||
    params.section === "overview"
      ? params.section
      : null;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-zinc-900 p-2.5 text-white">
              <CircleDollarSign className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Финансовый раздел</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Финансы
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
                Здесь собраны все денежные операции школы. Выберите нужное направление,
                чтобы посмотреть подробности и выполнить действие.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-3">
          {financeSections.map(
            ({ href, icon: Icon, title, description, linkLabel, tone }) => {
              const sectionKey =
                href === "/director/students"
                  ? "student-payments"
                  : href === "/director/reports"
                    ? "instructor-settlements"
                    : "overview";

              return (
                <Card
                  key={href}
                  className={`${tone} ${selectedSection === sectionKey ? "ring-2 ring-zinc-900/20" : ""}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="size-5 text-zinc-700" />
                      <CardTitle>{title}</CardTitle>
                    </div>
                    <CardDescription className="leading-6">
                      {description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Link
                      href={href}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-900 underline decoration-zinc-400 underline-offset-4 hover:decoration-zinc-900"
                    >
                      {linkLabel}
                      <ArrowRight className="size-4" />
                    </Link>
                  </CardContent>
                </Card>
              );
            },
          )}
        </section>

        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="p-5 text-sm leading-6 text-blue-950 sm:p-6">
            <p className="font-semibold">Как пользоваться этим разделом</p>
            <p className="mt-2">
              Сначала откройте нужное направление. «Итоги» пока остаются прежним подробным
              отчётом, а «Финансы» постепенно станет удобной точкой входа во все денежные
              операции. Ничего из старого интерфейса пока не удалено.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
