import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { randomBytes, scryptSync } from "node:crypto";
import path from "node:path";

const SCRYPT_VERSION = "v1";
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }

    cell += char;
  }

  cells.push(cell);
  return cells;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function sqlString(value) {
  if (value == null || value === "") {
    return "null";
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function createTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELIZATION,
    maxmem: SCRYPT_MAX_MEMORY,
  });

  return [
    "scrypt",
    SCRYPT_VERSION,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELIZATION,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

async function readUsers(csvPath) {
  const lines = createInterface({
    input: createReadStream(csvPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let headers = null;
  const users = [];

  for await (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const cells = parseCsvLine(line);

    if (!headers) {
      headers = cells;
      continue;
    }

    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));

    if (!row.id || !row.email) {
      throw new Error(`Auth users CSV row is missing id or email: ${line}`);
    }

    users.push(row);
  }

  return users;
}

async function main() {
  const input = readArg("--input");
  const sqlOutput = readArg("--sql-output");
  const passwordOutput = readArg("--password-output");

  if (!input || !sqlOutput || !passwordOutput) {
    console.error(
      "Usage: node scripts/migration/create-app-users.mjs --input auth_users.csv --sql-output app-users.sql --password-output temporary-passwords.csv",
    );
    process.exit(1);
  }

  const users = await readUsers(input);
  await mkdir(path.dirname(sqlOutput), { recursive: true });
  await mkdir(path.dirname(passwordOutput), { recursive: true });

  const sql = createWriteStream(sqlOutput, { encoding: "utf8" });
  const passwords = createWriteStream(passwordOutput, { encoding: "utf8" });

  passwords.write(["id", "email", "temporary_password"].map(csvEscape).join(",") + "\n");
  sql.write("begin;\n");

  for (const user of users) {
    const password = createTemporaryPassword();
    const passwordHash = hashPassword(password);
    const email = user.email.toLowerCase();
    const name = user.name || user.raw_name || null;
    const phone = user.phone || user.raw_phone || null;

    passwords.write(
      [user.id, email, password].map(csvEscape).join(",") + "\n",
    );

    sql.write(
      [
        "insert into public.app_users (id, email, password_hash, name, phone, is_active, password_reset_required, created_at)",
        `values (${sqlString(user.id)}::uuid, ${sqlString(email)}, ${sqlString(passwordHash)}, ${sqlString(name)}, ${sqlString(phone)}, true, true, ${sqlString(user.created_at)}::timestamptz)`,
        "on conflict (id) do update set",
        "  email = excluded.email,",
        "  password_hash = excluded.password_hash,",
        "  name = excluded.name,",
        "  phone = excluded.phone,",
        "  is_active = excluded.is_active,",
        "  password_reset_required = excluded.password_reset_required;\n",
      ].join("\n"),
    );
  }

  sql.write("commit;\n");
  sql.end();
  passwords.end();

  console.log(`Created ${users.length} app users.`);
  console.log(`SQL: ${sqlOutput}`);
  console.log(`Temporary passwords: ${passwordOutput}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
