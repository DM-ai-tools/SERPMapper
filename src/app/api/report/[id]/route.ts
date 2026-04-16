import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";

/**
 * GET /api/report/[id]
 * Returns the full report with results and opportunity cards.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: "Report ID required" }, { status: 400 });

  const [report, results, cards] = await Promise.all([
    queryOne<SerpMapReport>(
      "SELECT * FROM serpmap_reports WHERE report_id = $1",
      [id]
    ),
    query<SerpMapResult>(
      "SELECT * FROM serpmap_results WHERE report_id = $1 ORDER BY monthly_volume DESC",
      [id]
    ),
    query<OpportunityCard>(
      "SELECT * FROM opportunity_cards WHERE report_id = $1 ORDER BY display_order ASC",
      [id]
    ),
  ]);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({ report, results, cards });
}
