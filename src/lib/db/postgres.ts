import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

type GlobalWithPostgresPool = typeof globalThis & {
  __autoinstructorPostgresPool?: Pool;
};

const globalForPool = globalThis as GlobalWithPostgresPool;
const transactionClientStorage = new AsyncLocalStorage<PoolClient>();

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
  const executor = transactionClientStorage.getStore() ?? getPostgresPool();
  const result = await executor.query<T>(text, values);

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
  const executor = transactionClientStorage.getStore() ?? getPostgresPool();
  await executor.query(text, values);
}

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const existingClient = transactionClientStorage.getStore();

  if (existingClient) {
    return callback(existingClient);
  }

  const client = await getPostgresPool().connect();

  try {
    await client.query("begin");
    const result = await transactionClientStorage.run(client, () =>
      callback(client),
    );
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
