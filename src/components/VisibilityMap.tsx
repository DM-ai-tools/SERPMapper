"use client";

/**
 * VisibilityMap — Leaflet heat-map of suburb-level Google Maps rankings.
 *
 * Rendering strategy (priority order):
 *  1. GeoJSON polygon  — from suburb_coordinates.geojson_polygon via /api/suburb-geo
 *  2. Circle marker    — fallback when polygon hasn't loaded yet (during streaming)
 *
 * The parent MUST render this component with:
 *   const VisibilityMap = dynamic(() => import("./VisibilityMap"), { ssr: false })
 * because Leaflet uses browser-only APIs.
 */

import { useEffect, useRef, useCallback } from "react";
import {
  SerpMapResult,
  SuburbCoordinate,
  GeoJSONPolygon,
  getRankBand,
  RANK_COLORS,
  RANK_LABELS,
} from "@/lib/types";

// Module-level Leaflet reference (avoid re-importing)
let L: typeof import("leaflet") | null = null;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface VisibilityMapProps {
  results: SerpMapResult[];
  businessLat: number;
  businessLng: number;
  /** true = email-gate mode — show only first 10 suburbs with blur overlay */
  isPartial?: boolean;
}

type LayerHandle =
  | import("leaflet").GeoJSON
  | import("leaflet").CircleMarker;

// ─────────────────────────────────────────────────────────────
// Helper: build tooltip HTML for a suburb result
// ─────────────────────────────────────────────────────────────
function tooltipHtml(result: SerpMapResult): string {
  const posText = result.rank_position
    ? `Position #${result.rank_position}${result.is_in_local_pack ? " (Local Pack)" : ""}`
    : "Not ranking in top 20";
  const volText =
    result.monthly_volume > 0
      ? `${result.monthly_volume.toLocaleString()} searches/mo`
      : "Volume unavailable";
  return `
    <div style="font-family:sans-serif;font-size:13px;line-height:1.5;min-width:140px;">
      <strong style="display:block;margin-bottom:2px;">${result.suburb_name}</strong>
      <span style="color:#555;">${posText}</span><br/>
      <span style="color:#888;font-size:11px;">${volText}</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// Helper: polygon style
// ─────────────────────────────────────────────────────────────
function polygonStyle(color: string, weight = 1) {
  return {
    fillColor: color,
    fillOpacity: 0.5,
    color: color,
    weight,
    opacity: 0.8,
  };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function VisibilityMap({
  results,
  businessLat,
  businessLng,
  isPartial = false,
}: VisibilityMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<import("leaflet").Map | null>(null);
  // Maps result_id → Leaflet layer (GeoJSON polygon or CircleMarker fallback)
  const layersRef = useRef<Map<string, LayerHandle>>(new Map());
  // Tracks which suburb_ids already have their polygon loaded
  const polygonLoadedRef = useRef<Set<string>>(new Set());

  // ── Fetch GeoJSON polygons for a batch of suburb_ids ─────────
  const fetchPolygons = useCallback(
    async (suburbIds: string[]): Promise<Record<string, GeoJSONPolygon>> => {
      if (suburbIds.length === 0) return {};
      try {
        const res = await fetch("/api/suburb-geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suburb_ids: suburbIds }),
        });
        if (!res.ok) return {};
        const data: Array<Pick<SuburbCoordinate, "suburb_id" | "geojson_polygon">> =
          await res.json();
        return Object.fromEntries(
          data
            .filter((d) => d.geojson_polygon)
            .map((d) => [d.suburb_id, d.geojson_polygon!])
        );
      } catch {
        return {};
      }
    },
    []
  );

  // ── Initialise map (runs once) ────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((leaflet) => {
      L = leaflet;

      // Fix Leaflet default icon path broken by webpack/Next.js
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [businessLat, businessLng],
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
      });

      // CARTO Positron — clean light-grey basemap; makes coloured polygons pop
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        }
      ).addTo(map);

      // Business location marker (on top of polygons, z-index handled by pane)
      const markerPane = map.createPane("markerPane");
      markerPane.style.zIndex = "650";
      L.marker([businessLat, businessLng], { pane: "markerPane" })
        .bindPopup(
          `<strong>Your business</strong><br/>${businessLat.toFixed(4)}, ${businessLng.toFixed(4)}`
        )
        .addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      layersRef.current.clear();
      polygonLoadedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessLat, businessLng]);

  // ── Render / update layers when results arrive ────────────────
  useEffect(() => {
    if (!mapInstanceRef.current || !L) return;

    const map = mapInstanceRef.current;
    const displayResults = isPartial ? results.slice(0, 10) : results;

    // ── Step 1: For results that already have a layer, just update colour
    //           For new results, add a circle-marker placeholder immediately
    const suburbIdsToFetch: string[] = [];

    for (const result of displayResults) {
      const band = getRankBand(result.rank_position);
      const color = RANK_COLORS[band];
      const existing = layersRef.current.get(result.result_id);

      if (existing) {
        // Update colour in-place (no re-create)
        (existing as import("leaflet").Path).setStyle(
          polygonStyle(color)
        );
      } else {
        // Add circle-marker as instant placeholder
        // Supabase doesn't store lat/lng on the result row — use business location
        // as a temporary pin until the polygon loads from suburb_coordinates.
        // The polygon will replace this circle once fetched.
        const circle = L!.circleMarker([businessLat, businessLng], {
          radius: 10,
          ...polygonStyle(color, 1),
        });
        circle.bindTooltip(tooltipHtml(result), {
          sticky: true,
          opacity: 1,
          className: "serp-tooltip",
        });
        circle.addTo(map);
        layersRef.current.set(result.result_id, circle);

        // Queue this suburb for polygon fetch if not already loaded
        if (result.suburb_id && !polygonLoadedRef.current.has(result.suburb_id)) {
          suburbIdsToFetch.push(result.suburb_id);
          polygonLoadedRef.current.add(result.suburb_id); // mark to avoid duplicate requests
        }
      }
    }

    // ── Step 2: Fetch actual suburb polygons and replace circle-markers ──
    if (suburbIdsToFetch.length === 0) return;

    fetchPolygons(suburbIdsToFetch).then((geoMap) => {
      if (!mapInstanceRef.current || !L) return;

      for (const result of displayResults) {
        if (!result.suburb_id) continue;
        const polygon = geoMap[result.suburb_id];
        if (!polygon) continue;

        const band = getRankBand(result.rank_position);
        const color = RANK_COLORS[band];

        // Remove the circle-marker placeholder
        const placeholder = layersRef.current.get(result.result_id);
        if (placeholder) {
          mapInstanceRef.current.removeLayer(placeholder);
        }

        // Add the real GeoJSON polygon
        const geoLayer = L!.geoJSON(
          polygon as GeoJSON.Geometry,
          {
            style: () => polygonStyle(color),
            onEachFeature: (_feature, layer) => {
              layer.bindTooltip(tooltipHtml(result), {
                sticky: true,
                opacity: 1,
                className: "serp-tooltip",
              });
              layer.on("mouseover", function (this: import("leaflet").Path) {
                this.setStyle({ weight: 2, fillOpacity: 0.7 });
              });
              layer.on("mouseout", function (this: import("leaflet").Path) {
                this.setStyle({ weight: 1, fillOpacity: 0.5 });
              });
            },
          }
        );

        geoLayer.addTo(mapInstanceRef.current);
        layersRef.current.set(result.result_id, geoLayer);
      }
    });
  }, [results, isPartial, businessLat, businessLng, fetchPolygons]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full rounded-xl" />

      {/* Email-gate blur overlay — covers outer 70% of map */}
      {isPartial && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, transparent 30%, rgba(255,255,255,0.88) 70%)",
              backdropFilter: "blur(5px)",
            }}
          />
          <div className="absolute inset-0 flex items-end justify-center pb-8">
            <p className="text-sm font-semibold text-gray-600 bg-white/80 rounded-full px-4 py-2 shadow">
              Enter your email to unlock the full map ↑
            </p>
          </div>
        </div>
      )}

      <MapLegend />

      {/* Tooltip styles injected inline — avoids needing a separate CSS file */}
      <style>{`
        .serp-tooltip {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
          padding: 8px 10px;
        }
        .serp-tooltip::before { display: none; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Map Legend
// ─────────────────────────────────────────────────────────────

function MapLegend() {
  const entries = (
    Object.keys(RANK_COLORS) as Array<keyof typeof RANK_COLORS>
  ).map((band) => ({ band, color: RANK_COLORS[band], label: RANK_LABELS[band] }));

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-3 text-xs space-y-1.5 z-[1000]">
      {entries.map(({ band, color, label }) => (
        <div key={band} className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded inline-block border border-gray-200 flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-700 font-medium">{label}</span>
        </div>
      ))}
    </div>
  );
}
