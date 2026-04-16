/**
 * Supabase has been replaced by a direct PostgreSQL (pg) connection.
 * This file is kept only so that any remaining imports don't break.
 * All real database logic now lives in src/lib/db.ts.
 */
export { getPool as createAdminClient } from "./db";
