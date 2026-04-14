"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";
import ProcessingState from "@/components/ProcessingState";
import ReportView from "@/components/ReportView";

// Wrap in Suspense because useSearchParams needs it in App Router
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

  const fetchReport = useCallback(async () => {
    if (!reportId) return;
    const res = await fetch(`/api/report/${reportId}`);
    if (!res.ok) { setError("Report not found."); return; }
    const data = await res.json();
    setReport(data.report);
    setResults(data.results ?? []);
    setCards(data.cards ?? []);
  }, [reportId]);

  // Initial fetch
  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // If cached, no need to subscribe to realtime — already complete
  useEffect(() => {
    if (!reportId || isCached) return;

    // Subscribe to result inserts for this report
    const resultsChannel = supabase
      .channel(`results:${reportId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "serpmap_results",
          filter: `report_id=eq.${reportId}`,
        },
        (payload) => {
          setResults((prev) => {
            // Replace pending placeholder or add new result
            const existing = prev.findIndex(
              (r) => r.suburb_id === (payload.new as SerpMapResult).suburb_id
            );
            if (existing >= 0) {
              const updated = [...prev];
              updated[existing] = payload.new as SerpMapResult;
              return updated;
            }
            return [...prev, payload.new as SerpMapResult];
          });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "serpmap_results",
          filter: `report_id=eq.${reportId}`,
        },
        (payload) => {
          setResults((prev) =>
            prev.map((r) =>
              r.result_id === (payload.new as SerpMapResult).result_id
                ? (payload.new as SerpMapResult)
                : r
            )
          );
        }
      )
      .subscribe();

    // Subscribe to report status changes
    const reportChannel = supabase
      .channel(`report:${reportId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "serpmap_reports",
          filter: `report_id=eq.${reportId}`,
        },
        (payload) => {
          setReport(payload.new as SerpMapReport);
          // When completed, fetch cards and final data
          if ((payload.new as SerpMapReport).status === "completed") {
            fetchReport();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(resultsChannel);
      supabase.removeChannel(reportChannel);
    };
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

  // Show processing spinner until we have a partial or complete report
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

  // Show gated partial report or full report
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
