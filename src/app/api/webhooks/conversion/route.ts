import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/webhooks/conversion
 *
 * Called by any future DotMappers product (e.g. via Stripe webhook)
 * when a SERPMapper lead converts to a paying customer.
 *
 * This endpoint is NOT dependent on any product existing — it simply
 * updates the serpmap_leads table to record the conversion for attribution.
 *
 * Expected body: { report_id?: string, email?: string }
 * Auth: x-webhook-secret header must match WEBHOOK_SECRET env var.
 *
 * Set the same WEBHOOK_SECRET in both SERPMapper and the converting product.
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

  const supabase = createAdminClient();

  let query = supabase
    .from("serpmap_leads")
    .update({
      product_trial_started: true,
      product_trial_started_at: new Date().toISOString(),
    });

  // Filter by report_id, email, or both
  if (report_id && email) {
    query = query.or(`report_id.eq.${report_id},email.eq.${email}`);
  } else if (report_id) {
    query = query.eq("report_id", report_id);
  } else if (email) {
    query = query.eq("email", email);
  }

  const { error, count } = await query;

  if (error) {
    console.error("[conversion webhook] update failed:", error.message);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, updated: count ?? 0 });
}
