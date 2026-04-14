import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { resolveBusinessFromUrl } from "@/lib/places";
import { getSuburbsInRadius, buildCacheKey, getSuburbVolume } from "@/lib/suburbs";
import { postLocalPackTasks } from "@/lib/dataforseo";
import { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

export const maxDuration = 60; // Vercel Pro allows up to 60s for API routes

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

    const supabase = createAdminClient();

    // ──────────────────────────────────────────
    // 1. Daily quota guard
    // ──────────────────────────────────────────
    const today = new Date().toISOString().split("T")[0];
    const { data: quota } = await supabase
      .from("serpmap_quota")
      .select("reports_count, daily_limit")
      .eq("quota_date", today)
      .single();

    const dailyLimit = Number(process.env.DAILY_REPORT_QUOTA ?? 200);
    if (quota && quota.reports_count >= (quota.daily_limit ?? dailyLimit)) {
      return NextResponse.json(
        { error: "Daily report quota reached. Try again after midnight AEST." },
        { status: 429 }
      );
    }

    // ──────────────────────────────────────────
    // 2. Cache check — same business+keyword+radius within 7 days
    // ──────────────────────────────────────────
    const cacheKey = buildCacheKey(url, keyword, radius_km);
    const { data: cached } = await supabase
      .from("serpmap_cache_index")
      .select("report_id, expires_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .single();

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

    // If Places API fails, use city geocoding as fallback
    const businessLat = business?.lat ?? null;
    const businessLng = business?.lng ?? null;
    const businessName = business?.name ?? null;
    const businessAddress = business?.address ?? null;

    if (!businessLat || !businessLng) {
      return NextResponse.json(
        {
          error:
            "Could not locate this business. Please check the URL or try entering the suburb manually.",
        },
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
    const { data: report, error: reportError } = await supabase
      .from("serpmap_reports")
      .insert({
        business_url: url,
        business_name: businessName,
        keyword,
        city,
        business_lat: businessLat,
        business_lng: businessLng,
        business_address: businessAddress,
        radius_km,
        status: "processing",
        suburbs_total: suburbs.length,
        cache_key: cacheKey,
      })
      .select("report_id")
      .single();

    if (reportError || !report) {
      throw new Error(`Failed to create report: ${reportError?.message}`);
    }

    const reportId = report.report_id as string;

    // ──────────────────────────────────────────
    // 6. Create result placeholder rows
    // ──────────────────────────────────────────
    const resultRows = suburbs.map((s) => ({
      report_id: reportId,
      suburb_id: s.suburb_id,
      suburb_name: s.name,
      suburb_state: s.state,
      monthly_volume: getSuburbVolume(s, keyword),
      dataforseo_status: "pending" as const,
    }));

    const { error: resultsError } = await supabase
      .from("serpmap_results")
      .insert(resultRows);

    if (resultsError) throw new Error(`Failed to insert result rows: ${resultsError.message}`);

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
    const taskUpdatePromises = postedTasks.map(async ({ tag, taskId }) => {
      const suburbId = tag.split("_").pop();
      return supabase
        .from("serpmap_results")
        .update({ dataforseo_task_id: taskId, dataforseo_status: "processing" })
        .eq("report_id", reportId)
        .eq("suburb_id", suburbId);
    });

    await Promise.allSettled(taskUpdatePromises);

    // ──────────────────────────────────────────
    // 8. Update quota counter
    // ──────────────────────────────────────────
    await supabase.from("serpmap_quota").upsert({
      quota_date: today,
      reports_count: (quota?.reports_count ?? 0) + 1,
      api_calls_used: (quota?.reports_count ?? 0) + suburbs.length,
      daily_limit: dailyLimit,
      updated_at: new Date().toISOString(),
    });

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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
