import sgMail from "@sendgrid/mail";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL ?? "hello@serpmap.com.au";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://serpmap.com.au";

// The CTA destination — currently a waitlist page.
// Change this single env var to the live product URL on launch day.
// No code changes required.
const LEAD_CTA_BASE_URL =
  process.env.LEAD_CTA_BASE_URL ?? "https://dotmappers.in/waitlist";

export interface NurtureEmailData {
  email: string;
  businessName: string;
  primaryKeyword: string;
  topMissedSuburb: string;
  reportId: string;
  visibilityScore: number;
}

/**
 * Send Email 1 — immediate confirmation with report link.
 */
export async function sendConfirmationEmail(data: NurtureEmailData): Promise<void> {
  const reportUrl = `${APP_URL}/report/${data.reportId}`;

  await sgMail.send({
    to: data.email,
    from: FROM_EMAIL,
    templateId: process.env.SENDGRID_TEMPLATE_CONFIRMATION!,
    dynamicTemplateData: {
      business_name: data.businessName,
      primary_keyword: data.primaryKeyword,
      visibility_score: data.visibilityScore,
      report_url: reportUrl,
    },
  });
}

/**
 * Enrol contact in the Day 3 + Day 7 SendGrid automation sequence.
 * Uses the SendGrid Contacts API to add the user with pre-filled custom fields
 * that the email templates reference as dynamic variables.
 */
export async function enrollInNurtureSequence(data: NurtureEmailData): Promise<void> {
  const ctaUrl = buildLeadCtaUrl({
    businessUrl: "",
    keyword: data.primaryKeyword,
    topSuburb: data.topMissedSuburb,
    reportId: data.reportId,
  });

  const contactsUrl = "https://api.sendgrid.com/v3/marketing/contacts";
  const payload = {
    contacts: [
      {
        email: data.email,
        custom_fields: {
          business_name:     data.businessName,
          primary_keyword:   data.primaryKeyword,
          top_missed_suburb: data.topMissedSuburb,
          report_url:        `${APP_URL}/report/${data.reportId}`,
          cta_url:           ctaUrl,
          visibility_score:  String(data.visibilityScore),
        },
      },
    ],
  };

  const res = await fetch(contactsUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[sendgrid] enrollInNurtureSequence failed:", res.status, text);
  }
}

// ──────────────────────────────────────────────
// Build the pre-filled lead CTA URL.
//
// Currently points to the DotMappers waitlist page.
// All URL parameters are pre-built and ready for any future product.
//
// To switch to a live product on launch day:
//   Set LEAD_CTA_BASE_URL=https://app.[product].com.au/trial
//   in your Vercel environment variables. No code change needed.
// ──────────────────────────────────────────────
export function buildLeadCtaUrl({
  businessUrl,
  keyword,
  topSuburb,
  reportId,
}: {
  businessUrl: string;
  keyword: string;
  topSuburb: string;
  reportId: string;
}): string {
  const params = new URLSearchParams({
    ...(businessUrl && { url: businessUrl }),
    keyword,
    suburb: topSuburb,
    source: "serpmap",
    report: reportId,
  });
  return `${LEAD_CTA_BASE_URL}?${params.toString()}`;
}

