import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

// Singleton pool — reused across hot-reloads in dev
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

declare global {
  // eslint-disable-next-line no-var
  var _pgCoreSchema: Promise<void> | undefined;
}

// Migration promise — OTP columns after core schema exists
declare global {
  // eslint-disable-next-line no-var
  var _pgMigration: Promise<void> | undefined;
}

function createPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
}

export function getPool(): Pool {
  if (!global._pgPool) {
    global._pgPool = createPool();
  }
  return global._pgPool;
}

/** Find migrations/ when cwd is repo root or nested (e.g. monorepo). */
function resolveMigrationsDir(): string {
  const candidates = [
    join(process.cwd(), "migrations"),
    join(process.cwd(), "serpmapper", "migrations"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "postgres_schema.sql"))) return dir;
  }
  return join(process.cwd(), "migrations");
}

/**
 * Apply core DDL from migrations/postgres_schema.sql (idempotent).
 * Required on fresh hosts (e.g. Railway Postgres) where tables were never created.
 */
async function ensureCoreSchema(): Promise<void> {
  if (global._pgCoreSchema) return global._pgCoreSchema;

  global._pgCoreSchema = (async () => {
    const dir = resolveMigrationsDir();
    const main = join(dir, "postgres_schema.sql");
    if (!existsSync(main)) {
      throw new Error(
        `Database bootstrap: missing ${main}. Deploy the migrations folder with your app.`
      );
    }
    let sql = readFileSync(main, "utf8");
    const volCache = join(dir, "003_keyword_volume_cache.sql");
    if (existsSync(volCache)) {
      sql += "\n\n" + readFileSync(volCache, "utf8");
    }
    sql += `
ALTER TABLE suburb_coordinates ADD COLUMN IF NOT EXISTS search_volumes JSONB DEFAULT '{}'::jsonb;
ALTER TABLE serpmap_reports ADD COLUMN IF NOT EXISTS maps_search_query TEXT;
`;
    await getPool().query(sql);
  })();

  return global._pgCoreSchema;
}

/**
 * Ensure tables exist (fresh DB) and optional column upgrades (OTP on leads).
 * Call after confirming DATABASE_URL is set, before other queries.
 */
export async function ensureDatabaseReady(): Promise<void> {
  await ensureCoreSchema();
  if (!global._pgMigration) {
    global._pgMigration = (async () => {
      try {
        await getPool().query(`
          ALTER TABLE serpmap_leads
            ADD COLUMN IF NOT EXISTS otp_code        TEXT,
            ADD COLUMN IF NOT EXISTS otp_expires_at  TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS email_verified  BOOLEAN DEFAULT FALSE
        `);
      } catch {
        // Non-fatal if table missing in odd edge cases
      }
    })();
  }
  return global._pgMigration;
}

/** @deprecated Use ensureDatabaseReady — same behavior */
export async function ensureMigrations(): Promise<void> {
  return ensureDatabaseReady();
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
