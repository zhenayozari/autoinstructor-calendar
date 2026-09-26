import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import { requireDirectorAccess } from "@/lib/director-auth";

export const runtime = "nodejs";

type ExportInstructor = {
  id: string;
  name: string;
};

type LessonRow = {
  instructor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  student_label: string;
  school_name: string;
  lesson_type_name: string;
  lesson_state: string;
  price_amount: number | null;
  paid_amount: number | null;
};

type PayoutRow = {
  instructor_id: string;
  event_at: string;
  student_label: string;
  school_name: string;
  lesson_type_name: string;
  entry_type: string;
  amount: number;
  paid_amount: number;
  returned_amount: number;
  remaining_amount: number;
  note: string | null;
};

type MoneyOperationRow = {
  instructor_id: string;
  operation_at: string;
  operation_type: "payment" | "return";
  amount: number;
  note: string | null;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEADER_FILL = "FFDBEAFE";
const SECTION_FILL = "FFE4E4E7";
const TITLE_FILL = "FF172554";
const MONEY_FORMAT = '#,##0 "₽"';

function formatDate(value: string) {
  const date = value.slice(0, 10).split("-");
  return date.length === 3 ? `${date[2]}.${date[1]}.${date[0]}` : value;
}

function formatTime(value: string) {
  const match = value.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : value;
}

function lessonStateLabel(value: string) {
  if (value === "completed") return "Проведено";
  if (value === "scheduled") return "Запланировано";
  if (value === "no_show") return "Неявка";
  return value;
}

function payoutTypeLabel(value: string) {
  if (value === "booking_accrual") return "Начисление за занятие";
  if (value === "prepaid_credit_accrual") return "Начисление по предоплате";
  if (value === "cancellation_adjustment") return "Корректировка после отмены";
  if (value === "no_show_adjustment") return "Корректировка неявки";
  if (value === "manual_adjustment") return "Ручная корректировка";
  return value;
}

function payoutNoteLabel(value: string | null) {
  if (!value) return "";
  if (value === "Booking was cancelled") return "Запись была отменена";
  return value;
}

function safeSheetName(name: string, usedNames: Set<string>) {
  const base = name.replace(/[\\/*?:[\]]/g, " ").replace(/\s+/g, " ").trim() || "Инструктор";
  let candidate = base.slice(0, 31);
  let suffix = 2;

  while (usedNames.has(candidate.toLocaleLowerCase("ru-RU"))) {
    const tail = ` (${suffix})`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }

  usedNames.add(candidate.toLocaleLowerCase("ru-RU"));
  return candidate;
}

function addSectionTitle(worksheet: ExcelJS.Worksheet, title: string) {
  const row = worksheet.addRow([title]);
  worksheet.mergeCells(row.number, 1, row.number, 10);
  row.font = { bold: true, size: 12 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SECTION_FILL } };
  row.alignment = { vertical: "middle" };
  row.height = 22;
}

function addTableHeader(worksheet: ExcelJS.Worksheet, values: string[]) {
  const row = worksheet.addRow(values);
  row.font = { bold: true, color: { argb: "FF172554" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  row.alignment = { vertical: "middle", wrapText: true };
  row.height = 30;
  row.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFBFDBFE" } },
      bottom: { style: "thin", color: { argb: "FFBFDBFE" } },
    };
  });
}

function styleMoneyCells(row: ExcelJS.Row, columns: number[]) {
  for (const column of columns) {
    row.getCell(column).numFmt = MONEY_FORMAT;
  }
}

export async function GET(request: Request) {
  const membership = await requireDirectorAccess();

  if (!isPostgresBackend()) {
    return new NextResponse("Экспорт доступен только в PostgreSQL-режиме", {
      status: 400,
    });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const requestedInstructor = url.searchParams.get("instructor");

  if (!from || !to || !DATE_PATTERN.test(from) || !DATE_PATTERN.test(to)) {
    return new NextResponse("Неверный период отчёта", { status: 400 });
  }

  const instructorValues: unknown[] = [membership.organizationId];
  let instructorCondition = "";
  if (requestedInstructor && requestedInstructor !== "all") {
    if (!UUID_PATTERN.test(requestedInstructor)) {
      return new NextResponse("Неверный инструктор", { status: 400 });
    }
    instructorValues.push(requestedInstructor);
    instructorCondition = "and instructors.id = $2::uuid";
  }

  const instructors = await queryRows<ExportInstructor>(
    `
      select instructors.id::text,
             coalesce(instructors.public_name, instructors.name) as name
      from public.instructors instructors
      where instructors.organization_id = $1
        ${instructorCondition}
      order by coalesce(instructors.public_name, instructors.name), instructors.id
    `,
    instructorValues,
  );

  if (instructors.length === 0) {
    return new NextResponse("Инструкторы не найдены", { status: 404 });
  }

  const instructorIds = instructors.map((instructor) => instructor.id);
  const [lessons, payouts, operations] = await Promise.all([
    queryRows<LessonRow>(
      `
        select slots.instructor_id::text,
               days.date::text,
               slots.start_time::text,
               slots.end_time::text,
               bookings.student_label,
               coalesce(schools.name, 'Без источника') as school_name,
               coalesce(lesson_types.name, 'Тип не указан') as lesson_type_name,
               bookings.lesson_state,
               bookings.price_amount,
               bookings.paid_amount
        from public.schedule_days days
        join public.slots slots on slots.schedule_day_id = days.id
        join public.bookings bookings on bookings.slot_id = slots.id
        left join public.student_accesses accesses on accesses.id = bookings.student_access_id
        left join public.schools schools on schools.id = coalesce(bookings.school_id, accesses.school_id)
        left join public.lesson_types lesson_types on lesson_types.id = slots.lesson_type_id
        where slots.instructor_id = any($1::uuid[])
          and days.date between $2::date and $3::date
          and slots.status <> 'cancelled'
          and bookings.status = 'confirmed'
        order by slots.instructor_id, days.date, slots.start_time, bookings.student_label
      `,
      [instructorIds, from, to],
    ),
    queryRows<PayoutRow>(
      `
        select entries.instructor_id::text,
               coalesce(entries.event_at, entries.planned_at)::text as event_at,
               coalesce(accesses.display_label, bookings.student_label, 'Без ученика') as student_label,
               coalesce(schools.name, 'Без источника') as school_name,
               coalesce(lesson_types.name, 'Тип не указан') as lesson_type_name,
               entries.entry_type,
               entries.amount,
               entries.paid_amount,
               entries.returned_amount,
               entries.remaining_amount,
               entries.note
        from public.instructor_payout_entry_balances entries
        left join public.student_accesses accesses on accesses.id = entries.student_access_id
        left join public.bookings bookings on bookings.id = entries.booking_id
        left join public.schools schools on schools.id = entries.school_id
        left join public.lesson_types lesson_types on lesson_types.id = entries.lesson_type_id
        where entries.instructor_id = any($1::uuid[])
          and entries.organization_id = $2
          and entries.status = 'planned'
          and coalesce(entries.event_at, entries.planned_at)::date between $3::date and $4::date
        order by entries.instructor_id, coalesce(entries.event_at, entries.planned_at), entries.created_at
      `,
      [instructorIds, membership.organizationId, from, to],
    ),
    queryRows<MoneyOperationRow>(
      `
        select payments.instructor_id::text,
               payments.paid_at::text as operation_at,
               'payment'::text as operation_type,
               payments.amount,
               payments.payment_note as note
        from public.instructor_payout_payments payments
        where payments.organization_id = $1
          and payments.instructor_id = any($2::uuid[])
          and payments.paid_at::date between $3::date and $4::date
        union all
        select returns.instructor_id::text,
               returns.returned_at::text as operation_at,
               'return'::text as operation_type,
               returns.amount,
               returns.return_note as note
        from public.instructor_payout_returns returns
        where returns.organization_id = $1
          and returns.instructor_id = any($2::uuid[])
          and returns.returned_at::date between $3::date and $4::date
        order by instructor_id, operation_at
      `,
      [membership.organizationId, instructorIds, from, to],
    ),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Автоинструктор";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = `Расчёты с инструкторами за ${from} — ${to}`;

  const usedSheetNames = new Set<string>();
  for (const instructor of instructors) {
    const instructorLessons = lessons.filter((row) => row.instructor_id === instructor.id);
    const instructorPayouts = payouts.filter((row) => row.instructor_id === instructor.id);
    const instructorOperations = operations.filter((row) => row.instructor_id === instructor.id);
    const worksheet = workbook.addWorksheet(safeSheetName(instructor.name, usedSheetNames), {
      views: [{ state: "frozen", ySplit: 4 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
    });

    worksheet.columns = [
      { width: 14 },
      { width: 15 },
      { width: 24 },
      { width: 20 },
      { width: 20 },
      { width: 24 },
      { width: 16 },
      { width: 16 },
      { width: 16 },
      { width: 32 },
    ];

    const titleRow = worksheet.addRow([`Расчёты с инструктором: ${instructor.name}`]);
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, 10);
    titleRow.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
    titleRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
    titleRow.alignment = { vertical: "middle" };
    titleRow.height = 30;
    worksheet.addRow(["Период", `${formatDate(from)} — ${formatDate(to)}`]);
    worksheet.addRow([]);

    const totalLessonPrice = instructorLessons.reduce((sum, row) => sum + (row.price_amount ?? 0), 0);
    const totalLessonPaid = instructorLessons.reduce((sum, row) => sum + (row.paid_amount ?? 0), 0);
    const totalAccrued = instructorPayouts.reduce((sum, row) => sum + row.amount, 0);
    const totalIssued = instructorPayouts.reduce((sum, row) => sum + row.paid_amount, 0);
    const totalReturned = instructorPayouts.reduce((sum, row) => sum + row.returned_amount, 0);
    const totalRemaining = instructorPayouts.reduce((sum, row) => sum + row.remaining_amount, 0);

    addSectionTitle(worksheet, "Сводка за период");
    addTableHeader(worksheet, ["Показатель", "Сумма / количество"]);
    const summaryRows: Array<[string, string | number, boolean?]> = [
      ["Все занятия", instructorLessons.length],
      ["Проведено", instructorLessons.filter((row) => row.lesson_state === "completed").length],
      ["Стоимость занятий для учеников", totalLessonPrice, true],
      ["Получено от учеников", totalLessonPaid, true],
      ["Долг учеников", Math.max(totalLessonPrice - totalLessonPaid, 0), true],
      ["Начислено инструктору", totalAccrued, true],
      ["Выдано инструктору по этим начислениям", totalIssued, true],
      ["Возвращено инструктором по этим начислениям", totalReturned, true],
      [totalRemaining >= 0 ? "Осталось выдать инструктору" : "Инструктор должен школе", Math.abs(totalRemaining), true],
    ];
    for (const [label, value, isMoney] of summaryRows) {
      const row = worksheet.addRow([label, value]);
      if (isMoney) row.getCell(2).numFmt = MONEY_FORMAT;
    }
    worksheet.addRow([]);

    addSectionTitle(worksheet, "Занятия учеников");
    addTableHeader(worksheet, [
      "Дата",
      "Время",
      "Ученик",
      "Источник",
      "Тип занятия",
      "Статус",
      "Стоимость",
      "Получено",
      "Долг ученика",
    ]);
    if (instructorLessons.length === 0) {
      worksheet.addRow(["Нет занятий за выбранный период"]);
    } else {
      for (const lesson of instructorLessons) {
        const price = lesson.price_amount ?? 0;
        const paid = lesson.paid_amount ?? 0;
        const row = worksheet.addRow([
          formatDate(lesson.date),
          `${formatTime(lesson.start_time)} — ${formatTime(lesson.end_time)}`,
          lesson.student_label,
          lesson.school_name,
          lesson.lesson_type_name,
          lessonStateLabel(lesson.lesson_state),
          price,
          paid,
          Math.max(price - paid, 0),
        ]);
        styleMoneyCells(row, [7, 8, 9]);
      }
      worksheet.autoFilter = {
        from: { row: worksheet.rowCount - instructorLessons.length, column: 1 },
        to: { row: worksheet.rowCount, column: 9 },
      };
    }
    worksheet.addRow([]);

    addSectionTitle(worksheet, "Начисления и корректировки инструктора");
    addTableHeader(worksheet, [
      "Дата",
      "Ученик",
      "Источник",
      "Тип занятия",
      "Операция",
      "Начислено",
      "Выдано",
      "Возвращено",
      "Остаток",
      "Комментарий",
    ]);
    if (instructorPayouts.length === 0) {
      worksheet.addRow(["Нет начислений за выбранный период"]);
    } else {
      for (const payout of instructorPayouts) {
        const row = worksheet.addRow([
          formatDate(payout.event_at),
          payout.student_label,
          payout.school_name,
          payout.lesson_type_name,
          payoutTypeLabel(payout.entry_type),
          payout.amount,
          payout.paid_amount,
          payout.returned_amount,
          payout.remaining_amount,
          payoutNoteLabel(payout.note),
        ]);
        styleMoneyCells(row, [6, 7, 8, 9]);
      }
    }
    worksheet.addRow([]);

    addSectionTitle(worksheet, "Фактические выдачи и возвраты");
    addTableHeader(worksheet, ["Дата", "Операция", "Сумма", "Комментарий"]);
    if (instructorOperations.length === 0) {
      worksheet.addRow(["Нет операций за выбранный период"]);
    } else {
      for (const operation of instructorOperations) {
        const row = worksheet.addRow([
          formatDate(operation.operation_at),
          operation.operation_type === "payment" ? "Выдано инструктору" : "Инструктор вернул школе",
          operation.amount,
          operation.note ?? "",
        ]);
        styleMoneyCells(row, [3]);
      }
    }

    worksheet.eachRow((row) => {
      row.alignment = { ...row.alignment, vertical: "top", wrapText: true };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `otchet-po-instruktoram-${from}-${to}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
