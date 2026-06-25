import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SPREADSHEET_ID =
  "16DfYKRXzHtgOJS8JLsAqAJ3VRkSNAVU7nwEnEVDpI94";
const DEFAULT_SHEET_GID = 0;
const DEMO_INSTRUCTOR_SLUG = "demo-sheet-import";
const DEMO_SOURCE = "demo-sheet-import";
const DEFAULT_TIMEZONE = "Asia/Irkutsk";
const BATCH_SIZE = 250;

type RgbColor = {
  red?: number;
  green?: number;
  blue?: number;
};

type GoogleCell = {
  formattedValue?: string;
  effectiveFormat?: {
    backgroundColor?: RgbColor;
    backgroundColorStyle?: {
      rgbColor?: RgbColor;
    };
  };
};

type GoogleRow = {
  values?: GoogleCell[];
};

type GoogleSheet = {
  properties?: {
    sheetId?: number;
    title?: string;
  };
  data?: Array<{
    startRow?: number;
    startColumn?: number;
    rowData?: GoogleRow[];
  }>;
};

type GoogleSpreadsheet = {
  sheets?: GoogleSheet[];
};

type LessonKey = "omg" | "main_road" | "extra_driving" | "gift_driving";
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
    code: "demo_sheet_omg",
    name: "Автошкола OMG",
    description: "Демо-импорт из Google Sheets: оранжевые ячейки",
    color: "#FF9900",
    tags: ["Автошкола", DEMO_SOURCE],
    sortOrder: 110,
  },
  main_road: {
    code: "demo_sheet_main_road",
    name: "Главная дорога",
    description: "Демо-импорт из Google Sheets: зелёные ячейки",
    color: "#00C853",
    tags: ["Автошкола", DEMO_SOURCE],
    sortOrder: 120,
  },
  extra_driving: {
    code: "demo_sheet_extra_driving",
    name: "Дополнительное вождение",
    description: "Демо-импорт из Google Sheets: белые ячейки",
    color: "#E5E7EB",
    tags: ["Дополнительное занятие", DEMO_SOURCE],
    sortOrder: 130,
  },
  gift_driving: {
    code: "demo_sheet_gift",
    name: "Подарочное занятие",
    description: "Демо-импорт из Google Sheets: фиолетовые ячейки",
    color: "#C026D3",
    tags: ["Подарок", DEMO_SOURCE],
    sortOrder: 140,
  },
};

const COLOR_REFERENCES: Array<{
  type: CellColor;
  rgb: [number, number, number];
  tolerance: number;
}> = [
  { type: "omg", rgb: [255, 153, 0], tolerance: 95 },
  { type: "main_road", rgb: [0, 255, 0], tolerance: 110 },
  { type: "extra_driving", rgb: [255, 255, 255], tolerance: 55 },
  { type: "gift_driving", rgb: [255, 0, 255], tolerance: 115 },
  { type: "blocked", rgb: [255, 0, 0], tolerance: 95 },
  { type: "separator", rgb: [0, 0, 0], tolerance: 50 },
  { type: "week_header", rgb: [255, 255, 0], tolerance: 95 },
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

    process.env[key] ??= value.replace(/\\n/g, "\n");
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Не задана переменная окружения ${name}`);
  }

  return value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

async function getGoogleAccessToken() {
  const clientEmail = requireEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = requireEnv("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY").replace(
    /\\n/g,
    "\n",
  );
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = base64Url(signer.sign(privateKey));

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsignedToken}.${signature}`,
    }),
  });

  const body = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Google OAuth: ${body.error_description ?? body.error ?? response.statusText}`,
    );
  }

  return body.access_token;
}

async function fetchSpreadsheet() {
  const spreadsheetId =
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim() ||
    DEFAULT_SPREADSHEET_ID;
  const accessToken = await getGoogleAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`,
  );
  url.searchParams.set("includeGridData", "true");

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API ${response.status}: ${body}`);
  }

  return {
    spreadsheetId,
    spreadsheet: (await response.json()) as GoogleSpreadsheet,
  };
}

function normalizeRows(sheet: GoogleSheet) {
  const rows: GoogleRow[] = [];

  for (const grid of sheet.data ?? []) {
    const startRow = grid.startRow ?? 0;
    const startColumn = grid.startColumn ?? 0;

    for (const [rowOffset, sourceRow] of (grid.rowData ?? []).entries()) {
      const rowIndex = startRow + rowOffset;
      rows[rowIndex] ??= { values: [] };
      const targetValues = rows[rowIndex].values ?? [];

      for (const [columnOffset, cell] of (
        sourceRow.values ?? []
      ).entries()) {
        targetValues[startColumn + columnOffset] = cell;
      }

      rows[rowIndex].values = targetValues;
    }
  }

  return rows;
}

function getCellText(cell?: GoogleCell) {
  return cell?.formattedValue?.trim() ?? "";
}

function getRgb(cell?: GoogleCell): [number, number, number] {
  const color =
    cell?.effectiveFormat?.backgroundColorStyle?.rgbColor ??
    cell?.effectiveFormat?.backgroundColor;

  if (!color) return [255, 255, 255];

  return [
    Math.round((color.red ?? 0) * 255),
    Math.round((color.green ?? 0) * 255),
    Math.round((color.blue ?? 0) * 255),
  ];
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${rgb
    .map((component) => component.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function classifyColor(cell?: GoogleCell): {
  type: CellColor;
  hex: string;
} {
  const rgb = getRgb(cell);
  const hex = rgbToHex(rgb);
  let closest: (typeof COLOR_REFERENCES)[number] | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const reference of COLOR_REFERENCES) {
    const distance = Math.sqrt(
      (rgb[0] - reference.rgb[0]) ** 2 +
        (rgb[1] - reference.rgb[1]) ** 2 +
        (rgb[2] - reference.rgb[2]) ** 2,
    );

    if (distance < closestDistance) {
      closest = reference;
      closestDistance = distance;
    }
  }

  if (closest && closestDistance <= closest.tolerance) {
    return { type: closest.type, hex };
  }

  return { type: "unknown", hex };
}

function parseDateHeader(value: string, year: number) {
  const match = value.match(/(\d{1,2})\s*[./]\s*(\d{1,2})/);
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

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[3]);
  const endMinute = Number(match[4]);

  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59
  ) {
    return null;
  }

  return {
    startHour,
    startMinute,
    endHour,
    endMinute,
  };
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

function toUtcIso(
  date: string,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const [year, month, day] = date.split("-").map(Number);
  const desiredUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = new Date(desiredUtc);

  for (let iteration = 0; iteration < 2; iteration += 1) {
    const representedUtc = getTimeZoneParts(candidate, timeZone);
    candidate = new Date(candidate.getTime() + desiredUtc - representedUtc);
  }

  return candidate.toISOString();
}

function isWeekHeader(row: GoogleRow) {
  return getCellText(row.values?.[0]).toLocaleLowerCase("ru-RU") === "время";
}

function parseSheet(
  sheet: GoogleSheet,
  year: number,
  timeZone: string,
): {
  slots: ParsedSlot[];
  stats: ImportStats;
} {
  const rows = normalizeRows(sheet);
  const slotsBySourceKey = new Map<string, ParsedSlot>();
  const stats: ImportStats = {
    weeks: 0,
    days: 0,
    slots: 0,
    bookings: 0,
    skippedCells: 0,
    unknownColors: new Map(),
  };
  let activeDates: Array<string | null> | null = null;

  for (const row of rows) {
    if (isWeekHeader(row)) {
      activeDates = Array.from({ length: 7 }, (_, offset) =>
        parseDateHeader(getCellText(row.values?.[offset + 1]), year),
      );
      stats.weeks += 1;
      continue;
    }

    if (!activeDates) continue;

    const timeRange = parseTimeRange(getCellText(row.values?.[0]));
    if (!timeRange) continue;

    for (let dayOffset = 0; dayOffset < 7; dayOffset += 1) {
      const date = activeDates[dayOffset];
      const cell = row.values?.[dayOffset + 1];

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

      const sourceKey = `${date}:${timeRange.startHour
        .toString()
        .padStart(2, "0")}:${timeRange.startMinute
        .toString()
        .padStart(2, "0")}`;

      if (slotsBySourceKey.has(sourceKey)) {
        stats.skippedCells += 1;
        continue;
      }

      const studentLabel = getCellText(cell).slice(0, 80) || null;
      slotsBySourceKey.set(sourceKey, {
        sourceKey,
        date,
        startTime: toUtcIso(
          date,
          timeRange.startHour,
          timeRange.startMinute,
          timeZone,
        ),
        endTime: toUtcIso(
          date,
          timeRange.endHour,
          timeRange.endMinute,
          timeZone,
        ),
        lessonKey: type,
        studentLabel,
        sourceColor: hex,
      });
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
    const { data, error } = select
      ? await query.select(select)
      : await query;

    if (error) {
      throw new Error(`${table}: ${error.message}`);
    }

    if (data) inserted.push(...(data as T[]));
  }

  return inserted;
}

async function prepareDemoData(
  supabase: SupabaseClient,
  timeZone: string,
) {
  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id")
    .eq("slug", "autoinstructor-mvp")
    .maybeSingle();

  if (organizationError || !organization) {
    throw new Error(
      `Организация autoinstructor-mvp не найдена: ${organizationError?.message ?? "нет данных"}`,
    );
  }

  const { data: mainInstructor } = await supabase
    .from("instructors")
    .select(
      "photo_url, short_bio, contact_text, car_description, experience_text",
    )
    .eq("slug", "main-instructor")
    .maybeSingle();

  const { data: demoInstructor, error: instructorError } = await supabase
    .from("instructors")
    .upsert(
      {
        organization_id: organization.id,
        name: "Демо-инструктор из Google Sheets",
        slug: DEMO_INSTRUCTOR_SLUG,
        timezone: timeZone,
        is_active: true,
        public_name: "Демо-инструктор",
        photo_url: mainInstructor?.photo_url ?? null,
        short_bio:
          mainInstructor?.short_bio ??
          "Демонстрационное расписание, импортированное из Google Sheets.",
        contact_text: mainInstructor?.contact_text ?? null,
        car_description: mainInstructor?.car_description ?? null,
        experience_text: mainInstructor?.experience_text ?? null,
        public_is_visible: true,
        profile_updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (instructorError) {
    throw new Error(`Не удалось создать demo-инструктора: ${instructorError.message}`);
  }

  const { error: cleanupError } = await supabase
    .from("schedule_days")
    .delete()
    .eq("instructor_id", demoInstructor.id);

  if (cleanupError) {
    throw new Error(`Не удалось очистить demo-расписание: ${cleanupError.message}`);
  }

  const { error: settingsError } = await supabase
    .from("instructor_settings")
    .upsert(
      {
        instructor_id: demoInstructor.id,
        booking_access_code: null,
        booking_access_code_hash: null,
        booking_access_code_updated_at: null,
      },
      { onConflict: "instructor_id" },
    );

  if (settingsError) {
    throw new Error(`instructor_settings: ${settingsError.message}`);
  }

  const { error: capabilityError } = await supabase
    .from("instructor_capabilities")
    .upsert(
      { instructor_id: demoInstructor.id, capability: "driving" },
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
    instructorId: demoInstructor.id as string,
    lessonTypes: lessonTypes as LessonTypeRow[],
  };
}

async function importToSupabase(
  supabase: SupabaseClient,
  slots: ParsedSlot[],
  spreadsheetId: string,
  sheetGid: number,
  timeZone: string,
) {
  const { instructorId, lessonTypes } = await prepareDemoData(
    supabase,
    timeZone,
  );
  const lessonIdByCode = new Map(
    lessonTypes.map((lessonType) => [lessonType.code, lessonType.id]),
  );
  const dates = [...new Set(slots.map((slot) => slot.date))].sort();
  const scheduleDays = await batchInsert<ScheduleDayRow>(
    supabase,
    "schedule_days",
    dates.map((date, index) => ({
      instructor_id: instructorId,
      date,
      transmission: index % 7 === 5 ? "manual" : "automatic",
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

    const note = `${DEMO_SOURCE}:${spreadsheetId}:${sheetGid}:${slot.sourceKey}:${slot.sourceColor}`;
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

function printStats(stats: ImportStats) {
  console.log("\nИмпорт завершён");
  console.log(`Недель: ${stats.weeks}`);
  console.log(`Дней: ${stats.days}`);
  console.log(`Слотов: ${stats.slots}`);
  console.log(`Bookings: ${stats.bookings}`);
  console.log(`Пропущенных ячеек: ${stats.skippedCells}`);
  console.log(
    `Неизвестных цветов: ${[...stats.unknownColors.values()].reduce(
      (sum, count) => sum + count,
      0,
    )}`,
  );

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

  const sheetGid = Number(
    process.env.GOOGLE_SHEETS_GID ?? DEFAULT_SHEET_GID,
  );
  const importYear = Number(
    process.env.GOOGLE_SHEETS_IMPORT_YEAR ?? new Date().getFullYear(),
  );
  const timeZone =
    process.env.GOOGLE_SHEETS_IMPORT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;
  const { spreadsheetId, spreadsheet } = await fetchSpreadsheet();
  const sheet = spreadsheet.sheets?.find(
    (candidate) => candidate.properties?.sheetId === sheetGid,
  );

  if (!sheet) {
    throw new Error(`Лист с gid=${sheetGid} не найден`);
  }

  console.log(
    `Читаю лист «${sheet.properties?.title ?? sheetGid}», год ${importYear}`,
  );

  const { slots, stats } = parseSheet(sheet, importYear, timeZone);

  if (slots.length === 0) {
    throw new Error(
      "Не найдено ни одного рабочего слота. Проверьте год, gid и цвета таблицы.",
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
    spreadsheetId,
    sheetGid,
    timeZone,
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
