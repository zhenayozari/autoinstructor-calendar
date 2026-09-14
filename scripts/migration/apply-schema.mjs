import fs from "node:fs/promises";
import pg from "pg";

const { Client } = pg;

function getArg(name) {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

const databaseUrl = getArg("--database-url") ?? process.env.DATABASE_URL;
const schemaPath = getArg("--schema") ?? "db/migrations/0001_initial.sql";

if (!databaseUrl && (!process.env.PGHOST || !process.env.PGDATABASE || !process.env.PGUSER)) {
  console.error("DATABASE_URL or PGHOST/PGDATABASE/PGUSER is required.");
  console.error(
    "Example: pnpm db:apply-schema -- --database-url postgresql://user:password@127.0.0.1:5432/autoinstructor_test",
  );
  process.exit(1);
}

const sql = await fs.readFile(schemaPath, "utf8");
const client = new Client(databaseUrl ? { connectionString: databaseUrl } : {});

try {
  await client.connect();
  await client.query(sql);
  console.log(`Schema applied from ${schemaPath}`);
} finally {
  await client.end();
}
