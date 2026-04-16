/**
 * GET /api/stream/[id]
 *
 * Server-Sent Events endpoint.
 *
 * Since /api/analyze now uses DataforSEO's synchronous Live endpoint,
 * the report is fully completed by the time the browser opens this stream.
 * We simply read the DB and send a single "complete" event.
 *
 * The SSE format is kept so the frontend EventSource code is unchanged.
 */

import { NextRequest } from "next/server";
import { query, queryOne } from "@/lib/db";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";

export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reportId = params.id;
  const encoder  = new TextEncoder();

  function sse(event: string, data: unknown) {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const report = await queryOne<SerpMapReport>(
          "SELECT * FROM serpmap_reports WHERE report_id = $1",
          [reportId]
        );

        if (!report) {
          controller.enqueue(sse("error", { message: "Report not found" }));
          controller.close();
          return;
        }

        // Always emit "report" first so the UI can show the header immediately
        controller.enqueue(sse("report", report));

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
          controller.enqueue(sse("complete", { report, results, cards }));
        } else {
          // Report is still processing (should be very brief with Live endpoint).
          // Poll DB every 3 s for up to 90 s.
          const start = Date.now();
          let done = false;

          while (!done && Date.now() - start < 90_000) {
            await sleep(3_000);

            const updated = await queryOne<SerpMapReport>(
              "SELECT * FROM serpmap_reports WHERE report_id = $1",
              [reportId]
            );

            if (updated?.status === "completed" || updated?.status === "partial") {
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
              controller.enqueue(sse("complete", { report: updated, results, cards }));
              done = true;
            }
          }

          if (!done) {
            controller.enqueue(sse("timeout", { message: "Processing is taking longer than expected. Refresh to check." }));
          }
        }
      } catch (err) {
        console.error("[stream] error:", err);
        controller.enqueue(sse("error", { message: "Internal error" }));
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
