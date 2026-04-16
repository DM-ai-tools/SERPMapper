"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";
import ProcessingState from "@/components/ProcessingState";
import ReportView from "@/components/ReportView";

export default function ToolPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center text-gray-400">Loading...</div>}>
      <ToolPageInner />
    </Suspense>
  );
}

function ToolPageInner() {
  const params = useSearchParams();
  const reportId = params.get("report");
  const isCached = params.get("cached") === "true";

  const [report, setReport] = useState<SerpMapReport | null>(null);
  const [results, setResults] = useState<SerpMapResult[]>([]);
  const [cards, setCards] = useState<OpportunityCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const fetchReport = useCallback(async () => {
    if (!reportId) return;
    const res = await fetch(`/api/report/${reportId}`);
    if (!res.ok) { setError("Report not found."); return; }
    const data = await res.json();
    setReport(data.report);
    setResults(data.results ?? []);
    setCards(data.cards ?? []);
  }, [reportId]);

  // For cached reports, a single fetch is enough
  useEffect(() => {
    if (isCached) fetchReport();
  }, [isCached, fetchReport]);

  // For live reports, open an SSE stream that drives all updates
  useEffect(() => {
    if (!reportId || isCached) return;

    // Close any existing stream before opening a new one
    esRef.current?.close();

    const es = new EventSource(`/api/stream/${reportId}`);
    esRef.current = es;

    // Initial snapshot of the report
    es.addEventListener("report", (e) => {
      const r = JSON.parse(e.data) as SerpMapReport;
      setReport(r);
    });

    // A single suburb result arrived
    es.addEventListener("result", (e) => {
      const incoming = JSON.parse(e.data) as SerpMapResult;
      setResults((prev) => {
        const idx = prev.findIndex(
          (r) => r.suburb_id === incoming.suburb_id || r.result_id === incoming.result_id
        );
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = incoming;
          return updated;
        }
        return [...prev, incoming];
      });
    });

    // Processing fully complete
    es.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data);
      setReport(data.report);
      setResults(data.results ?? []);
      setCards(data.cards ?? []);
      es.close();
    });

    // Timed out — refresh to check if partial data is available
    es.addEventListener("timeout", () => {
      es.close();
      fetchReport();
    });

    es.addEventListener("error", () => {
      es.close();
      // Fallback: try polling the report API once
      fetchReport();
    });

    return () => es.close();
  }, [reportId, isCached, fetchReport]);

  if (!reportId) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center">
        <h2 className="text-xl font-bold text-gray-700">No report ID provided.</h2>
        <a href="/" className="mt-4 inline-block text-brand-600 hover:underline">
          Start a new check
        </a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-4">
        <p className="text-red-600">{error}</p>
        <a href="/" className="text-brand-600 hover:underline">Try again</a>
      </div>
    );
  }

  const isProcessing =
    !report || report.status === "pending" || report.status === "processing";
  const isPartial = report?.status === "partial";
  const isComplete = report?.status === "completed";

  if (isProcessing) {
    const checked = results.filter(
      (r) => r.dataforseo_status === "completed" || r.rank_position !== null
    ).length;
    return (
      <div className="max-w-4xl mx-auto px-4 py-20">
        <ProcessingState
          total={report?.suburbs_total ?? 50}
          checked={checked}
          businessName={report?.business_name}
        />
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <ReportView
        report={report}
        results={results}
        cards={cards}
        gated={isPartial && !isComplete}
      />
    </div>
  );
}
