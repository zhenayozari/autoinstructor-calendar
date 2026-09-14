import "server-only";

import { Pool, type PoolClient, type QueryResultRow } from "pg";

type GlobalWithPostgresPool = typeof globalThis & {
  __autoinstructorPostgresPool?: Pool;
};

const globalForPool = globalThis as GlobalWithPostgresPool;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPostgresPool() {
  if (!globalForPool.__autoinstructorPostgresPool) {
    const connectionString = process.env.DATABASE_URL;

    globalForPool.__autoinstructorPostgresPool = new Pool({
      ...(connectionString ? { connectionString } : {}),
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    });
  }

  return globalForPool.__autoinstructorPostgresPool;
}

export async function queryRows<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const result = await getPostgresPool().query<T>(text, values);

  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  const rows = await queryRows<T>(text, values);

  return rows[0] ?? null;
}

export async function executeQuery(text: string, values: unknown[] = []) {
  await getPostgresPool().query(text, values);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const client = await getPostgresPool().connect();

  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
