/**
 * Runs once per Node server process. Bootstraps Postgres schema on fresh DBs (e.g. Railway).
 * Skips when DATABASE_URL is unset (local build without DB).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (!process.env.DATABASE_URL?.trim()) return;
  try {
    const { ensureDatabaseReady } = await import("@/lib/db");
    await ensureDatabaseReady();
  } catch (err) {
    console.error("[instrumentation] ensureDatabaseReady failed:", err);
  }
}
