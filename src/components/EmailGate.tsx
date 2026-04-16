"use client";

import { useState } from "react";
import { SerpMapReport, SerpMapResult } from "@/lib/types";

interface EmailGateProps {
  reportId: string;
  visibilityScore: number;
  report: SerpMapReport;
  results: SerpMapResult[];
  onUnlocked: (ctaUrl: string, topMissedSuburb: string) => void;
}

// ── CSV download (client-side, no server needed) ──────────────
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
      r.suburb_name,
      r.suburb_state ?? "",
      r.rank_position ?? "Not ranking",
      r.is_in_local_pack ? "Yes" : "No",
      r.monthly_volume || 0,
      r.dataforseo_status,
    ]);

  const csv = [
    // Report metadata at top
    [`Business`, report.business_name ?? report.business_url],
    [`Keyword`, report.keyword],
    [`City`, report.city],
    [`Visibility Score`, `${report.visibility_score ?? 0}/100`],
    [`Suburbs Checked`, `${report.suburbs_checked}/${report.suburbs_total}`],
    [],
    header,
    ...rows,
  ]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `serpmapper-${(report.business_name ?? "report").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EmailGate({ reportId, visibilityScore, report, results, onUnlocked }: EmailGateProps) {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, report_id: reportId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setSent(true);
      onUnlocked(data.ctaUrl, data.topMissedSuburb);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const ranked  = results.filter(r => r.rank_position !== null).length;
  const missed  = results.filter(r => r.rank_position === null).length;

  return (
    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-md w-full mx-auto">
      {/* Score header */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-6 text-center text-white">
        <div className="text-5xl font-black">{visibilityScore}<span className="text-2xl font-medium opacity-70"> /100</span></div>
        <p className="text-brand-100 text-sm mt-1">Visibility Score</p>
        <div className="flex justify-center gap-6 mt-4 text-sm">
          <div className="text-center">
            <div className="font-bold text-lg">{ranked}</div>
            <div className="text-brand-200 text-xs">Ranking</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-lg">{missed}</div>
            <div className="text-brand-200 text-xs">Not visible</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-lg">{results.length}</div>
            <div className="text-brand-200 text-xs">Suburbs</div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4">
        <div className="text-center">
          <h2 className="text-lg font-bold text-gray-900">Your map is ready.</h2>
          <p className="text-gray-500 text-sm mt-1">Enter your email to unlock the full map and receive a copy.</p>
        </div>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-green-700 font-semibold text-sm">Report sent! Check your inbox.</div>
            <p className="text-green-600 text-xs mt-1">Full map is now unlocked above.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@yourbusiness.com.au"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm"
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60
                         text-white font-semibold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              <MailIcon />
              {loading ? "Sending…" : "Email Me the Report"}
            </button>
          </form>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">or</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* Download CSV — no email required */}
        <button
          onClick={() => downloadCsv(report, results)}
          className="w-full border border-gray-300 hover:border-gray-400 hover:bg-gray-50
                     text-gray-700 font-medium py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
        >
          <DownloadIcon />
          Download CSV
        </button>

        <p className="text-xs text-gray-400 text-center">
          No spam. We send one report email only.
        </p>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
