import { NextResponse } from "next/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
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
  lesson_units: number | null;
  price_amount: number | null;
  paid_amount: number | null;
};

type PrepaidExportRow = {
  paid_at: string;
  student_label: string;
  source_name: string;
  lesson_type_name: string;
  access_label: string | null;
  quantity: number;
  used_quantity: number;
  final_total_amount: number;
  status: "active" | "cancelled";
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

function prepaidStatusLabel(value: PrepaidExportRow["status"]) {
  return value === "active" ? "Активна" : "Остаток закрыт";
}

export async function GET(request: Request) {
  const membership = await requireActiveOrganizationMember();

  if (membership.role !== "owner" || !membership.instructorId) {
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
             b.lesson_units,
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

  const prepaidValues: unknown[] = [
    membership.organizationId,
    membership.instructorId,
    from,
    to,
  ];
  const prepaidConditions = [
    "credits.organization_id = $1::uuid",
    "credits.instructor_id = $2::uuid",
    "credits.paid_at::date between $3::date and $4::date",
  ];

  if (isUuidValue(lessonType)) {
    prepaidValues.push(lessonType);
    prepaidConditions.push(
      `credits.lesson_type_id = $${prepaidValues.length}::uuid`,
    );
  }

  if (isUuidValue(school)) {
    prepaidValues.push(school);
    prepaidConditions.push(`credits.school_id = $${prepaidValues.length}::uuid`);
  }

  if (isUuidValue(student)) {
    prepaidValues.push(student);
    prepaidConditions.push(
      `credits.student_access_id = $${prepaidValues.length}::uuid`,
    );
  }

  if (bookingCategory === "regular" || bookingCategory === "extra" || bookingCategory === "gift") {
    prepaidValues.push(bookingCategory);
    prepaidConditions.push(
      `coalesce(packages.booking_category, 'regular') = $${prepaidValues.length}`,
    );
  }

  if (
    payment === "unpaid" ||
    lessonState === "scheduled" ||
    lessonState === "completed" ||
    lessonState === "no_show"
  ) {
    prepaidConditions.push("false");
  }

  const prepaidRows = await queryRows<PrepaidExportRow>(
    `
      select credits.paid_at::text,
             accesses.display_label as student_label,
             schools.name as source_name,
             lesson_types.name as lesson_type_name,
             case
               when packages.id is null then null
               when packages.sort_order <= 100 then 'Основной доступ'
               else 'Дополнительный доступ'
             end as access_label,
             credits.quantity,
             coalesce(usages.used_quantity, 0)::integer as used_quantity,
             credits.final_total_amount::integer,
             credits.status
      from public.student_prepaid_credits credits
      join public.student_accesses accesses on accesses.id = credits.student_access_id
      join public.schools schools on schools.id = credits.school_id
      join public.lesson_types lesson_types on lesson_types.id = credits.lesson_type_id
      left join public.student_lesson_packages packages
        on packages.id = credits.student_lesson_package_id
      left join lateral (
        select count(*)::integer as used_quantity
        from public.student_prepaid_credit_usages usages
        where usages.credit_id = credits.id
          and usages.status = 'active'
      ) usages on true
      where ${prepaidConditions.join("\n        and ")}
      order by credits.paid_at, credits.created_at, accesses.display_label
    `,
    prepaidValues,
  );

  const amount = (row: ExportRow) => row.price_amount ?? 0;
  const paid = (row: ExportRow) => row.paid_amount ?? 0;
  const lessonUnits = (row: ExportRow) => row.lesson_units ?? 1;
  const debt = (row: ExportRow) => Math.max(amount(row) - paid(row), 0);
  const completed = rows.filter((row) => row.lesson_state === "completed");
  const scheduled = rows.filter((row) => row.lesson_state === "scheduled");
  const withoutPrice = (items: ExportRow[]) => items.filter((row) => amount(row) === 0);
  const sum = (items: ExportRow[], getValue: (row: ExportRow) => number) =>
    items.reduce((total, row) => total + getValue(row), 0);
  const prepaidAvailable = (row: PrepaidExportRow) =>
    row.status === "active" ? Math.max(row.quantity - row.used_quantity, 0) : 0;
  const prepaidTotal = prepaidRows.reduce(
    (total, row) => total + row.final_total_amount,
    0,
  );

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
    ["Стоимость занятий для учеников", sum(rows, amount), sum(rows, lessonUnits)],
    ["Получено от учеников", sum(rows, paid), sum(rows.filter((row) => paid(row) > 0), lessonUnits)],
    ["Долг учеников", sum(rows, debt), sum(rows.filter((row) => debt(row) > 0), lessonUnits)],
    ["Занятия без стоимости (0 ₽)", 0, sum(withoutPrice(rows), lessonUnits)],
    [],
    ["За проведённые занятия", "Сумма, ₽", "Количество занятий"],
    ["Стоимость проведённых занятий", sum(completed, amount), sum(completed, lessonUnits)],
    ["Получено за проведённые занятия", sum(completed, paid), sum(completed.filter((row) => paid(row) > 0), lessonUnits)],
    ["Осталось получить за проведённые занятия", sum(completed, debt), sum(completed.filter((row) => debt(row) > 0), lessonUnits)],
    ["Проведённые занятия без стоимости (0 ₽)", 0, sum(withoutPrice(completed), lessonUnits)],
    [],
    ["Будущие занятия", "Сумма, ₽", "Количество занятий"],
    ["Стоимость будущих занятий", sum(scheduled, amount), sum(scheduled, lessonUnits)],
    ["Оплачено заранее", sum(scheduled, paid), sum(scheduled.filter((row) => paid(row) > 0), lessonUnits)],
    ["Не оплачено за будущие занятия", sum(scheduled, debt), sum(scheduled.filter((row) => debt(row) > 0), lessonUnits)],
    ["Будущие занятия без стоимости (0 ₽)", 0, sum(withoutPrice(scheduled), lessonUnits)],
    [],
    ["Предоплаты учеников"],
    ["Важно", "Предоплаты показаны отдельно и не меняют строки стоимости или долга по занятиям."],
    ["Внесено предоплат", prepaidTotal, prepaidRows.length],
    [
      "Дата оплаты",
      "Ученик",
      "Источник",
      "Тип занятия",
      "Доступ",
      "Оплачено занятий",
      "Использовано",
      "Доступно",
      "Сумма, ₽",
      "Статус",
    ],
    ...prepaidRows.map((row) => [
      formatDate(row.paid_at.slice(0, 10)),
      row.student_label,
      row.source_name,
      row.lesson_type_name,
      row.access_label ?? "Не указан",
      row.quantity,
      row.used_quantity,
      prepaidAvailable(row),
      row.final_total_amount,
      prepaidStatusLabel(row.status),
    ]),
    [],
    [
      "Дата",
      "Время",
      "Ученик",
      "Источник",
      "Тип занятия",
      "Категория",
      "Статус",
      "Занятий",
      "Особенность",
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
      lessonUnits(row),
      lessonUnits(row) === 2 ? "Экзаменационный маршрут" : "",
      amount(row),
      paid(row),
      debt(row),
    ]),
  ];

  const htmlRows = csvRows
    .map((row) => {
      const firstCell = row[0];
      const rowClass =
        firstCell === "Отчёт владельца-инструктора"
          ? "report-title"
          : firstCell === "Как читать отчёт" ||
              firstCell === "Общая сводка" ||
              firstCell === "За проведённые занятия" ||
              firstCell === "Будущие занятия"
            ? "section-header"
            : firstCell === "Дата оплаты" || firstCell === "Дата"
              ? "table-header"
              : "";

      return `<tr${rowClass ? ` class="${rowClass}"` : ""}>${row
          .map((value) => {
            const className = typeof value === "number" ? ' class="number"' : "";
            return `<td${className}>${htmlEscape(value)}</td>`;
          })
          .join("")}</tr>`;
    })
    .join("");
  const workbook = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; color: #18181b; }
  table { border-collapse: collapse; width: 100%; }
  td { border: 1px solid #d4d4d8; padding: 7px 9px; vertical-align: top; }
  tr.report-title td { font-size: 16px; font-weight: 700; border: 0; }
  tr.section-header td { font-weight: 700; background: #e4e4e7; }
  tr.table-header td { font-weight: 700; background: #dbeafe; }
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
