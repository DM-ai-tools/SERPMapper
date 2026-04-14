/**
 * Supabase Edge Function: poll-dataforseo
 *
 * Polls DataforSEO for completed Local Pack task results and writes them
 * back to serpmap_results. This function is called every 5 seconds by a
 * pg_cron job (or HTTP trigger from the Next.js API layer) until the
 * report reaches "completed" or "partial" status.
 *
 * Deploy: supabase functions deploy poll-dataforseo
 * Trigger: pg_cron every 5 seconds, or POST from Next.js API
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

Deno.serve(async (req: Request) => {
  // Accept both GET (cron trigger) and POST (manual/API trigger with report_id)
  let targetReportId: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      targetReportId = body.report_id ?? null;
    } catch {
      // ignore
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const dfsLogin = Deno.env.get("DATAFORSEO_LOGIN")!;
  const dfsPassword = Deno.env.get("DATAFORSEO_PASSWORD")!;

  const supabase = createClient(supabaseUrl, serviceKey);
  const authHeader = "Basic " + btoa(`${dfsLogin}:${dfsPassword}`);

  // ──────────────────────────────────────────────
  // 1. Find all "processing" result rows
  //    (optionally filtered to a single report)
  // ──────────────────────────────────────────────
  let query = supabase
    .from("serpmap_results")
    .select("result_id, report_id, suburb_id, dataforseo_task_id, suburb_name, monthly_volume")
    .eq("dataforseo_status", "processing")
    .not("dataforseo_task_id", "is", null)
    .limit(100);

  if (targetReportId) {
    query = query.eq("report_id", targetReportId);
  }

  const { data: pendingResults, error: fetchErr } = await query;

  if (fetchErr || !pendingResults?.length) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "No pending results" }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // ──────────────────────────────────────────────
  // 2. Poll DataforSEO for ready tasks
  // ──────────────────────────────────────────────
  const readyRes = await fetch(`${DATAFORSEO_BASE}/serp/google/maps/tasks_ready`, {
    headers: { Authorization: authHeader },
  });
  const readyData = await readyRes.json();
  const readyTaskIds = new Set<string>(
    (readyData.tasks?.[0]?.result ?? []).map((t: { id: string }) => t.id)
  );

  // ──────────────────────────────────────────────
  // 3. Retrieve results for ready tasks
  // ──────────────────────────────────────────────
  const processedReports = new Set<string>();
  let processedCount = 0;

  for (const row of pendingResults) {
    if (!readyTaskIds.has(row.dataforseo_task_id)) continue;

    try {
      const taskRes = await fetch(
        `${DATAFORSEO_BASE}/serp/google/maps/task_get/advanced/${row.dataforseo_task_id}`,
        { headers: { Authorization: authHeader } }
      );
      const taskData = await taskRes.json();
      const items = taskData.tasks?.[0]?.result?.[0]?.items ?? [];

      // Get the report's business_url for domain matching
      const { data: reportData } = await supabase
        .from("serpmap_reports")
        .select("business_url, business_name")
        .eq("report_id", row.report_id)
        .single();

      const { position, inLocalPack } = findBusinessRank(
        items,
        reportData?.business_url ?? "",
        reportData?.business_name
      );

      await supabase
        .from("serpmap_results")
        .update({
          rank_position: position,
          is_in_local_pack: inLocalPack,
          dataforseo_status: "completed",
          updated_at: new Date().toISOString(),
        })
        .eq("result_id", row.result_id);

      processedReports.add(row.report_id);
      processedCount++;
    } catch (err) {
      console.error(`Error processing task ${row.dataforseo_task_id}:`, err);
      // Mark as error — frontend shows grey for these
      await supabase
        .from("serpmap_results")
        .update({ dataforseo_status: "error", updated_at: new Date().toISOString() })
        .eq("result_id", row.result_id);
    }
  }

  // ──────────────────────────────────────────────
  // 4. Check if any reports are now complete
  //    (all results resolved or timed out after 45s)
  // ──────────────────────────────────────────────
  for (const reportId of processedReports) {
    await maybeCompleteReport(supabase, reportId, dfsLogin, dfsPassword);
  }

  return new Response(
    JSON.stringify({ ok: true, processed: processedCount }),
    { headers: { "Content-Type": "application/json" } }
  );
});

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

interface DFSItem {
  rank_group: number;
  rank_absolute: number;
  domain?: string;
  url?: string;
  title?: string;
}

function findBusinessRank(
  items: DFSItem[],
  businessUrl: string,
  businessName?: string | null
): { position: number | null; inLocalPack: boolean } {
  const normUrl = normaliseDomain(businessUrl);

  for (const item of items) {
    const itemDomain = normaliseDomain(item.domain ?? item.url ?? "");
    if (itemDomain && itemDomain === normUrl) {
      return { position: item.rank_absolute, inLocalPack: item.rank_group <= 3 };
    }
    if (businessName && item.title) {
      if (levenshtein(item.title.toLowerCase(), businessName.toLowerCase()) < 3) {
        return { position: item.rank_absolute, inLocalPack: item.rank_group <= 3 };
      }
    }
  }

  return { position: null, inLocalPack: false };
}

function normaliseDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .split("?")[0];
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

// deno-lint-ignore no-explicit-any
async function maybeCompleteReport(supabase: any, reportId: string, dfsLogin: string, dfsPassword: string) {
  const { data: allResults } = await supabase
    .from("serpmap_results")
    .select("dataforseo_status, rank_position, suburb_name, monthly_volume")
    .eq("report_id", reportId);

  if (!allResults) return;

  const total = allResults.length;
  const resolved = allResults.filter(
    (r: { dataforseo_status: string }) =>
      r.dataforseo_status === "completed" || r.dataforseo_status === "error"
  ).length;

  // Check 45-second timeout
  const { data: report } = await supabase
    .from("serpmap_reports")
    .select("created_at, status, business_url, business_name, keyword")
    .eq("report_id", reportId)
    .single();

  if (!report || report.status === "completed") return;

  const ageSeconds = (Date.now() - new Date(report.created_at).getTime()) / 1000;
  const shouldComplete = resolved >= total || (resolved / total >= 0.95) || ageSeconds > 45;

  if (!shouldComplete) return;

  // Calculate visibility score
  const score = calculateVisibilityScore(allResults);

  // Generate Claude summaries
  const { summaryText, ctaCopy, cardRows } = await generateAISummaries(
    supabase,
    reportId,
    report,
    allResults,
    score
  );

  // Update report to completed
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("serpmap_reports")
    .update({
      status: "completed",
      visibility_score: score,
      summary_text: summaryText,
      cta_copy: ctaCopy,
      suburbs_checked: resolved,
      completed_at: new Date().toISOString(),
      cached_until: expiresAt,
    })
    .eq("report_id", reportId);

  // Write opportunity cards
  if (cardRows.length > 0) {
    await supabase.from("opportunity_cards").insert(cardRows);
  }

  // Write cache index
  const { data: reportFull } = await supabase
    .from("serpmap_reports")
    .select("cache_key")
    .eq("report_id", reportId)
    .single();

  if (reportFull?.cache_key) {
    await supabase.from("serpmap_cache_index").upsert({
      cache_key: reportFull.cache_key,
      report_id: reportId,
      expires_at: expiresAt,
    });
  }
}

interface ResultRow {
  rank_position: number | null;
  monthly_volume: number;
  suburb_name: string;
  dataforseo_status: string;
}

function calculateVisibilityScore(results: ResultRow[]): number {
  if (!results.length) return 0;
  const maxVol = Math.max(...results.map((r) => r.monthly_volume || 0), 1);
  let sum = 0, total = 0;
  for (const r of results) {
    const volWeight = (r.monthly_volume || 0) / maxVol;
    const rankWeight =
      r.rank_position === null ? 0
      : r.rank_position <= 3 ? 1.0
      : r.rank_position <= 10 ? 0.6
      : r.rank_position <= 20 ? 0.3
      : 0;
    sum += rankWeight * volWeight;
    total += volWeight;
  }
  return total === 0 ? 0 : Math.round((sum / total) * 100);
}

// deno-lint-ignore no-explicit-any
async function generateAISummaries(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  reportId: string,
  report: { business_url: string; business_name: string | null; keyword: string },
  results: ResultRow[],
  score: number
) {
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
  const MODEL = "claude-haiku-4-5-20251001";

  const rankingCount = results.filter((r) => r.rank_position !== null).length;
  const missed = results
    .filter((r) => r.rank_position === null)
    .sort((a, b) => (b.monthly_volume || 0) - (a.monthly_volume || 0))
    .slice(0, 5);

  const businessName = report.business_name ?? report.business_url;

  async function claude(prompt: string, maxTokens = 200): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    return data.content?.[0]?.text?.trim() ?? "";
  }

  const summaryPrompt = `Write a 2-3 sentence plain-English visibility summary for a local business owner.
Business: ${businessName}
Keyword: ${report.keyword}
Score: ${score}/100
Ranking in: ${rankingCount} of ${results.length} suburbs
Top missed suburbs: ${missed.slice(0, 2).map((s) => s.suburb_name).join(", ")}
Be specific, direct, data-driven. No markdown. No asterisks.`;

  const ctaPrompt = `Write a single CTA sentence encouraging a local business owner to improve their Google Maps visibility. Max 20 words. No exclamation marks.
Business: ${businessName}
Keyword: ${report.keyword}
Top missed suburb: ${missed[0]?.suburb_name ?? "your area"}`;

  const [summaryText, ctaCopy] = await Promise.all([
    claude(summaryPrompt, 200),
    claude(ctaPrompt, 80),
  ]);

  // Opportunity cards
  const cardRows = [];
  if (missed.length > 0) {
    const cardPrompt = `Write ${missed.length} opportunity cards, one per line, numbered 1. 2. etc.
Each card is one sentence. Name the suburb and volume. Frame as missed opportunity.
Business: ${businessName} | Keyword: ${report.keyword}
${missed.map((s, i) => `${i + 1}. ${s.suburb_name} (${s.monthly_volume}/mo)`).join("\n")}
No markdown. No asterisks.`;

    const cardText = await claude(cardPrompt, 400);
    const cardLines = cardText
      .split("\n")
      .filter((l: string) => l.match(/^\d+\./))
      .map((l: string) => l.replace(/^\d+\.\s*/, "").trim());

    for (let i = 0; i < missed.length; i++) {
      cardRows.push({
        report_id: reportId,
        suburb_name: missed[i].suburb_name,
        rank_position: null,
        monthly_volume: missed[i].monthly_volume,
        card_text: cardLines[i] ?? `${missed[i].suburb_name} has ${missed[i].monthly_volume} monthly searches — you are not visible here.`,
        display_order: i,
      });
    }
  }

  return { summaryText, ctaCopy, cardRows };
}
