"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { SerpMapReport, SerpMapResult, OpportunityCard as OppCard } from "@/lib/types";
import OpportunityCard from "./OpportunityCard";
import EmailGate from "./EmailGate";
import ScoreGauge from "./ScoreGauge";
import { isVisiblePosition } from "@/lib/scoring";
import { downloadReportPdf } from "@/lib/pdf-report";

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
  const businessLat = toNumberOrNull(report.business_lat);
  const businessLng = toNumberOrNull(report.business_lng);

  function handleUnlocked(url: string, suburb: string) {
    setCtaUrl(url);
    setTopMissedSuburb(suburb);
    setIsGated(false);
    onEmailCaptured?.();
  }

  // Always send strategy/book CTA traffic to Traffic Radius contact page.
  const ctaBase = "https://trafficradius.com.au/contact-us/";
  const params = new URLSearchParams({
    url: report.business_url,
    keyword: report.keyword,
    suburb: topMissedSuburb ?? report.city,
    source: "serpmap",
    report: report.report_id,
  });
  if (ctaUrl) {
    try {
      const u = new URL(ctaUrl);
      u.searchParams.forEach((v, k) => {
        if (v && !params.has(k)) params.set(k, v);
      });
    } catch {
      // Ignore malformed historical ctaUrl and use our base params.
    }
  }
  const finalCtaUrl = `${ctaBase}?${params.toString()}`;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-8 md:space-y-10">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200/90
                       bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 transition-all shadow-sm hover:shadow-md"
            title="Back to home"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </a>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight">
              {report.business_name ?? new URL(report.business_url).hostname}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {report.keyword} · {report.city} · {report.radius_km} km radius
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* PDF download */}
          <button
            onClick={() => downloadReportPdf({ report, results, cards })}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium
                       text-slate-700 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF
          </button>
        </div>
      </div>

      {/* Score + summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card-elevated p-6 flex flex-col items-center justify-center">
          <ScoreGauge score={report.visibility_score ?? 0} />
          <p className="text-sm font-medium text-slate-500 mt-3 text-center">Visibility score</p>
        </div>

        <div className="md:col-span-2 card-elevated p-6 md:p-8 space-y-4">
          <h2 className="font-bold text-slate-900 text-lg">Your visibility summary</h2>
          <p className="text-slate-600 leading-relaxed text-sm">
            {report.summary_text ?? "Analysis complete. See your map for suburb-by-suburb results."}
          </p>
          <div className="flex gap-3 text-sm flex-wrap">
            <Stat
              value={`${results.filter((r) => isVisiblePosition(r.rank_position)).length}/${results.length}`}
              label="Suburbs ranking"
            />
            <Stat
              value={`${results.filter((r) => isVisiblePosition(r.rank_position) && (r.rank_position ?? 99) <= 3).length}`}
              label="Top 3 positions"
            />
            <Stat
              value={`${results.filter((r) => !isVisiblePosition(r.rank_position)).length}`}
              label="Invisible suburbs"
            />
          </div>
        </div>
      </div>

      {/* Map + gate / opportunity panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 relative">
        {/* Map */}
        <div
          className="lg:col-span-3 card-elevated overflow-hidden ring-1 ring-slate-200/80"
          style={{ height: 480 }}
        >
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
              <h2 className="font-bold text-slate-900 text-lg">Top missed opportunities</h2>
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
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 p-6 text-white space-y-4 shadow-lg shadow-brand-900/20 ring-1 ring-white/10">
                <div
                  className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl"
                  aria-hidden
                />
                <p className="relative font-semibold text-lg leading-snug">
                  {report.cta_copy ?? `Want to start ranking in these suburbs? Get a free visibility strategy call.`}
                </p>
                <a
                  href={finalCtaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block w-full bg-white text-brand-700 font-bold text-center py-3.5
                             rounded-xl shadow-md hover:bg-brand-50 transition-colors"
                >
                  Book a free strategy call
                </a>
                <p className="relative text-xs text-brand-100/95 text-center">
                  Free 15-min call. No obligation.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Full suburb table (unlocked only) */}
      {!isGated && results.length > 0 && (
        <div className="space-y-4">
          <div className="w-full space-y-2">
            <CitySearchVolumeCard report={report} results={results} />
            <p className="text-xs text-slate-500 px-1">
              <span className="font-semibold text-amber-700">⚠️ Data Availability Notice</span>{" "}
              Search volume metrics in SERPMapper are available at the State and City level only.
              Suburb-level data is not supported.
            </p>
          </div>
          <SuburbTable results={results} city={report.city} />
        </div>
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
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-center">
      <div className="text-lg font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function SuburbTable({ results, city }: { results: SerpMapResult[]; city: string }) {
  const sorted = [...results].sort(
    (a, b) =>
      (a.rank_position ?? 999) - (b.rank_position ?? 999) ||
      a.suburb_name.localeCompare(b.suburb_name)
  );

  return (
    <div className="card-elevated overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="font-bold text-slate-900">All suburbs</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-slate-50/90 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="px-5 py-3 text-center">Suburb</th>
              <th className="px-5 py-3 text-center">City</th>
              <th className="px-5 py-3 text-center">State</th>
              <th className="px-5 py-3 text-center">Your Position</th>
              <th className="px-5 py-3 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sorted.map((r) => {
              const { band } = getBandInfo(r.rank_position);
              return (
                <tr key={r.result_id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3 text-center font-medium text-gray-900">{r.suburb_name}</td>
                  <td className="px-5 py-3 text-center text-gray-500">{city}</td>
                  <td className="px-5 py-3 text-center text-gray-500">{r.suburb_state ?? "—"}</td>
                  <td className="px-5 py-3 text-center text-gray-700">
                    {r.rank_position ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-center">
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

const STATE_FULL: Record<string, string> = {
  VIC: "Victoria",
  NSW: "New South Wales",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

function CitySearchVolumeCard({
  report,
  results,
}: {
  report: SerpMapReport;
  results: SerpMapResult[];
}) {
  const cityVolume =
    Number.isFinite(report.city_monthly_volume) && Number(report.city_monthly_volume) >= 0
      ? Number(report.city_monthly_volume)
      : null;
  const stateAbbr = (results.find((r) => r.suburb_state)?.suburb_state ?? "").toUpperCase();
  const stateFull = STATE_FULL[stateAbbr] ?? stateAbbr;
  const locationLabel = stateFull
    ? `${report.city}, ${stateFull}, Australia`
    : `${report.city}, Australia`;

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm w-full">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Number of searches</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{locationLabel}</p>
      <p className="mt-1.5 text-sm text-slate-600">
        Searches for keyword "<span className="font-semibold text-slate-900">{report.keyword}</span>" ={" "}
        <span className="font-bold text-brand-700">{cityVolume !== null ? cityVolume.toLocaleString() : "—"}</span>
      </p>
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
  if (position <= 20) {
    return { band: { bg: "#FFFBEB", text: "#92400E", dot: "#FCD34D", label: "Page 2" } };
  }
  return { band: { bg: "#FEF2F2", text: "#B91C1C", dot: "#EF4444", label: "Not visible" } };
}

