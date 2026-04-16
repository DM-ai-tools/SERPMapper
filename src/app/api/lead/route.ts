import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { sendConfirmationEmail, enrollInNurtureSequence, buildLeadCtaUrl } from "@/lib/sendgrid";
import { getTopMissedSuburbs } from "@/lib/scoring";
import { LeadCaptureRequest, LeadCaptureResponse, SerpMapReport, SerpMapResult } from "@/lib/types";

/**
 * POST /api/lead
 * Captures an email, unlocks the full report, and triggers the SendGrid sequence.
 */
export async function POST(req: NextRequest) {
  try {
    const body: LeadCaptureRequest = await req.json();
    const { email, report_id, utm_source, utm_medium, utm_campaign } = body;

    if (!email || !report_id) {
      return NextResponse.json({ error: "email and report_id are required" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const [report, results] = await Promise.all([
      queryOne<SerpMapReport>(
        "SELECT * FROM serpmap_reports WHERE report_id = $1",
        [report_id]
      ),
      query<SerpMapResult>(
        "SELECT * FROM serpmap_results WHERE report_id = $1",
        [report_id]
      ),
    ]);

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const topMissed = getTopMissedSuburbs(results, 1);
    const topMissedSuburb = topMissed[0]?.suburb_name ?? report.city;
    const businessName = report.business_name ?? "Your business";

    // Upsert lead (idempotent)
    const lead = await queryOne<{ lead_id: string; sendgrid_sequence_started: boolean }>(
      `INSERT INTO serpmap_leads
         (email, report_id, business_name, business_url, primary_keyword,
          top_missed_suburb, utm_source, utm_medium, utm_campaign)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (email, report_id) DO UPDATE
         SET top_missed_suburb = EXCLUDED.top_missed_suburb,
             utm_source        = EXCLUDED.utm_source
       RETURNING lead_id, sendgrid_sequence_started`,
      [email, report_id, businessName, report.business_url,
       report.keyword, topMissedSuburb,
       utm_source ?? "direct", utm_medium ?? null, utm_campaign ?? null]
    );

    if (!lead) throw new Error("Lead upsert returned no row");

    // Only trigger emails once per lead
    if (!lead.sendgrid_sequence_started) {
      const emailData = {
        email,
        businessName,
        primaryKeyword: report.keyword,
        topMissedSuburb,
        reportId: report_id,
        visibilityScore: report.visibility_score ?? 0,
      };

      await Promise.allSettled([
        sendConfirmationEmail(emailData),
        enrollInNurtureSequence(emailData),
      ]);

      await execute(
        "UPDATE serpmap_leads SET sendgrid_sequence_started = TRUE WHERE lead_id = $1",
        [lead.lead_id]
      );
    }

    const leadCtaUrl = buildLeadCtaUrl({
      businessUrl: report.business_url,
      keyword: report.keyword,
      topSuburb: topMissedSuburb,
      reportId: report_id,
    });

    const response: LeadCaptureResponse = { success: true, lead_id: lead.lead_id };
    return NextResponse.json({ ...response, ctaUrl: leadCtaUrl, topMissedSuburb });
  } catch (err) {
    console.error("[lead] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
