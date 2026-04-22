import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute, query, ensureMigrations } from "@/lib/db";
import { buildLeadCtaUrl, sendReportEmail } from "@/lib/sendgrid";
import { SerpMapReport, SerpMapResult } from "@/lib/types";
import { getTopMissedSuburbs } from "@/lib/scoring";

const PRIMARY_DEVICE = "desktop";

interface VerifyRequest {
  email: string;
  report_id: string;
  code: string;
}

interface LeadRow {
  lead_id: string;
  otp_code: string | null;
  otp_expires_at: string | null;
  email_verified: boolean;
  sendgrid_sequence_started: boolean;
  top_missed_suburb: string | null;
  business_name: string | null;
}

/**
 * POST /api/verify
 * Checks the OTP code, marks the lead as verified, triggers the full report email,
 * and returns the CTA URL so the client can unlock the report.
 */
export async function POST(req: NextRequest) {
  try {
    await ensureMigrations();

    const body: VerifyRequest = await req.json();
    const { email, report_id, code } = body;

    if (!email || !report_id || !code) {
      return NextResponse.json({ error: "email, report_id and code are required" }, { status: 400 });
    }

    const lead = await queryOne<LeadRow>(
      `SELECT lead_id, otp_code, otp_expires_at, email_verified,
              sendgrid_sequence_started, top_missed_suburb, business_name
       FROM serpmap_leads
       WHERE email = $1 AND report_id = $2`,
      [email, report_id]
    );

    if (!lead) {
      return NextResponse.json({ error: "No verification request found for this email." }, { status: 404 });
    }

    // Already verified — let them through
    if (lead.email_verified) {
      const report = await queryOne<SerpMapReport>(
        "SELECT * FROM serpmap_reports WHERE report_id = $1", [report_id]
      );
      const ctaUrl = report
        ? buildLeadCtaUrl({ businessUrl: report.business_url, keyword: report.keyword, topSuburb: lead.top_missed_suburb ?? report.city, reportId: report_id })
        : "";
      return NextResponse.json({ success: true, ctaUrl, topMissedSuburb: lead.top_missed_suburb });
    }

    // Check code
    if (!lead.otp_code || lead.otp_code !== code.trim()) {
      return NextResponse.json({ error: "Incorrect code. Please check your email and try again." }, { status: 400 });
    }

    // Check expiry
    if (lead.otp_expires_at && new Date(lead.otp_expires_at) < new Date()) {
      return NextResponse.json({ error: "This code has expired. Please request a new one." }, { status: 400 });
    }

    // Mark verified
    await execute(
      "UPDATE serpmap_leads SET email_verified = TRUE, otp_code = NULL WHERE lead_id = $1",
      [lead.lead_id]
    );

    // Fetch report + results for full email
    const [report, results] = await Promise.all([
      queryOne<SerpMapReport>("SELECT * FROM serpmap_reports WHERE report_id = $1", [report_id]),
      query<SerpMapResult>(
        "SELECT * FROM serpmap_results WHERE report_id = $1 AND (device_type = $2 OR device_type IS NULL)",
        [report_id, PRIMARY_DEVICE]
      ),
    ]);

    const topMissedSuburb = lead.top_missed_suburb ?? report?.city ?? "";
    const businessName    = lead.business_name ?? report?.business_name ?? "Your business";

    // Send full report email (fire-and-forget)
    if (report && !lead.sendgrid_sequence_started) {
      const topMissed = getTopMissedSuburbs(results, 1);

      sendReportEmail({
        email,
        businessName,
        primaryKeyword:  report.keyword,
        topMissedSuburb: topMissed[0]?.suburb_name ?? topMissedSuburb,
        reportId:        report_id,
        visibilityScore: report.visibility_score ?? 0,
        suburbResults:   results.map(r => ({
          suburb_name:      r.suburb_name,
          rank_position:    r.rank_position,
          is_in_local_pack: r.is_in_local_pack,
          monthly_volume:   r.monthly_volume,
        })),
      }).catch(err => console.error("[verify] report email failed:", err?.response?.body ?? err));

      execute(
        "UPDATE serpmap_leads SET sendgrid_sequence_started = TRUE WHERE lead_id = $1",
        [lead.lead_id]
      ).catch(() => {});
    }

    const ctaUrl = report
      ? buildLeadCtaUrl({ businessUrl: report.business_url, keyword: report.keyword, topSuburb: topMissedSuburb, reportId: report_id })
      : "";

    return NextResponse.json({ success: true, ctaUrl, topMissedSuburb });
  } catch (err) {
    console.error("[verify] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
