import { Metadata } from "next";
import { notFound } from "next/navigation";
import { query, queryOne } from "@/lib/db";
import ReportView from "@/components/ReportView";
import { SerpMapReport, SerpMapResult, OpportunityCard } from "@/lib/types";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const data = await queryOne<Pick<SerpMapReport, "business_name" | "keyword" | "city" | "visibility_score" | "summary_text">>(
    "SELECT business_name, keyword, city, visibility_score, summary_text FROM serpmap_reports WHERE report_id = $1",
    [params.id]
  );

  if (!data) return { title: "SERPMapper Report" };

  const title = `${data.business_name ?? "Business"}: ${data.visibility_score ?? 0}/100 Local Visibility Score`;
  const description =
    data.summary_text ??
    `Check your Google Maps visibility across suburbs in ${data.city}. Free tool by SERPMapper.`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedReportPage({ params }: Props) {
  const [report, results, cards] = await Promise.all([
    queryOne<SerpMapReport>(
      "SELECT * FROM serpmap_reports WHERE report_id = $1",
      [params.id]
    ),
    query<SerpMapResult>(
      "SELECT * FROM serpmap_results WHERE report_id = $1 ORDER BY monthly_volume DESC",
      [params.id]
    ),
    query<OpportunityCard>(
      "SELECT * FROM opportunity_cards WHERE report_id = $1 ORDER BY display_order ASC",
      [params.id]
    ),
  ]);

  if (!report) notFound();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <ReportView
        report={report}
        results={results}
        cards={cards}
        gated={false}
      />
    </div>
  );
}
