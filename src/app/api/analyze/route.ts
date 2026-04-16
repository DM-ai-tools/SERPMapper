import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute, insertReturning } from "@/lib/db";
import { resolveBusinessFromUrl } from "@/lib/places";
import { getSuburbsInRadius, buildCacheKey, getSuburbVolume } from "@/lib/suburbs";
import { postLocalPackTasks } from "@/lib/dataforseo";
import { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body: AnalyzeRequest = await req.json();
    const { url, keyword, city, radius_km = 30 } = body;

    if (!url || !keyword || !city) {
      return NextResponse.json(
        { error: "url, keyword, and city are required" },
        { status: 400 }
      );
    }

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
    // 2. Cache check
    // ──────────────────────────────────────────
    const cacheKey = buildCacheKey(url, keyword, radius_km);
    const cached = await queryOne<{ report_id: string }>(
      "SELECT report_id FROM serpmap_cache_index WHERE cache_key = $1 AND expires_at > NOW()",
      [cacheKey]
    );

    if (cached) {
      const response: AnalyzeResponse = {
        report_id: cached.report_id,
        status: "completed",
        cached: true,
      };
      return NextResponse.json(response);
    }

    // ──────────────────────────────────────────
    // 3. Resolve business address from URL
    // ──────────────────────────────────────────
    const business = await resolveBusinessFromUrl(url, city);
    const businessLat = business?.lat ?? null;
    const businessLng = business?.lng ?? null;
    const businessName = business?.name ?? null;
    const businessAddress = business?.address ?? null;

    if (!businessLat || !businessLng) {
      return NextResponse.json(
        { error: "Could not locate this business. Please check the URL or try entering the suburb manually." },
        { status: 422 }
      );
    }

    // ──────────────────────────────────────────
    // 4. Build suburb grid
    // ──────────────────────────────────────────
    const suburbs = await getSuburbsInRadius(businessLat, businessLng, radius_km, keyword);

    if (suburbs.length === 0) {
      return NextResponse.json(
        { error: "No suburbs found within the specified radius." },
        { status: 422 }
      );
    }

    // ──────────────────────────────────────────
    // 5. Create report record
    // ──────────────────────────────────────────
    const report = await insertReturning<{ report_id: string }>(
      `INSERT INTO serpmap_reports
         (business_url, business_name, keyword, city, business_lat, business_lng,
          business_address, radius_km, status, suburbs_total, cache_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing',$9,$10)
       RETURNING report_id`,
      [url, businessName, keyword, city, businessLat, businessLng,
       businessAddress, radius_km, suburbs.length, cacheKey]
    );

    const reportId = report.report_id;

    // ──────────────────────────────────────────
    // 6. Create result placeholder rows
    // ──────────────────────────────────────────
    for (const s of suburbs) {
      await execute(
        `INSERT INTO serpmap_results
           (report_id, suburb_id, suburb_name, suburb_state, monthly_volume, dataforseo_status)
         VALUES ($1,$2,$3,$4,$5,'pending')`,
        [reportId, s.suburb_id, s.name, s.state, getSuburbVolume(s, keyword)]
      );
    }

    // ──────────────────────────────────────────
    // 7. Batch post DataforSEO tasks
    // ──────────────────────────────────────────
    const dfsTaskRequests = suburbs.map((s) => ({
      keyword: `${keyword} ${s.name}`,
      location_name: s.dataforseo_location_name ?? `${s.name},${s.state},Australia`,
      language_name: "English",
      device: "desktop",
      os: "windows",
      tag: `serpmap_${reportId}_${s.suburb_id}`,
    }));

    const postedTasks = await postLocalPackTasks(dfsTaskRequests);

    // Map taskId back to result rows by tag
    await Promise.allSettled(
      postedTasks.map(({ tag, taskId }) => {
        const suburbId = tag.split("_").pop();
        return execute(
          `UPDATE serpmap_results
           SET dataforseo_task_id = $1, dataforseo_status = 'processing'
           WHERE report_id = $2 AND suburb_id = $3`,
          [taskId, reportId, suburbId]
        );
      })
    );

    // ──────────────────────────────────────────
    // 8. Update quota counter
    // ──────────────────────────────────────────
    await execute(
      `INSERT INTO serpmap_quota (quota_date, reports_count, api_calls_used, daily_limit, updated_at)
       VALUES ($1, 1, $2, $3, NOW())
       ON CONFLICT (quota_date) DO UPDATE
         SET reports_count  = serpmap_quota.reports_count + 1,
             api_calls_used = serpmap_quota.api_calls_used + $2,
             updated_at     = NOW()`,
      [today, suburbs.length, dailyLimit]
    );

    const response: AnalyzeResponse = {
      report_id: reportId,
      status: "processing",
      cached: false,
      business_name: businessName ?? undefined,
      business_address: businessAddress ?? undefined,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[analyze] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
