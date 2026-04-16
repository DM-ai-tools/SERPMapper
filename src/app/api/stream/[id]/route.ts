/**
 * GET /api/stream/[id]
 *
 * Server-Sent Events stream that replaces the Supabase Edge Function (poll-dataforseo).
 * - Opens immediately and sends the current report state.
 * - If the report is already complete, sends one "complete" event and closes.
 * - Otherwise polls DataforSEO every 5 s, writes results to PostgreSQL, and
 *   streams "result" events to the frontend as each suburb resolves.
 * - When ≥95 % complete (or after 45 s), generates Claude summaries, marks the
 *   report completed, writes opportunity cards, and sends a final "complete" event.
 */

import { NextRequest } from "next/server";
import { query, queryOne, execute, insertReturning } from "@/lib/db";
import { getReadyTaskIds, getTaskResult, findBusinessRank } from "@/lib/dataforseo";
import {
  generateVisibilitySummary,
  generateOpportunityCards,
  generateCtaCopy,
} from "@/lib/claude";
import { calculateVisibilityScore, getTopMissedSuburbs, buildReportSummary } from "@/lib/scoring";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";

export const maxDuration = 60; // Vercel / local: keep alive up to 60 s

const POLL_INTERVAL_MS = 5_000;
const MAX_DURATION_MS = 55_000; // close before the 60 s hard limit

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reportId = params.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      function send(event: string, data: unknown) {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      function close() {
        if (closed) return;
        closed = true;
        try { controller.close(); } catch { /* already closed */ }
      }

      // Close cleanly if the client disconnects
      req.signal.addEventListener("abort", () => { closed = true; });

      try {
        const report = await queryOne<SerpMapReport>(
          "SELECT * FROM serpmap_reports WHERE report_id = $1",
          [reportId]
        );

        if (!report) {
          send("error", { message: "Report not found" });
          close();
          return;
        }

        // Send initial snapshot so the UI can render immediately
        send("report", report);

        // Already finished — send everything and exit
        if (report.status === "completed" || report.status === "partial") {
          const [results, cards] = await Promise.all([
            query<SerpMapResult>(
              "SELECT * FROM serpmap_results WHERE report_id = $1 ORDER BY monthly_volume DESC",
              [reportId]
            ),
            query<OpportunityCard>(
              "SELECT * FROM opportunity_cards WHERE report_id = $1 ORDER BY display_order ASC",
              [reportId]
            ),
          ]);
          send("complete", { report, results, cards });
          close();
          return;
        }

        // ──────────────────────────────────────────
        // Poll DataforSEO until complete or timeout
        // ──────────────────────────────────────────
        const startTime = Date.now();

        while (!closed && Date.now() - startTime < MAX_DURATION_MS) {
          const pending = await query<SerpMapResult>(
            `SELECT * FROM serpmap_results
             WHERE report_id = $1
               AND dataforseo_status = 'processing'
               AND dataforseo_task_id IS NOT NULL
             LIMIT 100`,
            [reportId]
          );

          if (pending.length === 0) break;

          // Ask DataforSEO which tasks are ready
          let readyIds: string[];
          try {
            readyIds = await getReadyTaskIds();
          } catch (e) {
            console.warn("[stream] DataforSEO tasks_ready failed:", e);
            await sleep(POLL_INTERVAL_MS);
            continue;
          }

          const readySet = new Set(readyIds);

          // Fetch report row for business matching (once per poll cycle)
          const bizInfo = await queryOne<{ business_url: string; business_name: string | null }>(
            "SELECT business_url, business_name FROM serpmap_reports WHERE report_id = $1",
            [reportId]
          );

          for (const row of pending) {
            if (closed) break;
            if (!row.dataforseo_task_id || !readySet.has(row.dataforseo_task_id)) continue;

            try {
              const taskResult = await getTaskResult(row.dataforseo_task_id);
              const { position, inLocalPack } = taskResult
                ? findBusinessRank(taskResult, bizInfo?.business_url ?? "", bizInfo?.business_name)
                : { position: null, inLocalPack: false };

              await execute(
                `UPDATE serpmap_results
                 SET rank_position = $1, is_in_local_pack = $2,
                     dataforseo_status = 'completed', updated_at = NOW()
                 WHERE result_id = $3`,
                [position, inLocalPack, row.result_id]
              );

              const updated = await queryOne<SerpMapResult>(
                "SELECT * FROM serpmap_results WHERE result_id = $1",
                [row.result_id]
              );
              if (updated) send("result", updated);
            } catch (err) {
              console.error("[stream] task error:", err);
              await execute(
                "UPDATE serpmap_results SET dataforseo_status = 'error', updated_at = NOW() WHERE result_id = $1",
                [row.result_id]
              );
            }
          }

          // Check completion criteria
          const allResults = await query<SerpMapResult>(
            "SELECT * FROM serpmap_results WHERE report_id = $1",
            [reportId]
          );
          const resolved = allResults.filter(
            (r) => r.dataforseo_status === "completed" || r.dataforseo_status === "error"
          ).length;
          const ageSeconds = (Date.now() - startTime) / 1000;
          const shouldComplete =
            resolved >= allResults.length ||
            resolved / allResults.length >= 0.95 ||
            ageSeconds > 45;

          if (shouldComplete && !closed) {
            await completeReport(reportId, report, allResults, bizInfo);

            const [finalReport, cards] = await Promise.all([
              queryOne<SerpMapReport>(
                "SELECT * FROM serpmap_reports WHERE report_id = $1",
                [reportId]
              ),
              query<OpportunityCard>(
                "SELECT * FROM opportunity_cards WHERE report_id = $1 ORDER BY display_order ASC",
                [reportId]
              ),
            ]);

            send("complete", { report: finalReport, results: allResults, cards });
            close();
            return;
          }

          await sleep(POLL_INTERVAL_MS);
        }

        // Timed out without completing — let the client know
        if (!closed) {
          send("timeout", { message: "Processing is taking longer than expected. Refresh to check status." });
          close();
        }
      } catch (err) {
        console.error("[stream] fatal error:", err);
        if (!closed) {
          send("error", { message: "Internal processing error" });
          close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function completeReport(
  reportId: string,
  report: SerpMapReport,
  allResults: SerpMapResult[],
  bizInfo: { business_url: string; business_name: string | null } | null
) {
  const score = calculateVisibilityScore(allResults);
  const businessName = bizInfo?.business_name ?? bizInfo?.business_url ?? "";
  const summary = buildReportSummary(allResults, businessName, report.keyword);
  const missed = getTopMissedSuburbs(allResults, 5);

  let summaryText = "";
  let ctaCopy = "";
  let cardTexts: string[] = [];

  try {
    [summaryText, ctaCopy, cardTexts] = await Promise.all([
      generateVisibilitySummary(summary),
      generateCtaCopy(businessName, report.keyword, missed[0]?.suburb_name ?? null),
      missed.length > 0
        ? generateOpportunityCards(
            businessName,
            report.keyword,
            missed.map((s) => ({ name: s.suburb_name, volume: s.monthly_volume }))
          )
        : Promise.resolve([]),
    ]);
  } catch (aiErr) {
    console.warn("[stream] AI generation failed, using fallback:", aiErr);
    summaryText = `Your business ranks in ${allResults.filter((r) => r.rank_position !== null).length} of ${allResults.length} suburbs with a visibility score of ${score}/100.`;
  }

  const resolved = allResults.filter(
    (r) => r.dataforseo_status === "completed" || r.dataforseo_status === "error"
  ).length;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await execute(
    `UPDATE serpmap_reports
     SET status = 'completed', visibility_score = $1, summary_text = $2, cta_copy = $3,
         suburbs_checked = $4, completed_at = NOW(), cached_until = $5
     WHERE report_id = $6`,
    [score, summaryText, ctaCopy, resolved, expiresAt, reportId]
  );

  // Opportunity cards
  for (let i = 0; i < missed.length; i++) {
    const text =
      cardTexts[i] ??
      `${missed[i].suburb_name} has ${missed[i].monthly_volume} monthly searches — you are not visible here.`;
    await execute(
      `INSERT INTO opportunity_cards
         (report_id, suburb_name, rank_position, monthly_volume, card_text, display_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [reportId, missed[i].suburb_name, null, missed[i].monthly_volume, text, i]
    );
  }

  // Cache index
  if (report.cache_key) {
    await execute(
      `INSERT INTO serpmap_cache_index (cache_key, report_id, expires_at)
       VALUES ($1,$2,$3)
       ON CONFLICT (cache_key) DO UPDATE SET report_id = $2, expires_at = $3`,
      [report.cache_key, reportId, expiresAt]
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
