import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, insertReturning, ensureDatabaseReady } from "@/lib/db";
import { resolveBusinessFromUrl } from "@/lib/places";
import { fetchLiveSuburbVolumes, getSuburbsInRadius } from "@/lib/suburbs";
import {
  getLiveResults,
  findBusinessRank,
  DFSTaskPostRequest,
  getKeywordVolumes,
  getKeywordVolumesByLocationTasks,
  normaliseVolumeKeyword,
} from "@/lib/dataforseo";
import {
  generateVisibilitySummary,
  generateOpportunityCards,
  generateCtaCopy,
} from "@/lib/claude";
import {
  calculateVisibilityScore,
  getTopMissedSuburbs,
  buildReportSummary,
  isVisiblePosition,
} from "@/lib/scoring";
import { AnalyzeRequest, AnalyzeResponse, SerpMapResult } from "@/lib/types";

/** DataforSEO runs one request per suburb — allow enough time for ~60 suburbs. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const url       = (body.url ?? "").trim();
    const keyword   = (body.keyword ?? "").trim();
    const city      = (body.city ?? "").trim();
    const radius_km = body.radius_km ?? 30;

    if (!url || !keyword || !city) {
      return NextResponse.json(
        { error: "url, keyword, and city are required" },
        { status: 400 }
      );
    }

    if (!process.env.DATABASE_URL?.trim()) {
      return NextResponse.json(
        { error: "Database is not configured (DATABASE_URL missing)." },
        { status: 503 }
      );
    }

    await ensureDatabaseReady();

    // ──────────────────────────────────────────
    // 1. Daily quota guard
    // ──────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const quota = await queryOne<{ reports_count: number; daily_limit: number }>(
      "SELECT reports_count, daily_limit FROM serpmap_quota WHERE quota_date = $1",
      [today]
    );
    const dailyLimit = Number(process.env.DAILY_REPORT_QUOTA ?? 200);
    if (quota && quota.reports_count >= (quota.daily_limit ?? dailyLimit)) {
      return NextResponse.json(
        { error: "Daily report quota reached. Try again after midnight AEST." },
        { status: 429 }
      );
    }

    // ──────────────────────────────────────────
    // 2. Delete any previous reports for the same url+keyword+city
    //    so every search is always fresh — no stale data is ever reused
    // ──────────────────────────────────────────
    let business;
    try {
      business = await resolveBusinessFromUrl(url, city);
    } catch (placesErr) {
      const msg = placesErr instanceof Error ? placesErr.message : String(placesErr);
      console.error("[analyze] Google Places error:", placesErr);
      return NextResponse.json(
        {
          error: "Google Places could not complete the lookup.",
          detail: msg,
        },
        { status: 502 }
      );
    }

    const businessUrlForReport =
      business?.websiteUri?.trim() ? business.websiteUri.trim() : url;

    await execute(
      "DELETE FROM serpmap_reports WHERE business_url = $1 AND keyword = $2 AND city = $3",
      [businessUrlForReport, keyword, city]
    ).catch(() => {}); // non-critical — don't fail the whole request if this errors

    const businessLat     = business?.lat ?? null;
    const businessLng     = business?.lng ?? null;
    const businessName    = business?.name ?? null;
    const businessAddress = business?.address ?? null;

    if (!businessLat || !businessLng) {
      return NextResponse.json(
        {
          error:
            "We could not match your website to a Google Business Profile. Use the exact website URL shown on your Google listing, and check that your city matches the listing.",
        },
        { status: 422 }
      );
    }

    // ──────────────────────────────────────────
    // 4. Build suburb grid (live — no cache)
    // ──────────────────────────────────────────
    const suburbs = await getSuburbsInRadius(businessLat, businessLng, radius_km, keyword);

    if (suburbs.length === 0) {
      return NextResponse.json(
        {
          error:
            "No suburbs found within the specified radius. Ensure suburb data exists in the database (latest deploy auto-seeds an empty table) or run: node scripts/seed-all-australia.js",
        },
        { status: 422 }
      );
    }

    // Deduplicate suburbs by suburb_id to prevent duplicate result rows
    const uniqueSuburbs = suburbs.filter(
      (s, i, arr) => arr.findIndex(x => x.suburb_id === s.suburb_id) === i
    );
    const populationBySuburbName = new Map<string, number>();
    for (const s of uniqueSuburbs) {
      const pop = Number(s.population ?? 0);
      if (s.name && Number.isFinite(pop) && pop > 0) {
        populationBySuburbName.set(s.name, pop);
      }
    }

    // ──────────────────────────────────────────
    // 5. Create a fresh report record (no cache_key — always a new UUID)
    // ──────────────────────────────────────────
    const report = await insertReturning<{ report_id: string }>(
      `INSERT INTO serpmap_reports
         (business_url, business_name, keyword, city, business_lat, business_lng,
          business_address, radius_km, status, suburbs_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing',$9)
       RETURNING report_id`,
      [businessUrlForReport, businessName, keyword, city, businessLat, businessLng,
       businessAddress, radius_km, uniqueSuburbs.length]
    );
    const reportId = report.report_id;

    // ──────────────────────────────────────────
    // 6. Resolve suburb monthly volumes (live via DataforSEO Keywords Data + cache)
    // ──────────────────────────────────────────
    const volumeBySuburbId = await fetchLiveSuburbVolumes(
      uniqueSuburbs.map((s) => ({
        suburb_id: s.suburb_id,
        name: s.name,
        dataforseo_location_name: s.dataforseo_location_name,
      })),
      keyword,
      uniqueSuburbs
    );

    // ──────────────────────────────────────────
    // 7. Create result placeholder rows (one per unique suburb)
    // ──────────────────────────────────────────
    for (const s of uniqueSuburbs) {
      await execute(
        `INSERT INTO serpmap_results
           (report_id, suburb_id, suburb_name, suburb_state, monthly_volume, dataforseo_status)
         VALUES ($1,$2,$3,$4,$5,'processing')`,
        [reportId, s.suburb_id, s.name, s.state, volumeBySuburbId.get(s.suburb_id) ?? 0]
      );
    }

    // ──────────────────────────────────────────
    // 8. Call DataforSEO LIVE endpoint — fresh data every time, no polling
    // ──────────────────────────────────────────
    const STATE_FULL: Record<string, string> = {
      VIC: "Victoria", NSW: "New South Wales", QLD: "Queensland",
      WA:  "Western Australia", SA: "South Australia", TAS: "Tasmania",
      ACT: "Australian Capital Territory", NT: "Northern Territory",
    };
    const stateAbbr        = uniqueSuburbs[0]?.state ?? "";
    const stateFull        = STATE_FULL[stateAbbr.toUpperCase()] ?? stateAbbr;
    const cityLocationName = stateFull
      ? `${city},${stateFull},Australia`
      : `${city},Australia`;

    const dfsTaskRequests: DFSTaskPostRequest[] = uniqueSuburbs.map((s) => ({
      keyword:       `${keyword} ${s.name}`,
      location_name: s.dataforseo_location_name ?? cityLocationName,
      language_name: "English",
      device:        "desktop",
      os:            "windows",
      tag:           `serpmap_${reportId}_${s.suburb_id}`,
    }));

    let cityMonthlyVolume: number | null = null;
    try {
      const cityVol = await getKeywordVolumesByLocationTasks([
        {
          tag: "city_volume",
          keyword,
          location_name: cityLocationName,
        },
      ]);
      cityMonthlyVolume = cityVol.get("city_volume") ?? null;

      if (cityMonthlyVolume === null) {
        const fallbackPhrases = [keyword, `${keyword} ${city}`];
        const fallbackMap = await getKeywordVolumes(fallbackPhrases);
        for (const phrase of fallbackPhrases) {
          const vol = fallbackMap.get(normaliseVolumeKeyword(phrase));
          if (Number.isFinite(vol) && (vol as number) > 0) {
            cityMonthlyVolume = vol as number;
            break;
          }
        }
      }
    } catch (err) {
      console.warn("[analyze] city keyword volume lookup failed:", err);
    }

    let liveResults: Array<{ tag: string; result: import("@/lib/dataforseo").DFSTaskResult | null }>;
    try {
      liveResults = await getLiveResults(dfsTaskRequests);
    } catch (err) {
      await execute("DELETE FROM serpmap_reports WHERE report_id = $1", [reportId]).catch(() => {});
      const message = String(err);
      if (message.includes("40100")) {
        return NextResponse.json(
          { error: "DataforSEO authentication failed. Check DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD." },
          { status: 502 }
        );
      }
      console.error("[analyze] DataforSEO error:", err);
      return NextResponse.json(
        {
          error: "DataforSEO request failed.",
          detail: message.slice(0, 400),
        },
        { status: 502 }
      );
    }

    if (liveResults.length === 0) {
      await execute("DELETE FROM serpmap_reports WHERE report_id = $1", [reportId]);
      return NextResponse.json(
        { error: "DataforSEO did not return any results. Check your account access and balance." },
        { status: 502 }
      );
    }

    // ──────────────────────────────────────────
    // 9. Write live results back to DB
    // ──────────────────────────────────────────
    let visibleCount = 0;
    await Promise.allSettled(
      liveResults.map(({ tag, result }) => {
        const suburbId = tag.split("_").pop();
        if (!suburbId) return Promise.resolve();

        const { position, inLocalPack } = result
          ? findBusinessRank(result, businessUrlForReport, businessName)
          : { position: null, inLocalPack: false };

        if (isVisiblePosition(position)) visibleCount++;

        return execute(
          `UPDATE serpmap_results
           SET rank_position = $1, is_in_local_pack = $2,
               dataforseo_status = 'completed', updated_at = NOW()
           WHERE report_id = $3 AND suburb_id = $4`,
          [position, inLocalPack, reportId, suburbId]
        );
      })
    );

    // ──────────────────────────────────────────
    // 10. Generate AI summary & opportunity cards (live — no cache)
    // ──────────────────────────────────────────
    const allResults = await query<SerpMapResult>(
      "SELECT * FROM serpmap_results WHERE report_id = $1",
      [reportId]
    );

    const score       = calculateVisibilityScore(allResults);
    const displayName = businessName ?? businessUrlForReport;
    const summary     = buildReportSummary(allResults, displayName, keyword);
    const missed      = getTopMissedSuburbs(allResults, 5);

    let summaryText = "";
    let ctaCopy     = "";
    let cardTexts: string[] = [];
    const hasCityVolume = Number.isFinite(cityMonthlyVolume) && (cityMonthlyVolume as number) > 0;
    const hasMissedVolumeData = missed.some((s) => Number(s.monthly_volume ?? 0) > 0);
    const usePopulationCards = !hasCityVolume || !hasMissedVolumeData;

    try {
      [summaryText, ctaCopy, cardTexts] = await Promise.all([
        generateVisibilitySummary(summary),
        generateCtaCopy(displayName, keyword, missed[0]?.suburb_name ?? null),
        missed.length > 0
          ? generateOpportunityCards(
              displayName, keyword,
              missed.map((s) => ({
                name: s.suburb_name,
                volume: s.monthly_volume,
                population: populationBySuburbName.get(s.suburb_name) ?? null,
              })),
              { usePopulationPrompt: usePopulationCards }
            )
          : Promise.resolve([]),
      ]);
    } catch (aiErr) {
      console.warn("[analyze] AI generation skipped:", aiErr);
      summaryText = `${displayName} is visible in the top 20 in ${visibleCount} of ${allResults.length} suburbs for "${keyword}".`;
    }

    // ──────────────────────────────────────────
    // 11. Finalise report
    // ──────────────────────────────────────────
    await execute(
      `UPDATE serpmap_reports
       SET status = 'completed', visibility_score = $1, summary_text = $2, cta_copy = $3,
           suburbs_checked = $4, city_monthly_volume = $5, completed_at = NOW()
       WHERE report_id = $6`,
      [
        score,
        summaryText,
        ctaCopy,
        allResults.filter(r => r.dataforseo_status === "completed").length,
        cityMonthlyVolume,
        reportId,
      ]
    );

    // Insert opportunity cards (fresh — no carry-over from previous runs)
    for (let i = 0; i < missed.length; i++) {
      const suburb = missed[i];
      const monthlyVolume = Number.isFinite(suburb.monthly_volume) ? Math.max(suburb.monthly_volume, 0) : 0;
      const population = populationBySuburbName.get(suburb.suburb_name);
      const populationLabel =
        population && population > 0 ? `${population.toLocaleString()} local residents` : "ABS area demand";
      const populationFallbacks = [
        `${suburb.suburb_name} has ${populationLabel} that cannot currently find your business on Google Maps.`,
        `In ${suburb.suburb_name}, your business is still invisible to nearby customers and competitors keep winning local demand.`,
        `${suburb.suburb_name} is a missed suburb where local customers are likely finding competitors first.`,
        `${suburb.suburb_name} is untapped demand, but your business is not visible on Maps yet.`,
        `You're missing exposure in ${suburb.suburb_name}; local customers currently cannot discover your business in map results.`,
      ];
      const fallbackText = monthlyVolume > 0 && !usePopulationCards
        ? `${suburb.suburb_name} has ${monthlyVolume} monthly searches — you are not visible here.`
        : populationFallbacks[i % populationFallbacks.length];
      const text = cardTexts[i] ?? fallbackText;
      await execute(
        `INSERT INTO opportunity_cards
           (report_id, suburb_name, rank_position, monthly_volume, card_text, display_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [reportId, suburb.suburb_name, null, monthlyVolume, text, i]
      );
    }

    // ──────────────────────────────────────────
    // 12. Update quota counter
    // ──────────────────────────────────────────
    await execute(
      `INSERT INTO serpmap_quota (quota_date, reports_count, api_calls_used, daily_limit, updated_at)
       VALUES ($1, 1, $2, $3, NOW())
       ON CONFLICT (quota_date) DO UPDATE
         SET reports_count  = serpmap_quota.reports_count + 1,
             api_calls_used = serpmap_quota.api_calls_used + $2,
             updated_at     = NOW()`,
      [today, uniqueSuburbs.length, dailyLimit]
    );

    const response: AnalyzeResponse = {
      report_id: reportId,
      status: "completed",
      cached: false,
      business_name:    businessName    ?? undefined,
      business_address: businessAddress ?? undefined,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[analyze] error:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Internal server error",
        ...(process.env.NODE_ENV === "development" ? { detail } : {}),
      },
      { status: 500 }
    );
  }
}
