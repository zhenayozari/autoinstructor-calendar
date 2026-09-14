import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_TABLES = [
  "organizations",
  "instructors",
  "organization_members",
  "instructor_capabilities",
  "lesson_types",
  "schools",
  "school_lesson_type_prices",
  "schedule_days",
  "slots",
  "student_accesses",
  "student_access_lesson_types",
  "student_lesson_packages",
  "student_lesson_package_types",
  "bookings",
  "booking_access_code_history",
  "staff_invitations",
  "organization_site_settings",
  "instructor_site_settings",
  "audit_logs",
  "lesson_reviews",
  "student_login_attempts",
  "student_registration_requests",
  "push_subscriptions",
  "notification_preferences",
];

function getArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

async function loadEnvFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);

      if (!match) continue;

      const [, key, rawValue] = match;

      if (process.env[key]) continue;

      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

async function fetchTableRows(supabase, tableName) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select("*")
      .range(from, from + pageSize - 1);

    if (error) {
      throw new Error(`${tableName}: ${error.message}`);
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

async function fetchAuthUsers(supabase) {
  const pageSize = 1000;
  let page = 1;
  const users = [];

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (error) {
      throw new Error(`auth.users: ${error.message}`);
    }

    users.push(...(data.users ?? []));

    if (!data.users || data.users.length < pageSize) {
      break;
    }

    page += 1;
  }

  return users;
}

await loadEnvFile(".env.local");

const outputDir = getArg("--output-dir") ?? "migration-output-api";
const supabaseUrl =
  getArg("--supabase-url") ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const secretKey = getArg("--secret-key") ?? process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required. They can come from .env.local.",
  );
  process.exit(1);
}

await fs.mkdir(outputDir, { recursive: true });

const supabase = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const publicData = {};
const counts = [];

for (const tableName of PUBLIC_TABLES) {
  console.log(`Exporting public.${tableName}...`);
  const rows = await fetchTableRows(supabase, tableName);
  publicData[tableName] = rows;
  counts.push(`${tableName}\t${rows.length}`);
}

console.log("Exporting auth users...");
const authUsers = await fetchAuthUsers(supabase);
const csvRows = [
  "id,email,name,phone,created_at",
  ...authUsers.map((user) =>
    [
      user.id,
      user.email ?? "",
      user.user_metadata?.name ?? "",
      user.user_metadata?.phone ?? "",
      user.created_at ?? "",
    ]
      .map(csvEscape)
      .join(","),
  ),
];

await fs.writeFile(
  path.join(outputDir, "public-data.json"),
  JSON.stringify(publicData, null, 2),
);
await fs.writeFile(path.join(outputDir, "auth-users.csv"), `${csvRows.join("\n")}\n`);
await fs.writeFile(path.join(outputDir, "source-counts.txt"), `${counts.join("\n")}\n`);

console.log(`API export complete: ${outputDir}`);
