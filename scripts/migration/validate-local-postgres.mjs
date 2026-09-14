import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const TABLES = [
  "app_users",
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

const databaseUrl = getArg("--database-url") ?? process.env.DATABASE_URL;
const outputDir = getArg("--output-dir") ?? "migration-output-api";

if (!databaseUrl && (!process.env.PGHOST || !process.env.PGDATABASE || !process.env.PGUSER)) {
  console.error("DATABASE_URL or PGHOST/PGDATABASE/PGUSER is required.");
  process.exit(1);
}

const client = new Client(databaseUrl ? { connectionString: databaseUrl } : {});
const lines = [];

try {
  await client.connect();

  for (const table of TABLES) {
    const { rows } = await client.query(
      `select count(*)::text as count from public."${table}"`,
    );
    lines.push(`${table}\t${rows[0].count}`);
  }
} finally {
  await client.end();
}

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(
  path.join(outputDir, "target-counts.txt"),
  `${lines.join("\n")}\n`,
);

console.log(lines.join("\n"));
console.log(`Target counts written to ${path.join(outputDir, "target-counts.txt")}`);
