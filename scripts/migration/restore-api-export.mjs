import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { spawn } from "node:child_process";

const { Client } = pg;

const TABLE_ORDER = [
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

const JSON_COLUMNS = new Set([
  "landing_content",
  "metadata",
  "subscription",
]);

function getArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function quoteIdent(value) {
  return `"${value.replace(/"/g, '""')}"`;
}

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${scriptPath} failed with exit code ${code}`));
      }
    });
  });
}

async function getTargetColumns(client, tableName) {
  const { rows } = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [tableName],
  );

  return new Set(rows.map((row) => row.column_name));
}

async function insertRows(client, tableName, rows) {
  if (rows.length === 0) {
    return;
  }

  const targetColumns = await getTargetColumns(client, tableName);
  const columns = Object.keys(rows[0]).filter((column) =>
    targetColumns.has(column),
  );

  if (columns.length === 0) {
    return;
  }

  const columnSql = columns.map(quoteIdent).join(", ");

  for (const row of rows) {
    const values = columns.map((column) => {
      const value = row[column];

      if (JSON_COLUMNS.has(column) && value !== null && value !== undefined) {
        return JSON.stringify(value);
      }

      return value;
    });
    const placeholders = columns
      .map((column, index) =>
        JSON_COLUMNS.has(column) ? `$${index + 1}::jsonb` : `$${index + 1}`,
      )
      .join(", ");

    await client.query(
      `
        insert into public.${quoteIdent(tableName)} (${columnSql})
        values (${placeholders})
        on conflict do nothing
      `,
      values,
    );
  }
}

const inputDir = getArg("--input-dir") ?? "migration-output-api";
const databaseUrl = getArg("--database-url") ?? process.env.DATABASE_URL;

if (!databaseUrl && (!process.env.PGHOST || !process.env.PGDATABASE || !process.env.PGUSER)) {
  console.error("DATABASE_URL or PGHOST/PGDATABASE/PGUSER is required.");
  process.exit(1);
}

const authUsersCsv = path.join(inputDir, "auth-users.csv");
const appUsersSql = path.join(inputDir, "app-users.sql");
const temporaryPasswords = path.join(inputDir, "temporary-passwords.csv");
const publicDataPath = path.join(inputDir, "public-data.json");
const publicData = JSON.parse(await fs.readFile(publicDataPath, "utf8"));

await runNodeScript("scripts/migration/create-app-users.mjs", [
  "--input",
  authUsersCsv,
  "--sql-output",
  appUsersSql,
  "--password-output",
  temporaryPasswords,
]);

const appUsersSqlText = await fs.readFile(appUsersSql, "utf8");
const client = new Client(databaseUrl ? { connectionString: databaseUrl } : {});

try {
  await client.connect();
  await client.query("begin");
  await client.query(appUsersSqlText);

  for (const tableName of TABLE_ORDER) {
    const rows = publicData[tableName] ?? [];
    console.log(`Restoring public.${tableName}: ${rows.length}`);
    await insertRows(client, tableName, rows);
  }

  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}

console.log(`API restore complete. Temporary staff passwords: ${temporaryPasswords}`);
