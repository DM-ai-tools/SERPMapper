import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import ReportView from "@/components/ReportView";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";

interface Props {
  params: { id: string };
}

// Generate OpenGraph metadata per report (for social sharing cards)
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("serpmap_reports")
    .select("business_name, keyword, city, visibility_score, summary_text")
    .eq("report_id", params.id)
    .single();

  if (!data) return { title: "SERPMapper Report" };

  const title = `${data.business_name ?? "Business"}: ${data.visibility_score ?? 0}/100 Local Visibility Score`;
  const description =
    data.summary_text ??
    `Check your Google Maps visibility across suburbs in ${data.city}. Free tool by SERPMapper.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function SharedReportPage({ params }: Props) {
  const supabase = createAdminClient();

  const [reportRes, resultsRes, cardsRes] = await Promise.all([
    supabase.from("serpmap_reports").select("*").eq("report_id", params.id).single(),
    supabase
      .from("serpmap_results")
      .select("*")
      .eq("report_id", params.id)
      .order("monthly_volume", { ascending: false }),
    supabase
      .from("opportunity_cards")
      .select("*")
      .eq("report_id", params.id)
      .order("display_order", { ascending: true }),
  ]);

  if (reportRes.error || !reportRes.data) notFound();

  const report = reportRes.data as SerpMapReport;
  const results = (resultsRes.data ?? []) as SerpMapResult[];
  const cards = (cardsRes.data ?? []) as OpportunityCard[];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <ReportView
        report={report}
        results={results}
        cards={cards}
        gated={false} // Shared links show the full report — email already captured
      />
    </div>
  );
}
