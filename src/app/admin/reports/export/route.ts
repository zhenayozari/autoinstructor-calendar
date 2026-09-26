import { NextResponse } from "next/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";

type ExportRow = {
  date: string;
  start_time: string;
  end_time: string;
  student_label: string;
  source_name: string;
  lesson_type_name: string;
  booking_category: string;
  lesson_state: string;
  price_amount: number | null;
  paid_amount: number | null;
};

function isDateValue(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isUuidValue(value: string | null) {
  return Boolean(value && /^[0-9a-f-]{36}$/i.test(value));
}

function htmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function formatTime(value: string) {
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function stateLabel(value: string) {
  if (value === "completed") return "Проведено";
  if (value === "scheduled") return "Запланировано";
  if (value === "no_show") return "Неявка";
  return value;
}

function categoryLabel(value: string) {
  if (value === "regular") return "Обычное";
  if (value === "extra") return "Дополнительное";
  if (value === "gift") return "Подарочное";
  return value;
}

export async function GET(request: Request) {
  const membership = await requireActiveOrganizationMember();

  if (!isPostgresBackend() || membership.role !== "owner" || !membership.instructorId) {
    return new NextResponse("Экспорт доступен только владельцу-инструктору", {
      status: 403,
    });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!isDateValue(from) || !isDateValue(to)) {
    return new NextResponse("Неверный период отчёта", { status: 400 });
  }

  const values: unknown[] = [
    membership.instructorId,
    from,
    to,
  ];
  const conditions = [
    "s.instructor_id = $1::uuid",
    "sd.date between $2::date and $3::date",
    "s.status <> 'cancelled'",
    "b.status = 'confirmed'",
  ];

  const lessonType = url.searchParams.get("lessonType");
  if (isUuidValue(lessonType)) {
    values.push(lessonType);
    conditions.push(`s.lesson_type_id = $${values.length}::uuid`);
  }

  const school = url.searchParams.get("school");
  if (isUuidValue(school)) {
    values.push(school);
    conditions.push(`coalesce(b.school_id, access.school_id) = $${values.length}::uuid`);
  }

  const student = url.searchParams.get("student");
  if (isUuidValue(student)) {
    values.push(student);
    conditions.push(`b.student_access_id = $${values.length}::uuid`);
  }

  const payment = url.searchParams.get("payment");
  if (payment === "paid") {
    conditions.push("coalesce(b.paid_amount, 0) > 0");
  } else if (payment === "unpaid") {
    conditions.push("greatest(coalesce(b.price_amount, 0) - coalesce(b.paid_amount, 0), 0) > 0");
  }

  const lessonState = url.searchParams.get("lessonState");
  if (lessonState === "scheduled" || lessonState === "completed" || lessonState === "no_show") {
    values.push(lessonState);
    conditions.push(`b.lesson_state = $${values.length}`);
  }

  const bookingCategory = url.searchParams.get("bookingCategory");
  if (bookingCategory === "regular" || bookingCategory === "extra" || bookingCategory === "gift") {
    values.push(bookingCategory);
    conditions.push(`b.booking_category = $${values.length}`);
  }

  const rows = await queryRows<ExportRow>(
    `
      select sd.date::text as date,
             s.start_time::text as start_time,
             s.end_time::text as end_time,
             b.student_label,
             coalesce(source.name, 'Частные занятия') as source_name,
             coalesce(lesson_type.name, 'Не указан') as lesson_type_name,
             b.booking_category,
             b.lesson_state,
             b.price_amount,
             b.paid_amount
      from public.schedule_days sd
      join public.slots s on s.schedule_day_id = sd.id
      join public.bookings b on b.slot_id = s.id
      left join public.student_accesses access on access.id = b.student_access_id
      left join public.schools source
        on source.id = coalesce(b.school_id, access.school_id)
      left join public.lesson_types lesson_type on lesson_type.id = s.lesson_type_id
      where ${conditions.join("\n        and ")}
      order by sd.date, s.start_time, b.student_label
    `,
    values,
  );

  const amount = (row: ExportRow) => row.price_amount ?? 0;
  const paid = (row: ExportRow) => row.paid_amount ?? 0;
  const debt = (row: ExportRow) => Math.max(amount(row) - paid(row), 0);
  const completed = rows.filter((row) => row.lesson_state === "completed");
  const scheduled = rows.filter((row) => row.lesson_state === "scheduled");
  const withoutPrice = (items: ExportRow[]) => items.filter((row) => amount(row) === 0);
  const sum = (items: ExportRow[], getValue: (row: ExportRow) => number) =>
    items.reduce((total, row) => total + getValue(row), 0);

  const csvRows: (string | number)[][] = [
    ["Отчёт владельца-инструктора"],
    ["Период", `${formatDate(from)} — ${formatDate(to)}`],
    [],
    ["Как читать отчёт"],
    ["Деньги в отчёте", "Это расчёты с учениками, а не выплаты инструкторам."],
    ["Долг учеников", "Стоимость занятий минус уже полученная оплата."],
    ["Важно", "Будущие неоплаченные занятия показываются отдельно и входят в общий долг."],
    [],
    ["Общая сводка", "Сумма, ₽", "Количество занятий"],
    ["Стоимость занятий для учеников", sum(rows, amount), rows.length],
    ["Получено от учеников", sum(rows, paid), rows.filter((row) => paid(row) > 0).length],
    ["Долг учеников", sum(rows, debt), rows.filter((row) => debt(row) > 0).length],
    ["Занятия без стоимости (0 ₽)", 0, withoutPrice(rows).length],
    [],
    ["За проведённые занятия", "Сумма, ₽", "Количество занятий"],
    ["Стоимость проведённых занятий", sum(completed, amount), completed.length],
    ["Получено за проведённые занятия", sum(completed, paid), completed.filter((row) => paid(row) > 0).length],
    ["Осталось получить за проведённые занятия", sum(completed, debt), completed.filter((row) => debt(row) > 0).length],
    ["Проведённые занятия без стоимости (0 ₽)", 0, withoutPrice(completed).length],
    [],
    ["Будущие занятия", "Сумма, ₽", "Количество занятий"],
    ["Стоимость будущих занятий", sum(scheduled, amount), scheduled.length],
    ["Оплачено заранее", sum(scheduled, paid), scheduled.filter((row) => paid(row) > 0).length],
    ["Не оплачено за будущие занятия", sum(scheduled, debt), scheduled.filter((row) => debt(row) > 0).length],
    ["Будущие занятия без стоимости (0 ₽)", 0, withoutPrice(scheduled).length],
    [],
    [
      "Дата",
      "Время",
      "Ученик",
      "Источник",
      "Тип занятия",
      "Категория",
      "Статус",
      "Стоимость, ₽",
      "Получено, ₽",
      "Долг ученика, ₽",
    ],
    ...rows.map((row) => [
      formatDate(row.date),
      `${formatTime(row.start_time)} — ${formatTime(row.end_time)}`,
      row.student_label,
      row.source_name,
      row.lesson_type_name,
      categoryLabel(row.booking_category),
      stateLabel(row.lesson_state),
      amount(row),
      paid(row),
      debt(row),
    ]),
  ];

  const htmlRows = csvRows
    .map(
      (row) =>
        `<tr>${row
          .map((value) => {
            const className = typeof value === "number" ? ' class="number"' : "";
            return `<td${className}>${htmlEscape(value)}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("");
  const workbook = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #18181b; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #d4d4d8; padding: 7px 9px; vertical-align: top; }
  tr:nth-child(1) td { font-size: 16px; font-weight: 700; border: 0; }
  tr:nth-child(4) td, tr:nth-child(9) td, tr:nth-child(15) td, tr:nth-child(21) td { font-weight: 700; background: #e4e4e7; }
  tr:nth-child(27) td { font-weight: 700; background: #dbeafe; }
  .number { mso-number-format: "#,##0"; text-align: right; }
</style>
</head>
<body><table>${htmlRows}</table></body>
</html>`;
  const filename = `otchet-vladeltsa-instruktora-${from}-${to}.xls`;

  return new NextResponse(workbook, {
    headers: {
      "Content-Type": "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
