import { NextRequest, NextResponse } from "next/server";
import { execute, query } from "@/lib/db";

/**
 * POST /api/webhooks/conversion
 *
 * Called by any future DotMappers product when a SERPMapper lead converts.
 * Auth: x-webhook-secret header must match WEBHOOK_SECRET env var.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { report_id?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { report_id, email } = body;

  if (!report_id && !email) {
    return NextResponse.json(
      { error: "Provide at least one of: report_id, email" },
      { status: 400 }
    );
  }

  try {
    let sql: string;
    let params: unknown[];

    if (report_id && email) {
      sql = `UPDATE serpmap_leads
             SET product_trial_started = TRUE, product_trial_started_at = NOW()
             WHERE report_id = $1 OR email = $2`;
      params = [report_id, email];
    } else if (report_id) {
      sql = `UPDATE serpmap_leads
             SET product_trial_started = TRUE, product_trial_started_at = NOW()
             WHERE report_id = $1`;
      params = [report_id];
    } else {
      sql = `UPDATE serpmap_leads
             SET product_trial_started = TRUE, product_trial_started_at = NOW()
             WHERE email = $1`;
      params = [email!];
    }

    await execute(sql, params);

    // Count affected rows
    const rows = await query<{ count: string }>(
      "SELECT COUNT(*) FROM serpmap_leads WHERE product_trial_started = TRUE AND product_trial_started_at > NOW() - INTERVAL '5 seconds'"
    );
    const updated = parseInt(rows[0]?.count ?? "0", 10);

    return NextResponse.json({ success: true, updated });
  } catch (err) {
    console.error("[conversion webhook] update failed:", err);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
