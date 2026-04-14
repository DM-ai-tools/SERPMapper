import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * GET /api/report/[id]
 * Returns the full report with results and opportunity cards.
 * Used by shared report pages and polling during processing.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: "Report ID required" }, { status: 400 });

  const supabase = createAdminClient();

  const [reportRes, resultsRes, cardsRes] = await Promise.all([
    supabase.from("serpmap_reports").select("*").eq("report_id", id).single(),
    supabase
      .from("serpmap_results")
      .select("*")
      .eq("report_id", id)
      .order("monthly_volume", { ascending: false }),
    supabase
      .from("opportunity_cards")
      .select("*")
      .eq("report_id", id)
      .order("display_order", { ascending: true }),
  ]);

  if (reportRes.error || !reportRes.data) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({
    report: reportRes.data,
    results: resultsRes.data ?? [],
    cards: cardsRes.data ?? [],
  });
}
