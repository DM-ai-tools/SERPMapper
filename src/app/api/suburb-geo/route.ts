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
    const rows = await query<{ suburb_id: string; lat: number; lng: number; geojson_polygon: unknown }>(
      `SELECT suburb_id, lat, lng, geojson_polygon
       FROM suburb_coordinates
       WHERE suburb_id IN (${placeholders})`,
      ids
    );

    return NextResponse.json(rows, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[suburb-geo] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
