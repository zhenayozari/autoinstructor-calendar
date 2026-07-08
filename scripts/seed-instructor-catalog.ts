import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_ORGANIZATION_SLUG = "autoinstructor-mvp";
const DEFAULT_PRICE = 1500;
const DEFAULT_DURATION_MINUTES = 90;
const DRIVING_LESSON_CODE = "driving_90";

const SOURCE_NAMES = [
  "OMG",
  "Главная дорога",
  "Частные ученики",
];

const SOURCE_COLORS = [
  "#f97316",
  "#22c55e",
  "#2563eb",
  "#a855f7",
  "#eab308",
  "#06b6d4",
];

type Organization = {
  id: string;
  name: string;
  slug: string;
};

type School = {
  id: string;
  name: string;
};

type LessonType = {
  id: string;
  code: string;
};

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

function createSupabaseAdminClient() {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env"));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SECRET_KEY или SUPABASE_SERVICE_ROLE_KEY",
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getTargetOrganization(supabase: SupabaseClient) {
  const organizationSlug =
    process.env.CATALOG_ORGANIZATION_SLUG ?? DEFAULT_ORGANIZATION_SLUG;
  const { data: bySlug, error: bySlugError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("slug", organizationSlug)
    .maybeSingle();

  if (bySlugError) {
    throw new Error(bySlugError.message);
  }

  if (bySlug) {
    return bySlug as Organization;
  }

  const { data: firstOrganization, error: firstOrganizationError } =
    await supabase
      .from("organizations")
      .select("id, name, slug")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

  if (firstOrganizationError) {
    throw new Error(firstOrganizationError.message);
  }

  if (!firstOrganization) {
    throw new Error("Организация не найдена");
  }

  return firstOrganization as Organization;
}

function getSourceNames() {
  const fromEnv = process.env.CATALOG_SOURCE_NAMES;

  if (!fromEnv) {
    return SOURCE_NAMES;
  }

  return fromEnv
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
}

async function seedSources(supabase: SupabaseClient, organizationId: string) {
  const sourceNames = getSourceNames();
  const { data, error } = await supabase
    .from("schools")
    .select("id, name")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(error.message);
  }

  const existingByName = new Map(
    ((data ?? []) as School[]).map((school) => [
      school.name.trim().toLowerCase(),
      school,
    ]),
  );

  for (const [index, name] of sourceNames.entries()) {
    const existing = existingByName.get(name.toLowerCase());
    const payload = {
      organization_id: organizationId,
      name,
      color: SOURCE_COLORS[index % SOURCE_COLORS.length],
      default_price: DEFAULT_PRICE,
      is_active: true,
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from("schools")
        .update(payload)
        .eq("id", existing.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      console.log(`Источник обновлён: ${name}`);
      continue;
    }

    const { error: insertError } = await supabase.from("schools").insert(payload);

    if (insertError) {
      throw new Error(insertError.message);
    }

    console.log(`Источник добавлен: ${name}`);
  }
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() ?? "";

  return (
    error?.code === "42703" ||
    error?.code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("schema cache")
  );
}

async function seedDrivingLessonType(supabase: SupabaseClient) {
  const { data: existing, error: existingError } = await supabase
    .from("lesson_types")
    .select("id, code")
    .eq("code", DRIVING_LESSON_CODE)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const payload = {
    code: DRIVING_LESSON_CODE,
    name: "Вождение",
    description: "Обычное занятие по вождению: 90 минут, два академических часа.",
    color: "#2563eb",
    kind: "driving",
    requires_vehicle: true,
    default_duration_minutes: DEFAULT_DURATION_MINUTES,
    default_price_amount: DEFAULT_PRICE,
    tags: ["Вождение"],
    sort_order: 10,
    is_active: true,
  };
  const query = existing
    ? supabase.from("lesson_types").update(payload).eq("id", (existing as LessonType).id)
    : supabase.from("lesson_types").insert(payload);
  const { error } = await query;

  if (!error) {
    console.log(
      existing ? "Тип занятия обновлён: Вождение" : "Тип занятия добавлен: Вождение",
    );
    return;
  }

  if (!isMissingColumnError(error)) {
    throw new Error(error.message);
  }

  const fallbackPayload = {
    code: DRIVING_LESSON_CODE,
    name: "Вождение",
    description: "Обычное занятие по вождению: 90 минут, два академических часа.",
    color: "#2563eb",
    kind: "driving",
    requires_vehicle: true,
    default_duration_minutes: DEFAULT_DURATION_MINUTES,
    tags: ["Вождение"],
    sort_order: 10,
    is_active: true,
  };
  const fallbackQuery = existing
    ? supabase
        .from("lesson_types")
        .update(fallbackPayload)
        .eq("id", (existing as LessonType).id)
    : supabase.from("lesson_types").insert(fallbackPayload);
  const { error: fallbackError } = await fallbackQuery;

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }

  console.log(
    "Тип занятия сохранён без цены: в базе пока нет lesson_types.default_price_amount",
  );
}

async function main() {
  const supabase = createSupabaseAdminClient();
  const organization = await getTargetOrganization(supabase);

  console.log(`Организация: ${organization.name} (${organization.slug})`);
  await seedSources(supabase, organization.id);
  await seedDrivingLessonType(supabase);
  console.log("Готово.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
