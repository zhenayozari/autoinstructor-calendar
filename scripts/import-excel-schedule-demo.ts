import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ExcelJS, { type Cell, type Worksheet } from "exceljs";

const DEFAULT_FILE = "data/instructor-schedule.xlsx";
const DEFAULT_YEAR = 2026;
const DEFAULT_TIMEZONE = "Asia/Irkutsk";
const DEFAULT_TARGET_INSTRUCTOR_SLUG = "main-instructor";
const DEMO_SOURCE = "excel-import";
const BATCH_SIZE = 250;

type LessonKey = "omg" | "main_road" | "extra" | "gift";
type CellColor =
  | LessonKey
  | "blocked"
  | "separator"
  | "week_header"
  | "unknown";

type ParsedSlot = {
  sourceKey: string;
  date: string;
  startTime: string;
  endTime: string;
  lessonKey: LessonKey;
  studentLabel: string | null;
  sourceColor: string;
};

type ImportStats = {
  weeks: number;
  days: number;
  slots: number;
  bookings: number;
  skippedCells: number;
  duplicateCells: number;
  inferredTimeRows: number;
  unknownColors: Map<string, number>;
};

type LessonTypeRow = {
  id: string;
  code: string;
};

type ScheduleDayRow = {
  id: string;
  date: string;
};

type SlotRow = {
  id: string;
  note: string | null;
};

type ExcelColor = {
  argb?: string;
  indexed?: number;
  theme?: number;
};

const LESSON_TYPES: Record<
  LessonKey,
  {
    code: string;
    name: string;
    description: string;
    color: string;
    tags: string[];
    sortOrder: number;
  }
> = {
  omg: {
    code: "demo_excel_omg",
    name: "OMG",
    description: "Демо-импорт из Excel: оранжевые ячейки",
    color: "#FF9900",
    tags: ["Автошкола", DEMO_SOURCE],
    sortOrder: 210,
  },
  main_road: {
    code: "demo_excel_main_road",
    name: "Главная дорога",
    description: "Демо-импорт из Excel: зелёные ячейки",
    color: "#00C853",
    tags: ["Автошкола", DEMO_SOURCE],
    sortOrder: 220,
  },
  extra: {
    code: "demo_excel_extra",
    name: "Дополнительное",
    description: "Демо-импорт из Excel: белые ячейки",
    color: "#E5E7EB",
    tags: ["Дополнительное занятие", DEMO_SOURCE],
    sortOrder: 230,
  },
  gift: {
    code: "demo_excel_gift",
    name: "Подарочное",
    description: "Демо-импорт из Excel: фиолетовые и розовые ячейки",
    color: "#C026D3",
    tags: ["Подарок", DEMO_SOURCE],
    sortOrder: 240,
  },
};

const COLOR_REFERENCES: Array<{
  type: CellColor;
  rgb: [number, number, number];
  tolerance: number;
}> = [
  { type: "omg", rgb: [255, 153, 0], tolerance: 100 },
  { type: "main_road", rgb: [0, 255, 0], tolerance: 115 },
  { type: "extra", rgb: [255, 255, 255], tolerance: 60 },
  { type: "gift", rgb: [255, 0, 255], tolerance: 125 },
  { type: "blocked", rgb: [255, 0, 0], tolerance: 105 },
  { type: "separator", rgb: [0, 0, 0], tolerance: 55 },
  { type: "week_header", rgb: [255, 255, 0], tolerance: 100 },
];

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function normalizeArgb(argb: string) {
  const normalized = argb.replace(/^#/, "").toUpperCase();

  if (/^[0-9A-F]{8}$/.test(normalized)) {
    return normalized.slice(2);
  }

  if (/^[0-9A-F]{6}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function getCellColor(cell: Cell) {
  if (
    !cell.fill ||
    cell.fill.type !== "pattern" ||
    cell.fill.pattern === "none"
  ) {
    return { rgb: [255, 255, 255] as [number, number, number], hex: "#FFFFFF" };
  }

  const color = cell.fill.fgColor as ExcelColor | undefined;

  if (color?.argb) {
    const rgbHex = normalizeArgb(color.argb);

    if (rgbHex) {
      return {
        rgb: [
          Number.parseInt(rgbHex.slice(0, 2), 16),
          Number.parseInt(rgbHex.slice(2, 4), 16),
          Number.parseInt(rgbHex.slice(4, 6), 16),
        ] as [number, number, number],
        hex: `#${rgbHex}`,
      };
    }
  }

  const source = color?.indexed
    ? `INDEXED_${color.indexed}`
    : color?.theme !== undefined
      ? `THEME_${color.theme}`
      : "UNRESOLVED";

  return { rgb: null, hex: source };
}

function classifyColor(cell: Cell): { type: CellColor; hex: string } {
  const color = getCellColor(cell);

  if (!color.rgb) {
    return { type: "unknown", hex: color.hex };
  }

  let closest: (typeof COLOR_REFERENCES)[number] | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const reference of COLOR_REFERENCES) {
    const distance = Math.sqrt(
      (color.rgb[0] - reference.rgb[0]) ** 2 +
        (color.rgb[1] - reference.rgb[1]) ** 2 +
        (color.rgb[2] - reference.rgb[2]) ** 2,
    );

    if (distance < closestDistance) {
      closest = reference;
      closestDistance = distance;
    }
  }

  if (closest && closestDistance <= closest.tolerance) {
    return { type: closest.type, hex: color.hex };
  }

  return { type: "unknown", hex: color.hex };
}

function getCellText(cell: Cell) {
  return cell.text.trim();
}

function isWeekHeader(worksheet: Worksheet, rowNumber: number) {
  return (
    getCellText(worksheet.getCell(rowNumber, 1)).toLocaleLowerCase("ru-RU") ===
    "время"
  );
}

function parseDateHeader(cell: Cell, year: number) {
  if (cell.value instanceof Date) {
    const date = new Date(
      Date.UTC(
        year,
        cell.value.getUTCMonth(),
        cell.value.getUTCDate(),
      ),
    );
    return date.toISOString().slice(0, 10);
  }

  const match = getCellText(cell).match(/(\d{1,2})\s*[./]\s*(\d{1,2})/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function parseTimeRange(value: string) {
  const match = value.match(
    /(\d{1,2})[.:](\d{2})\s*[-–—]\s*(\d{1,2})[.:](\d{2})/,
  );
  if (!match) return null;

  const startMinutes = Number(match[1]) * 60 + Number(match[2]);
  const endMinutes = Number(match[3]) * 60 + Number(match[4]);

  if (
    startMinutes < 0 ||
    startMinutes >= 24 * 60 ||
    endMinutes <= startMinutes ||
    endMinutes > 24 * 60
  ) {
    return null;
  }

  return { startMinutes, endMinutes };
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
}

function toUtcIso(date: string, minutes: number, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const desiredUtc = Date.UTC(
    year,
    month - 1,
    day,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  let candidate = new Date(desiredUtc);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const representedUtc = getTimeZoneParts(candidate, timeZone);
    candidate = new Date(candidate.getTime() + desiredUtc - representedUtc);
  }

  return candidate.toISOString();
}

function isWorkingColor(type: CellColor): type is LessonKey {
  return type === "omg" || type === "main_road" || type === "extra" || type === "gift";
}

function rowHasWorkingCells(worksheet: Worksheet, rowNumber: number) {
  for (let column = 2; column <= 8; column += 1) {
    if (isWorkingColor(classifyColor(worksheet.getCell(rowNumber, column)).type)) {
      return true;
    }
  }

  return false;
}

function parseWorksheet(
  worksheet: Worksheet,
  year: number,
  timeZone: string,
): { slots: ParsedSlot[]; stats: ImportStats } {
  const slotsBySourceKey = new Map<string, ParsedSlot>();
  const stats: ImportStats = {
    weeks: 0,
    days: 0,
    slots: 0,
    bookings: 0,
    skippedCells: 0,
    duplicateCells: 0,
    inferredTimeRows: 0,
    unknownColors: new Map(),
  };
  const headerRows: number[] = [];

  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    if (isWeekHeader(worksheet, rowNumber)) {
      headerRows.push(rowNumber);
    }
  }

  stats.weeks = headerRows.length;

  for (const [headerIndex, headerRow] of headerRows.entries()) {
    const nextHeader = headerRows[headerIndex + 1] ?? worksheet.rowCount + 1;
    const dates = Array.from({ length: 7 }, (_, offset) =>
      parseDateHeader(worksheet.getCell(headerRow, offset + 2), year),
    );
    let previousEndMinutes: number | null = null;

    for (
      let rowNumber = headerRow + 1;
      rowNumber < nextHeader;
      rowNumber += 1
    ) {
      const explicitRange = parseTimeRange(
        getCellText(worksheet.getCell(rowNumber, 1)),
      );
      let timeRange = explicitRange;

      if (
        !timeRange &&
        !getCellText(worksheet.getCell(rowNumber, 1)) &&
        rowHasWorkingCells(worksheet, rowNumber)
      ) {
        if (previousEndMinutes === null || previousEndMinutes + 90 > 24 * 60) {
          stats.skippedCells += 7;
          continue;
        }

        timeRange = {
          startMinutes: previousEndMinutes,
          endMinutes: previousEndMinutes + 90,
        };
        stats.inferredTimeRows += 1;
      }

      if (!timeRange) continue;
      previousEndMinutes = timeRange.endMinutes;

      for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
        const date = dates[dayOffset];
        const column = dayOffset + 2;
        const cell = worksheet.getCell(rowNumber, column);

        if (!date) {
          stats.skippedCells += 1;
          continue;
        }

        const { type, hex } = classifyColor(cell);

        if (
          type === "blocked" ||
          type === "separator" ||
          type === "week_header"
        ) {
          stats.skippedCells += 1;
          continue;
        }

        if (type === "unknown") {
          stats.skippedCells += 1;
          stats.unknownColors.set(hex, (stats.unknownColors.get(hex) ?? 0) + 1);
          continue;
        }

        const sourceKey = `${date}:${timeRange.startMinutes}`;

        if (slotsBySourceKey.has(sourceKey)) {
          stats.duplicateCells += 1;
          continue;
        }

        slotsBySourceKey.set(sourceKey, {
          sourceKey,
          date,
          startTime: toUtcIso(date, timeRange.startMinutes, timeZone),
          endTime: toUtcIso(date, timeRange.endMinutes, timeZone),
          lessonKey: type,
          studentLabel: getCellText(cell).slice(0, 80) || null,
          sourceColor: hex,
        });
      }
    }
  }

  const slots = [...slotsBySourceKey.values()].sort((left, right) =>
    left.startTime.localeCompare(right.startTime),
  );
  stats.days = new Set(slots.map((slot) => slot.date)).size;
  stats.slots = slots.length;
  stats.bookings = slots.filter((slot) => slot.studentLabel).length;

  return { slots, stats };
}

async function batchInsert<T>(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  select?: string,
) {
  const inserted: T[] = [];

  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const query = supabase
      .from(table)
      .insert(rows.slice(index, index + BATCH_SIZE));
    const { data, error } = select ? await query.select(select) : await query;

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    if (data) inserted.push(...(data as T[]));
  }

  return inserted;
}

async function prepareTargetData(
  supabase: SupabaseClient,
  targetSlug: string,
) {
  const { data: instructor, error: instructorError } = await supabase
    .from("instructors")
    .select("id, slug")
    .eq("slug", targetSlug)
    .maybeSingle();

  if (instructorError) {
    throw new Error(
      `Не удалось проверить инструктора: ${instructorError.message}`,
    );
  }

  if (!instructor) {
    throw new Error(
      `Инструктор ${targetSlug} не найден. Скрипт больше не создаёт профили автоматически.`,
    );
  }

  const { data: existingSettings, error: settingsLookupError } = await supabase
    .from("instructor_settings")
    .select("instructor_id")
    .eq("instructor_id", instructor.id)
    .maybeSingle();

  if (settingsLookupError) {
    throw new Error(
      `Не удалось проверить instructor_settings: ${settingsLookupError.message}`,
    );
  }

  if (!existingSettings) {
    const { error: settingsError } = await supabase
      .from("instructor_settings")
      .insert({
        instructor_id: instructor.id,
        booking_access_code: null,
        booking_access_code_hash: null,
        booking_access_code_updated_at: null,
      });

    if (settingsError) {
      throw new Error(`instructor_settings: ${settingsError.message}`);
    }
  }

  const { error: capabilityError } = await supabase
    .from("instructor_capabilities")
    .upsert(
      { instructor_id: instructor.id, capability: "driving" },
      { onConflict: "instructor_id,capability" },
    );

  if (capabilityError) {
    throw new Error(`instructor_capabilities: ${capabilityError.message}`);
  }

  const lessonRows = Object.values(LESSON_TYPES).map((lessonType) => ({
    code: lessonType.code,
    name: lessonType.name,
    description: lessonType.description,
    color: lessonType.color,
    kind: "driving",
    requires_vehicle: true,
    default_duration_minutes: 90,
    tags: lessonType.tags,
    sort_order: lessonType.sortOrder,
    is_active: true,
  }));
  const { data: lessonTypes, error: lessonTypeError } = await supabase
    .from("lesson_types")
    .upsert(lessonRows, { onConflict: "code" })
    .select("id, code");

  if (lessonTypeError) {
    throw new Error(`lesson_types: ${lessonTypeError.message}`);
  }

  return {
    instructorId: instructor.id as string,
    lessonTypes: lessonTypes as LessonTypeRow[],
  };
}

async function importToSupabase(
  supabase: SupabaseClient,
  slots: ParsedSlot[],
  fileName: string,
  targetSlug: string,
  clearTarget: boolean,
) {
  const { instructorId, lessonTypes } = await prepareTargetData(
    supabase,
    targetSlug,
  );
  const lessonIdByCode = new Map(
    lessonTypes.map((lessonType) => [lessonType.code, lessonType.id]),
  );
  const dates = [...new Set(slots.map((slot) => slot.date))].sort();
  const { data: existingDays, error: existingDaysError } = await supabase
    .from("schedule_days")
    .select("id, date")
    .eq("instructor_id", instructorId)
    .in("date", dates);

  if (existingDaysError) {
    throw new Error(existingDaysError.message);
  }

  if (clearTarget) {
    const { error: clearError } = await supabase
      .from("schedule_days")
      .delete()
      .eq("instructor_id", instructorId);

    if (clearError) {
      throw new Error(`Не удалось очистить target-расписание: ${clearError.message}`);
    }
  } else if ((existingDays ?? []).length > 0) {
    throw new Error(
      `У ${targetSlug} уже есть дни в импортируемом диапазоне (${(existingDays ?? [])
        .map((day) => day.date)
        .join(", ")}). Данные не изменены. Для полной замены явно задайте EXCEL_IMPORT_CLEAR_TARGET=true.`,
    );
  }

  const scheduleDays = await batchInsert<ScheduleDayRow>(
    supabase,
    "schedule_days",
    dates.map((date) => ({
      instructor_id: instructorId,
      date,
      transmission: "automatic",
      published_at: new Date().toISOString(),
    })),
    "id, date",
  );
  const scheduleDayIdByDate = new Map(
    scheduleDays.map((day) => [day.date, day.id]),
  );
  const sourceKeyByNote = new Map<string, string>();
  const slotRows = slots.map((slot) => {
    const lessonCode = LESSON_TYPES[slot.lessonKey].code;
    const lessonTypeId = lessonIdByCode.get(lessonCode);
    const scheduleDayId = scheduleDayIdByDate.get(slot.date);

    if (!lessonTypeId || !scheduleDayId) {
      throw new Error(`Не удалось связать слот ${slot.sourceKey}`);
    }

    const note = `${DEMO_SOURCE}|${fileName}|${slot.sourceKey}|${slot.sourceColor}`;
    sourceKeyByNote.set(note, slot.sourceKey);

    return {
      instructor_id: instructorId,
      schedule_day_id: scheduleDayId,
      lesson_type_id: lessonTypeId,
      start_time: slot.startTime,
      end_time: slot.endTime,
      location_type: "in_car",
      status: "available",
      note,
    };
  });
  const insertedSlots = await batchInsert<SlotRow>(
    supabase,
    "slots",
    slotRows,
    "id, note",
  );
  const slotIdBySourceKey = new Map<string, string>();

  for (const slot of insertedSlots) {
    const sourceKey = slot.note ? sourceKeyByNote.get(slot.note) : null;
    if (sourceKey) slotIdBySourceKey.set(sourceKey, slot.id);
  }

  const bookingRows = slots.flatMap((slot) => {
    if (!slot.studentLabel) return [];
    const slotId = slotIdBySourceKey.get(slot.sourceKey);

    if (!slotId) {
      throw new Error(`Не найден созданный слот для booking ${slot.sourceKey}`);
    }

    return [
      {
        slot_id: slotId,
        student_label: slot.studentLabel,
        status: "confirmed",
      },
    ];
  });

  await batchInsert(supabase, "bookings", bookingRows);
}

function printStats(stats: ImportStats, title = "Импорт завершён") {
  const unknownColorCount = [...stats.unknownColors.values()].reduce(
    (sum, count) => sum + count,
    0,
  );

  console.log(`\n${title}`);
  console.log(`Недель: ${stats.weeks}`);
  console.log(`Дней: ${stats.days}`);
  console.log(`Слотов: ${stats.slots}`);
  console.log(`Bookings: ${stats.bookings}`);
  console.log(`Дополнительных строк времени: ${stats.inferredTimeRows}`);
  console.log(`Пропущенных ячеек: ${stats.skippedCells}`);
  console.log(`Дубликатов: ${stats.duplicateCells}`);
  console.log(`Неизвестных цветов: ${unknownColorCount}`);

  if (stats.unknownColors.size > 0) {
    console.log("Неизвестные цвета:");
    for (const [color, count] of stats.unknownColors) {
      console.log(`  ${color}: ${count}`);
    }
  }
}

async function main() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const filePath = resolve(
    process.cwd(),
    process.env.EXCEL_IMPORT_FILE?.trim() || DEFAULT_FILE,
  );
  const importYear = Number(
    process.env.EXCEL_IMPORT_YEAR ?? DEFAULT_YEAR,
  );
  const timeZone =
    process.env.EXCEL_IMPORT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const targetSlug =
    process.env.EXCEL_IMPORT_TARGET_INSTRUCTOR_SLUG?.trim() ||
    DEFAULT_TARGET_INSTRUCTOR_SLUG;
  const clearTarget =
    process.env.EXCEL_IMPORT_CLEAR_TARGET?.trim().toLowerCase() === "true";

  if (!existsSync(filePath)) {
    throw new Error(`Excel-файл не найден: ${filePath}`);
  }

  if (!Number.isInteger(importYear) || importYear < 2000 || importYear > 2100) {
    throw new Error(`Некорректный EXCEL_IMPORT_YEAR: ${importYear}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    throw new Error("В Excel-файле нет листов");
  }

  console.log(
    `Читаю ${basename(filePath)}, лист «${worksheet.name}», год ${importYear}`,
  );
  console.log(
    `Target instructor: ${targetSlug}; очистка target: ${clearTarget ? "ДА" : "нет"}`,
  );

  const { slots, stats } = parseWorksheet(worksheet, importYear, timeZone);

  if (slots.length === 0) {
    throw new Error(
      "Не найдено ни одного рабочего слота. Проверьте файл, год и цвета.",
    );
  }

  if (process.argv.includes("--dry-run")) {
    printStats(stats, "Проверка Excel завершена, Supabase не изменён");
    return;
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  const supabaseSecretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error(
      "Добавьте NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY в .env.local",
    );
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await importToSupabase(
    supabase,
    slots,
    basename(filePath),
    targetSlug,
    clearTarget,
  );
  printStats(stats);
}

main().catch((error: unknown) => {
  console.error(
    "\nОшибка импорта:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
