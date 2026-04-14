import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * POST /api/suburb-geo
 *
 * Returns GeoJSON polygons for a list of suburb_ids.
 * Called by VisibilityMap to replace circle-marker placeholders with
 * real suburb boundary polygons once DataforSEO results stream in.
 *
 * Body:  { suburb_ids: string[] }
 * Reply: Array<{ suburb_id: string, geojson_polygon: GeoJSONPolygon | null }>
 *
 * Polygons can be large — we only return suburb_id and geojson_polygon
 * (not the full suburb row) to keep the response small.
 *
 * Max 100 suburb_ids per request to prevent abuse.
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

    // Hard cap — prevents fetching entire suburb table
    const ids = suburb_ids.slice(0, 100);

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from("suburb_coordinates")
      .select("suburb_id, lat, lng, geojson_polygon")
      .in("suburb_id", ids);

    if (error) {
      console.error("[suburb-geo] Supabase error:", error.message);
      return NextResponse.json({ error: "Database error" }, { status: 500 });
    }

    // Return all rows — polygons may be null for suburbs where ABS data wasn't available.
    // The VisibilityMap falls back to circle-markers for null polygons.
    return NextResponse.json(data ?? [], {
      headers: {
        // Cache for 24 hours — suburb boundaries never change
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("[suburb-geo] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
