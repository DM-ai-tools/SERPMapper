import { OpportunityCard, SerpMapReport, SerpMapResult } from "./types";
import { isVisiblePosition } from "./scoring";

interface PdfInput {
  report: SerpMapReport;
  results: SerpMapResult[];
  cards?: OpportunityCard[];
}

function rankLabel(position: number | null): string {
  if (position === null || position > 20) return "Not visible";
  if (position <= 3) return "Top 3";
  if (position <= 10) return "Page 1";
  return "Page 2";
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

async function captureMapDataUrl(): Promise<string | null> {
  try {
    const mapEl = document.querySelector(".leaflet-container") as HTMLElement | null;
    if (!mapEl) return null;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(mapEl, {
      useCORS: true,
      backgroundColor: "#ffffff",
      scale: 1.2,
      logging: false,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function downloadReportPdf({ report, results, cards = [] }: PdfInput): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);

  const autoTable = (autoTableMod as { default?: unknown }).default as (
    doc: unknown,
    opts: Record<string, unknown>
  ) => void;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 36;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  let y = 44;

  const reportUrl = `${window.location.origin}/report/${report.report_id}`;
  const visible = results.filter((r) => isVisiblePosition(r.rank_position));
  const stateAbbr = (results.find((r) => r.suburb_state)?.suburb_state ?? "").toUpperCase();
  const stateFull = STATE_FULL[stateAbbr] ?? stateAbbr;
  const locationLabel = stateFull
    ? `${report.city}, ${stateFull}, Australia`
    : `${report.city}, Australia`;
  const cityVolume =
    Number.isFinite(report.city_monthly_volume) && Number(report.city_monthly_volume) >= 0
      ? Number(report.city_monthly_volume)
      : null;
  const topMissed = results
    .filter((r) => !isVisiblePosition(r.rank_position))
    .sort((a, b) => a.suburb_name.localeCompare(b.suburb_name))
    .slice(0, 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("SERPMapper Visibility Report", margin, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const details = [
    `Business: ${report.business_name ?? report.business_url}`,
    `Website: ${report.business_url}`,
    `Keyword: ${report.keyword}`,
    `City: ${report.city}`,
    `Visibility Score: ${report.visibility_score ?? 0}/100`,
    `Visible Suburbs: ${visible.length}/${results.length}`,
    `Generated: ${new Date().toLocaleString()}`,
  ];
  details.forEach((line) => {
    doc.text(line, margin, y);
    y += 13;
  });
  y += 4;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Number of searches", margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(locationLabel, margin, y);
  y += 13;
  doc.text(
    `Searches for keyword "${report.keyword}" = ${
      cityVolume !== null ? cityVolume.toLocaleString() : "—"
    }`,
    margin,
    y
  );
  y += 16;
  doc.setFontSize(9);
  doc.setTextColor(120, 113, 108);
  doc.text(
    "Data Availability Notice: Search volume metrics are available at State and City level only.",
    margin,
    y
  );
  doc.setTextColor(0, 0, 0);
  y += 12;

  doc.setTextColor(25, 84, 211);
  doc.text("Open Interactive Map", margin, y + 2);
  doc.link(margin, y - 8, 120, 14, { url: reportUrl });
  doc.setTextColor(0, 0, 0);
  y += 18;

  const mapDataUrl = await captureMapDataUrl();
  if (mapDataUrl) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Live Visibility Map", margin, y);
    y += 8;
    const mapHeight = 220;
    doc.addImage(mapDataUrl, "PNG", margin, y, contentWidth * 0.68, mapHeight);
    y += mapHeight + 14;
  }

  if (topMissed.length > 0) {
    const cardBySuburb = new Map(cards.map((c) => [c.suburb_name, c.card_text]));
    autoTable(doc, {
      startY: y,
      head: [["Top Missed suburbs", "Card"]],
      body: topMissed.map((r) => [
        r.suburb_name,
        cardBySuburb.get(r.suburb_name) ??
          `${r.suburb_name} is currently not visible in the top 20.`,
      ]),
      styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      margin: { left: margin, right: margin },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 12;
  }

  autoTable(doc, {
    startY: y,
    head: [["Suburb", "City", "State", "Position", "Status"]],
    body: [...results]
      .sort((a, b) => {
        const ap = a.rank_position ?? 999;
        const bp = b.rank_position ?? 999;
        if (ap !== bp) return ap - bp;
        return a.suburb_name.localeCompare(b.suburb_name);
      })
      .map((r) => [
        r.suburb_name,
        report.city,
        r.suburb_state ?? "",
        r.rank_position ?? "-",
        rankLabel(r.rank_position),
      ]),
    styles: { fontSize: 8.4, cellPadding: 4.2 },
    headStyles: { fillColor: [37, 99, 235], textColor: [255, 255, 255] },
    margin: { left: margin, right: margin },
  });

  const safe = (report.business_name ?? "report").replace(/[^a-z0-9]/gi, "-").toLowerCase();
  doc.save(`serpmapper-${safe}.pdf`);
}
