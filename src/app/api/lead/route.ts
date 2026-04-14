import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendConfirmationEmail, enrollInNurtureSequence, buildLeadCtaUrl } from "@/lib/sendgrid";
import { getTopMissedSuburbs } from "@/lib/scoring";
import { LeadCaptureRequest, LeadCaptureResponse } from "@/lib/types";

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

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Get report + results for lead enrichment
    const [reportRes, resultsRes] = await Promise.all([
      supabase.from("serpmap_reports").select("*").eq("report_id", report_id).single(),
      supabase.from("serpmap_results").select("*").eq("report_id", report_id),
    ]);

    if (reportRes.error || !reportRes.data) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const report = reportRes.data;
    const results = resultsRes.data ?? [];

    const topMissed = getTopMissedSuburbs(results, 1);
    const topMissedSuburb = topMissed[0]?.suburb_name ?? report.city;
    const businessName = report.business_name ?? "Your business";

    // Upsert lead (idempotent — same email + report_id is safe to re-submit)
    const { data: lead, error: leadError } = await supabase
      .from("serpmap_leads")
      .upsert(
        {
          email,
          report_id,
          business_name: businessName,
          business_url: report.business_url,
          primary_keyword: report.keyword,
          top_missed_suburb: topMissedSuburb,
          utm_source: utm_source ?? "direct",
          utm_medium: utm_medium ?? null,
          utm_campaign: utm_campaign ?? null,
        },
        { onConflict: "email,report_id", ignoreDuplicates: false }
      )
      .select("lead_id, sendgrid_sequence_started")
      .single();

    if (leadError || !lead) {
      throw new Error(`Lead upsert failed: ${leadError?.message}`);
    }

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

      await supabase
        .from("serpmap_leads")
        .update({ sendgrid_sequence_started: true })
        .eq("lead_id", lead.lead_id);
    }

    const leadCtaUrl = buildLeadCtaUrl({
      businessUrl: report.business_url,
      keyword: report.keyword,
      topSuburb: topMissedSuburb,
      reportId: report_id,
    });

    const response: LeadCaptureResponse = {
      success: true,
      lead_id: lead.lead_id,
    };

    return NextResponse.json({ ...response, ctaUrl: leadCtaUrl, topMissedSuburb });
  } catch (err) {
    console.error("[lead] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
