"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SerpMapReport, SerpMapResult, OpportunityCard as OppCard } from "@/lib/types";
import OpportunityCard from "./OpportunityCard";
import EmailGate from "./EmailGate";
import ScoreGauge from "./ScoreGauge";

// ── Client-side CSV download ──────────────────────────────────
function downloadCsv(report: SerpMapReport, results: SerpMapResult[]) {
  const header = ["Suburb", "State", "Rank Position", "Local Pack", "Monthly Searches", "Status"];
  const rows = [...results]
    .sort((a, b) => {
      if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
      if (a.rank_position !== null) return -1;
      if (b.rank_position !== null) return 1;
      return (b.monthly_volume || 0) - (a.monthly_volume || 0);
    })
    .map(r => [
      r.suburb_name, r.suburb_state ?? "",
      r.rank_position ?? "Not ranking",
      r.is_in_local_pack ? "Yes" : "No",
      r.monthly_volume || 0,
      r.dataforseo_status,
    ]);

  const csv = [
    [`Business`, report.business_name ?? report.business_url],
    [`Keyword`, report.keyword],
    [`City`, report.city],
    [`Visibility Score`, `${report.visibility_score ?? 0}/100`],
    [`Suburbs Checked`, `${report.suburbs_checked}/${report.suburbs_total}`],
    [],
    header,
    ...rows,
  ]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `serpmapper-${(report.business_name ?? "report").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Leaflet must not SSR
const VisibilityMap = dynamic(() => import("./VisibilityMap"), { ssr: false });

interface ReportViewProps {
  report: SerpMapReport;
  results: SerpMapResult[];
  cards: OppCard[];
  gated?: boolean;
  onEmailCaptured?: () => void;
}

export default function ReportView({
  report,
  results,
  cards,
  gated = false,
  onEmailCaptured,
}: ReportViewProps) {
  const [isGated, setIsGated] = useState(gated);
  const [ctaUrl, setCtaUrl] = useState<string | null>(null);
  const [topMissedSuburb, setTopMissedSuburb] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const businessLat = toNumberOrNull(report.business_lat);
  const businessLng = toNumberOrNull(report.business_lng);

  function handleUnlocked(url: string, suburb: string) {
    setCtaUrl(url);
    setTopMissedSuburb(suburb);
    setIsGated(false);
    onEmailCaptured?.();
  }

  async function handleCopyLink() {
    const shareUrl = `${window.location.origin}/report/${report.report_id}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // CTA destination — single env var controls the target (waitlist by default).
  // Set NEXT_PUBLIC_LEAD_CTA_BASE_URL in Vercel env to switch to the live product.
  const ctaBase =
    process.env.NEXT_PUBLIC_LEAD_CTA_BASE_URL ?? "https://dotmappers.in/waitlist";
  const finalCtaUrl =
    ctaUrl ??
    `${ctaBase}?` +
      `url=${encodeURIComponent(report.business_url)}` +
      `&keyword=${encodeURIComponent(report.keyword)}` +
      `&suburb=${encodeURIComponent(topMissedSuburb ?? report.city)}` +
      `&source=serpmap&report=${report.report_id}`;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200
                       bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-900 transition-colors shadow-sm"
            title="Back to home"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <h1 className="text-2xl font-black text-gray-900">
              {report.business_name ?? new URL(report.business_url).hostname}
            </h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {report.keyword} · {report.city} · {report.radius_km}km radius
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* CSV download — instant, no email required */}
          <button
            onClick={() => downloadCsv(report, results)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm
                       text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CSV
          </button>

          {/* Copy shareable link */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm
                       text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copied ? <><CheckIcon />Copied!</> : <><ShareIcon />Share map</>}
          </button>
        </div>
      </div>

      {/* Score + summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl shadow p-6 flex flex-col items-center justify-center">
          <ScoreGauge score={report.visibility_score ?? 0} />
          <p className="text-sm text-gray-500 mt-2 text-center">Visibility Score</p>
        </div>

        <div className="md:col-span-2 bg-white rounded-2xl shadow p-6 space-y-3">
          <h2 className="font-semibold text-gray-900">Your Visibility Summary</h2>
          <p className="text-gray-600 leading-relaxed text-sm">
            {report.summary_text ?? "Analysis complete. See your map for suburb-by-suburb results."}
          </p>
          <div className="flex gap-3 text-sm flex-wrap">
            <Stat
              value={`${results.filter((r) => r.rank_position !== null).length}/${results.length}`}
              label="Suburbs ranking"
            />
            <Stat
              value={`${results.filter((r) => r.rank_position !== null && r.rank_position <= 3).length}`}
              label="Top 3 positions"
            />
            <Stat
              value={`${results.filter((r) => r.rank_position === null).length}`}
              label="Invisible suburbs"
            />
          </div>
        </div>
      </div>

      {/* Map + gate / opportunity panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 relative">
        {/* Map */}
        <div className="lg:col-span-3 bg-white rounded-2xl shadow overflow-hidden" style={{ height: 480 }}>
          {businessLat !== null && businessLng !== null ? (
            <VisibilityMap
              results={results}
              businessLat={businessLat}
              businessLng={businessLng}
              isPartial={isGated}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Map unavailable
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="lg:col-span-2 space-y-4">
          {isGated ? (
            <EmailGate
              reportId={report.report_id}
              visibilityScore={report.visibility_score ?? 0}
              report={report}
              results={results}
              onUnlocked={handleUnlocked}
            />
          ) : (
            <>
              <h2 className="font-bold text-gray-900 text-lg">Top Missed Opportunities</h2>
              {cards.length > 0 ? (
                <div className="space-y-3">
                  {cards.map((card, i) => (
                    <OpportunityCard key={card.card_id} card={card} rank={i + 1} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No missed opportunities — great visibility!</p>
              )}

              {/* CTA card — destination controlled by NEXT_PUBLIC_LEAD_CTA_BASE_URL env var */}
              <div className="bg-gradient-to-br from-brand-600 to-brand-700 rounded-2xl p-6 text-white space-y-3">
                <p className="font-semibold text-lg leading-snug">
                  {report.cta_copy ?? `Want to start ranking in these suburbs? Get a free visibility strategy call.`}
                </p>
                <a
                  href={finalCtaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full bg-white text-brand-700 font-bold text-center py-3
                             rounded-xl hover:bg-brand-50 transition-colors"
                >
                  Book a Free Strategy Call
                </a>
                <p className="text-xs text-brand-100 text-center">
                  Free 15-min call. No obligation.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full suburb table (unlocked only) */}
      {!isGated && results.length > 0 && (
        <SuburbTable results={results} />
      )}
    </div>
  );
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

// ──────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
      <div className="text-lg font-bold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function SuburbTable({ results }: { results: SerpMapResult[] }) {
  const sorted = [...results].sort(
    (a, b) => (b.monthly_volume || 0) - (a.monthly_volume || 0)
  );

  return (
    <div className="bg-white rounded-2xl shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="font-bold text-gray-900">All Suburbs</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Suburb</th>
              <th className="px-4 py-3 text-left">State</th>
              <th className="px-4 py-3 text-right">Searches/mo</th>
              <th className="px-4 py-3 text-right">Your Position</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((r) => {
              const { band } = getBandInfo(r.rank_position);
              return (
                <tr key={r.result_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.suburb_name}</td>
                  <td className="px-4 py-3 text-gray-500">{r.suburb_state ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {r.monthly_volume > 0 ? r.monthly_volume.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {r.rank_position ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1"
                      style={{ backgroundColor: band.bg, color: band.text }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: band.dot }} />
                      {band.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getBandInfo(position: number | null) {
  if (position === null) {
    return { band: { bg: "#FEF2F2", text: "#B91C1C", dot: "#EF4444", label: "Not visible" } };
  }
  if (position <= 3) {
    return { band: { bg: "#F0FDF4", text: "#15803D", dot: "#22C55E", label: "Top 3" } };
  }
  if (position <= 10) {
    return { band: { bg: "#F0FDF4", text: "#166534", dot: "#86EFAC", label: "Page 1" } };
  }
  return { band: { bg: "#FFFBEB", text: "#92400E", dot: "#FCD34D", label: "Page 2" } };
}

function ShareIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}
