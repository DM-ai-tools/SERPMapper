import sgMail from "@sendgrid/mail";
import { isVisiblePosition } from "./scoring";

sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

const FROM_EMAIL   = process.env.SENDGRID_FROM_EMAIL ?? "hello@serpmap.com.au";
const APP_URL      = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const LEAD_CTA_BASE_URL =
  process.env.LEAD_CTA_BASE_URL ?? "https://trafficradius.com.au/contact-us/";

export interface NurtureEmailData {
  email: string;
  businessName: string;
  primaryKeyword: string;
  topMissedSuburb: string;
  reportId: string;
  visibilityScore: number;
}

export interface ReportEmailData extends NurtureEmailData {
  suburbResults: Array<{
    suburb_name: string;
    rank_position: number | null;
    is_in_local_pack: boolean;
    monthly_volume: number;
  }>;
}

// ── Rank band helpers ─────────────────────────────────────────
function rankLabel(pos: number | null): string {
  if (pos === null) return "Not visible";
  if (pos <= 3)     return `#${pos} — Top 3 ✅`;
  if (pos <= 10)    return `#${pos} — Page 1`;
  if (pos <= 20)    return `#${pos} — Page 2`;
  return `#${pos} — Not visible`;
}

function rankColor(pos: number | null): string {
  if (pos === null) return "#ef4444";
  if (pos <= 3)     return "#22c55e";
  if (pos <= 10)    return "#86efac";
  if (pos <= 20)    return "#fcd34d";
  return "#ef4444";
}

// ── Inline HTML email template ────────────────────────────────
function buildReportEmailHtml(data: ReportEmailData): string {
  const reportUrl = `${APP_URL}/report/${data.reportId}`;
  const ranked    = data.suburbResults.filter(r => isVisiblePosition(r.rank_position));
  const top3      = ranked.filter(r => r.rank_position! <= 3);
  const missed    = data.suburbResults.filter(r => !isVisiblePosition(r.rank_position));

  const suburbRows = data.suburbResults
    .sort((a, b) => {
      if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
      if (a.rank_position !== null) return -1;
      if (b.rank_position !== null) return 1;
      return (b.monthly_volume || 0) - (a.monthly_volume || 0);
    })
    .slice(0, 20) // top 20 rows in email
    .map(r => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b">${r.suburb_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;text-align:center">
          <span style="background:${rankColor(r.rank_position)}20;color:${rankColor(r.rank_position)};padding:2px 8px;border-radius:99px;font-weight:600;font-size:12px">
            ${rankLabel(r.rank_position)}
          </span>
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#64748b;text-align:right">
          ${r.monthly_volume > 0 ? r.monthly_volume.toLocaleString() + "/mo" : "—"}
        </td>
      </tr>`)
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">

      <!-- Header -->
      <tr>
        <td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:32px 40px;text-align:center">
          <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px">
            <span style="color:#bbf7d0">SERP</span>Mapper
          </div>
          <div style="font-size:28px;font-weight:800;color:#fff;margin-top:16px">
            Your Visibility Report
          </div>
          <div style="font-size:15px;color:#bbf7d0;margin-top:6px">${data.businessName} · ${data.primaryKeyword}</div>
        </td>
      </tr>

      <!-- Score bar -->
      <tr>
        <td style="padding:32px 40px;text-align:center;border-bottom:1px solid #f1f5f9">
          <div style="font-size:64px;font-weight:900;color:#16a34a;line-height:1">${data.visibilityScore}</div>
          <div style="font-size:14px;color:#64748b;margin-top:4px">Visibility Score / 100</div>
          <div style="display:flex;justify-content:center;gap:24px;margin-top:20px">
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:#1e293b">${ranked.length}</div>
              <div style="font-size:12px;color:#64748b">Suburbs ranking</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:#1e293b">${top3.length}</div>
              <div style="font-size:12px;color:#64748b">Top 3 positions</div>
            </div>
            <div style="text-align:center">
              <div style="font-size:22px;font-weight:700;color:#1e293b">${missed.length}</div>
              <div style="font-size:12px;color:#64748b">Invisible suburbs</div>
            </div>
          </div>
        </td>
      </tr>

      <!-- Suburb table -->
      <tr>
        <td style="padding:28px 40px">
          <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:16px">Suburb Rankings</div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:1px solid #f1f5f9">
            <thead>
              <tr style="background:#f8fafc">
                <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#64748b;text-align:left;text-transform:uppercase;letter-spacing:.5px">Suburb</th>
                <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#64748b;text-align:center;text-transform:uppercase;letter-spacing:.5px">Position</th>
                <th style="padding:10px 12px;font-size:11px;font-weight:600;color:#64748b;text-align:right;text-transform:uppercase;letter-spacing:.5px">Searches</th>
              </tr>
            </thead>
            <tbody>${suburbRows}</tbody>
          </table>
          ${data.suburbResults.length > 20 ? `<p style="font-size:12px;color:#94a3b8;margin-top:8px;text-align:center">+ ${data.suburbResults.length - 20} more suburbs in your full report</p>` : ""}
        </td>
      </tr>

      <!-- CTA -->
      <tr>
        <td style="padding:0 40px 40px">
          <div style="background:#f0fdf4;border-radius:12px;padding:24px;text-align:center">
            <div style="font-size:15px;font-weight:600;color:#166534;margin-bottom:16px">
              View your full interactive map online
            </div>
            <a href="${reportUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-weight:700;font-size:14px;padding:12px 28px;border-radius:10px;text-decoration:none">
              Open Full Report →
            </a>
          </div>
          <p style="font-size:11px;color:#94a3b8;text-align:center;margin-top:20px">
            Sent by SERPMapper · <a href="${APP_URL}" style="color:#94a3b8">serpmap.com.au</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Send the full report email (no template ID needed) ────────
export async function sendReportEmail(data: ReportEmailData): Promise<void> {
  const reportUrl = `${APP_URL}/report/${data.reportId}`;
  const ranked    = data.suburbResults.filter(r => isVisiblePosition(r.rank_position));

  await sgMail.send({
    to:      data.email,
    from:    { email: FROM_EMAIL, name: "SERPMapper" },
    subject: `Your Google Maps visibility report — ${data.businessName}`,
    text: [
      `Hi there,`,
      ``,
      `Your SERPMapper report for ${data.businessName} is ready.`,
      ``,
      `Visibility Score: ${data.visibilityScore}/100`,
      `Suburbs ranking: ${ranked.length}/${data.suburbResults.length}`,
      `Top missed suburb: ${data.topMissedSuburb}`,
      ``,
      `View full report: ${reportUrl}`,
      ``,
      `— SERPMapper`,
    ].join("\n"),
    html: buildReportEmailHtml(data),
  });
}

// ── Legacy confirmation email (kept for compatibility) ────────
export async function sendConfirmationEmail(data: NurtureEmailData): Promise<void> {
  // Falls back to sendReportEmail with empty suburbResults if called without full data
  await sendReportEmail({ ...data, suburbResults: [] });
}

export async function enrollInNurtureSequence(_data: NurtureEmailData): Promise<void> {
  // No-op until SendGrid marketing contacts are configured
}

// ── OTP verification email ────────────────────────────────────
export async function sendOtpEmail(email: string, code: string, businessName: string): Promise<void> {
  await sgMail.send({
    to:   email,
    from: { email: FROM_EMAIL, name: "SERPMapper" },
    subject: `${code} — Your SERPMapper verification code`,
    text: [
      `Your SERPMapper verification code is: ${code}`,
      ``,
      `Enter this code on the SERPMapper page to unlock your full visibility map for ${businessName}.`,
      ``,
      `This code expires in 10 minutes.`,
      ``,
      `If you didn't request this, you can safely ignore this email.`,
      ``,
      `— SERPMapper`,
    ].join("\n"),
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 20px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:32px 40px;text-align:center;">
            <p style="margin:0;font-size:22px;font-weight:900;color:#fff;letter-spacing:-0.5px;">
              <span style="color:#c7d2fe;">SERP</span>Mapper
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 8px;font-size:14px;color:#6b7280;">Your verification code</p>
            <div style="background:#f3f4f6;border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
              <span style="font-size:48px;font-weight:900;letter-spacing:12px;color:#4f46e5;">${code}</span>
            </div>
            <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">
              Enter this code on SERPMapper to unlock your full suburb-by-suburb visibility map for
              <strong>${businessName}</strong>.
            </p>
            <p style="margin:0;font-size:13px;color:#9ca3af;">
              This code expires in <strong>10 minutes</strong>. If you didn't request this, ignore this email.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #f3f4f6;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">SERPMapper by DotMappers IT Pvt Ltd</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });
}

// ── CTA URL builder ───────────────────────────────────────────
export function buildLeadCtaUrl({
  businessUrl, keyword, topSuburb, reportId,
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
