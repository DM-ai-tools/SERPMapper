"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";
import ProcessingState from "@/components/ProcessingState";
import ReportView from "@/components/ReportView";
import ScoreGauge from "@/components/ScoreGauge";
import { isVisiblePosition } from "@/lib/scoring";

const VisibilityMap = dynamic(() => import("@/components/VisibilityMap"), { ssr: false });

type Phase = "analyzing" | "gated" | "unlocked";

export default function ToolPage() {
  return (
    <Suspense fallback={<ToolPageSuspenseFallback />}>
      <ToolPageInner />
    </Suspense>
  );
}

function ToolPageSuspenseFallback() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center px-4 py-20 bg-[var(--page-bg)]">
      <div className="w-full max-w-sm space-y-4">
        <div className="h-10 rounded-xl bg-slate-200/80 animate-pulse" />
        <div className="h-4 rounded-lg bg-slate-100 animate-pulse w-2/3 mx-auto" />
        <p className="text-center text-sm text-slate-500">Preparing analysis…</p>
      </div>
    </div>
  );
}

function ToolPageInner() {
  const params = useSearchParams();

  // Two entry modes: new analysis (url+keyword+city) or direct link (report)
  const reportIdParam = params.get("report");
  const isCached      = params.get("cached") === "true";
  const urlParam      = params.get("url") ?? "";
  const keywordParam  = params.get("keyword") ?? "";
  const cityParam     = params.get("city") ?? "";
  const isDirectLink  = Boolean(reportIdParam);

  const [phase, setPhase] = useState<Phase>(isDirectLink ? "unlocked" : "analyzing");
  const [report, setReport] = useState<SerpMapReport | null>(null);
  const [results, setResults] = useState<SerpMapResult[]>([]);
  const [cards,   setCards]   = useState<OpportunityCard[]>([]);
  const [error,   setError]   = useState<string | null>(null);
  const didAnalyze = useRef(false);
  const esRef      = useRef<EventSource | null>(null);

  function safeDisplayUrl(input: string) {
    const raw = (input ?? "").trim();
    if (!raw) return null;
    try {
      const u = new URL(raw);
      const hostname = u.hostname;
      const companyFromHostname = (h: string) => {
        let s = h.toLowerCase();
        s = s.replace(/^www\./, "");

        const endings = [
          ".com.au",
          ".net.au",
          ".org.au",
          ".co.au",
          ".edu.au",
          ".gov.au",
          ".com",
          ".net",
          ".org",
          ".io",
        ];
        for (const e of endings) {
          if (s.endsWith(e)) s = s.slice(0, -e.length);
        }

        // If hostname still has dots (e.g. app.example.business.com) keep the last meaningful part.
        if (s.includes(".")) s = s.split(".").filter(Boolean).pop() ?? s;

        s = s.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
        if (!s) return h;

        return s
          .split(" ")
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
      };

      return companyFromHostname(hostname);
    } catch {
      const hostname = raw
        .replace(/^https?:\/\//i, "")
        .replace(/^www\./i, "")
        .split("/")[0];

      const s = hostname.replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
      return s
        .split(" ")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  // ── Direct link: fetch report once ───────────────────────────
  const fetchReport = useCallback(async (id: string) => {
    const res = await fetch(`/api/report/${id}`);
    if (!res.ok) { setError("Report not found."); return; }
    const data = await res.json();
    setReport(data.report);
    setResults(data.results ?? []);
    setCards(data.cards ?? []);
  }, []);

  useEffect(() => {
    if (!isDirectLink) return;
    if (isCached) {
      fetchReport(reportIdParam!);
      return;
    }
    esRef.current?.close();
    const es = new EventSource(`/api/stream/${reportIdParam}`);
    esRef.current = es;
    es.addEventListener("report",    (e) => setReport(JSON.parse(e.data)));
    es.addEventListener("result",    (e) => {
      const incoming = JSON.parse(e.data) as SerpMapResult;
      setResults(prev => {
        const idx = prev.findIndex(r => r.suburb_id === incoming.suburb_id || r.result_id === incoming.result_id);
        if (idx >= 0) { const u = [...prev]; u[idx] = incoming; return u; }
        return [...prev, incoming];
      });
    });
    es.addEventListener("complete",  (e) => {
      const d = JSON.parse(e.data);
      setReport(d.report); setResults(d.results ?? []); setCards(d.cards ?? []);
      es.close();
    });
    es.addEventListener("timeout",   () => { es.close(); fetchReport(reportIdParam!); });
    es.addEventListener("error",     () => { es.close(); fetchReport(reportIdParam!); });
    return () => es.close();
  }, [isDirectLink, reportIdParam, isCached, fetchReport]);

  // ── New analysis: call /api/analyze from this page ────────────
  useEffect(() => {
    if (isDirectLink || didAnalyze.current) return;
    if (!urlParam || !keywordParam || !cityParam) {
      setError("Missing search parameters. Please go back and try again.");
      return;
    }
    didAnalyze.current = true;

    (async () => {
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: urlParam, keyword: keywordParam, city: cityParam, radius_km: 30 }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? "Analysis failed. Please try again."); return; }

        const rpt = await (async () => {
          const r = await fetch(`/api/report/${data.report_id}`);
          return r.json();
        })();
        setReport(rpt.report);
        setResults(rpt.results ?? []);
        setCards(rpt.cards ?? []);
        // Email gate removed: unlock immediately after analysis finishes.
        setPhase("unlocked");
      } catch {
        setError("Network error. Please check your connection and try again.");
      }
    })();
  // Only run once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center px-4 py-16 bg-[var(--page-bg)]">
        <div className="card-elevated max-w-md w-full p-8 text-center space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 ring-1 ring-red-100">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-900">Something went wrong</p>
            <p className="mt-2 text-sm text-red-700/90 leading-relaxed">{error}</p>
          </div>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-600/25 transition hover:bg-brand-700"
          >
            Back to home
          </a>
        </div>
      </div>
    );
  }

  // ── Phase: analyzing ─────────────────────────────────────────
  if (phase === "analyzing") {
    const display = safeDisplayUrl(urlParam);
    return (
      <ProcessingState
        total={30}
        checked={0}
        businessName={display}
      />
    );
  }

  if (!report) return null;

  // Email gate removed — we always render the unlocked report below.

  // ── Phase: unlocked (full report) ───────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 bg-[var(--page-bg)] min-h-[calc(100vh-3.5rem)]">
      <ReportView
        report={report}
        results={results}
        cards={cards}
        gated={false}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Gated view: score + blurred map background + full-width email gate
// ─────────────────────────────────────────────────────────────────────────────
function toNum(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function downloadCsv(report: SerpMapReport, results: SerpMapResult[]) {
  const header = ["Suburb","State","Rank Position","Local Pack","Monthly Searches","Status"];
  const rows = [...results]
    .sort((a,b) => {
      if (a.rank_position !== null && b.rank_position !== null) return a.rank_position - b.rank_position;
      if (a.rank_position !== null) return -1;
      if (b.rank_position !== null) return 1;
      return (b.monthly_volume||0)-(a.monthly_volume||0);
    })
    .map(r => [r.suburb_name, r.suburb_state??"", r.rank_position??"Not ranking", r.is_in_local_pack?"Yes":"No", r.monthly_volume||0, r.dataforseo_status]);

  const csv = [
    [`Business`, report.business_name ?? report.business_url],
    [`Keyword`, report.keyword],[`City`, report.city],
    [`Visibility Score`, `${report.visibility_score??0}/100`],
    [`Suburbs Checked`, `${report.suburbs_checked}/${report.suburbs_total}`],
    [], header, ...rows,
  ]
    .map(row => row.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href=url; a.download=`serpmapper-${(report.business_name??"report").replace(/[^a-z0-9]/gi,"-").toLowerCase()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

interface GatedViewProps {
  report: SerpMapReport;
  results: SerpMapResult[];
  onUnlocked: () => void;
}

function GatedView({ report, results, onUnlocked }: GatedViewProps) {
  const score   = report.visibility_score ?? 0;
  const ranked  = results.filter(r => isVisiblePosition(r.rank_position)).length;
  const missed  = results.filter(r => !isVisiblePosition(r.rank_position)).length;
  const lat = toNum(report.business_lat);
  const lng = toNum(report.business_lng);

  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, report_id: report.report_id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong."); return; }
      onUnlocked();
    } catch { setError("Network error. Please try again."); }
    finally { setLoading(false); }
  }

  return (
    <div className="relative min-h-[calc(100vh-56px)] flex flex-col">
      {/* Blurred map background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
        {lat !== null && lng !== null ? (
          <div style={{ filter: "blur(6px)", opacity: 0.55, height: "100%", width: "100%" }}>
            <VisibilityMap results={results} businessLat={lat} businessLng={lng} isPartial={true} />
          </div>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-brand-50 to-white" />
        )}
        {/* Darkening overlay */}
        <div className="absolute inset-0 bg-white/60" />
      </div>

      {/* Foreground content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-4 py-12">
        {/* Stats bar */}
        <div className="flex items-center gap-6 mb-8 flex-wrap justify-center">
          {[
            { value: ranked, label: "Ranking", color: "text-green-600" },
            { value: missed, label: "Not visible", color: "text-red-500" },
            { value: results.length, label: "Suburbs checked", color: "text-gray-700" },
          ].map(s => (
            <div key={s.label} className="bg-white/90 backdrop-blur rounded-xl px-5 py-3 shadow text-center border border-white/50">
              <div className={`text-2xl font-black ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Score + gate card */}
        <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
          {/* Score hero */}
          <div className="bg-gradient-to-br from-brand-600 to-brand-700 p-8 text-center text-white">
            <p className="text-brand-200 text-sm font-medium mb-2">Your Google Visibility Score</p>
            <div className="flex items-center justify-center gap-0">
              <span className="text-7xl font-black leading-none">{score}</span>
              <span className="text-3xl font-medium opacity-60 self-end mb-2">/100</span>
            </div>
            <p className="text-brand-100 text-sm mt-3">
              {report.business_name ?? new URL(report.business_url).hostname} · {report.keyword} · {report.city}
            </p>
          </div>

          <div className="p-8 space-y-5">
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-900">Your full map is ready!</h2>
              <p className="text-gray-500 text-sm mt-1">
                Enter your email to unlock your suburb-by-suburb visibility map.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <input
                type="email" required
                placeholder="you@yourbusiness.com.au"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400
                           focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit" disabled={loading}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60
                           text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <SpinIcon /> : <LockOpenIcon />}
                {loading ? "Unlocking…" : "Unlock My Full Map"}
              </button>
            </form>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <button
              onClick={() => downloadCsv(report, results)}
              className="w-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50
                         text-gray-600 font-medium py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
            >
              <DownloadIcon /> Download CSV (no email needed)
            </button>

            <p className="text-center text-xs text-gray-400">
              No spam. We only send your report.
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Your data is private. We never share your information.
        </p>
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────
function SpinIcon() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}
function LockOpenIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
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
