import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * POST /api/suburb-geo
 * Returns GeoJSON polygons for a list of suburb_ids.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const suburb_ids: string[] = body?.suburb_ids ?? [];

    if (!Array.isArray(suburb_ids) || suburb_ids.length === 0) {
      return NextResponse.json(
        { error: "suburb_ids must be a non-empty array" },
        { status: 400 }
      );
    }

    const ids = suburb_ids.slice(0, 100);

    // Build a parameterised IN clause: ($1,$2,$3,...)
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");
    const rows = await query<{ suburb_id: string; lat: unknown; lng: unknown; geojson_polygon: unknown }>(
      `SELECT suburb_id, lat, lng, geojson_polygon
       FROM suburb_coordinates
       WHERE suburb_id IN (${placeholders})`,
      ids
    );

    // pg often returns DECIMAL columns as strings — Leaflet needs real numbers for geographic circles
    const normalized = rows.map((r) => {
      const lat = typeof r.lat === "number" ? r.lat : Number(r.lat);
      const lng = typeof r.lng === "number" ? r.lng : Number(r.lng);
      return {
        suburb_id: String(r.suburb_id).trim().toLowerCase(),
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        geojson_polygon: r.geojson_polygon,
      };
    });

    return NextResponse.json(normalized, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[suburb-geo] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
