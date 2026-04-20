/**
 * Calls POST /api/analyze on a running dev server (default http://localhost:3000).
 * Expects 422 (no GBP match) or 200 — not 500 — for a junk URL (fast failure path).
 *
 * Usage:
 *   1. Terminal A: npm run dev
 *   2. Terminal B:   node scripts/smoke-analyze.mjs
 *
 * Optional: ANALYZE_BASE_URL=http://localhost:3001 node scripts/smoke-analyze.mjs
 */
const base = (process.env.ANALYZE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

async function main() {
  const res = await fetch(`${base}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://zzzz-nonexistent-test-domain.invalid",
      keyword: "plumber",
      city: "Melbourne",
      radius_km: 5,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("FAIL: Non-JSON response", res.status, text.slice(0, 200));
    process.exit(1);
  }

  console.log("HTTP", res.status);
  console.log(JSON.stringify(json, null, 2));

  if (res.status === 500) {
    console.error(
      "\nFAIL: Still returning 500. In dev, check JSON.detail for the underlying error."
    );
    process.exit(1);
  }

  if (res.status === 422 || res.status === 200 || res.status === 502 || res.status === 503) {
    console.log("\nOK: Route responded with a structured status (not an unhandled 500).");
    process.exit(0);
  }

  console.warn("\nWARN: Unexpected status — inspect response above.");
  process.exit(0);
}

main().catch((e) => {
  if (e?.name === "TimeoutError" || String(e).includes("aborted due to timeout")) {
    console.error(
      "FAIL: Request timed out (server not responding in time).\n" +
        "  • Start the app in another terminal: npm run dev\n" +
        "  • If DATABASE_URL points at an unreachable host, pg connect can hang — fix DB or unset DATABASE_URL for a quick 503 check.\n",
      e.message
    );
    process.exit(1);
  }
  if (String(e).includes("fetch failed") || e?.cause?.code === "ECONNREFUSED") {
    console.error(
      "FAIL: Could not connect. Start the app first: npm run dev\n",
      e.message
    );
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});
