import { Pool } from "pg";

// Singleton pool — reused across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

function createPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = createPool();
  }
  return global._pgPool;
}

/** Run a SELECT and return all rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query(sql, params);
  return result.rows as T[];
}

/** Run a SELECT and return the first row, or null. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const result = await getPool().query(sql, params);
  return (result.rows[0] ?? null) as T | null;
}

/** Run an INSERT / UPDATE / DELETE (returns nothing). */
export async function execute(sql: string, params?: unknown[]): Promise<void> {
  await getPool().query(sql, params);
}

/** Run an INSERT … RETURNING and return the first row. */
export async function insertReturning<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  const result = await getPool().query(sql, params);
  if (!result.rows[0]) throw new Error("INSERT returned no rows");
  return result.rows[0] as T;
}
