"use client";

/**
 * VisibilityMap — Leaflet heat-map of suburb-level Google Maps rankings.
 *
 * Rendering strategy (priority order):
 *  1. GeoJSON polygon — from suburb_coordinates.geojson_polygon via /api/suburb-geo (requires ABS GeoJSON seed)
 *  2. Leaflet Circle  — geographic radius in metres when no polygon (scales with zoom like the basemap)
 *
 * We do NOT use pixel-based CircleMarkers for the final layer: they keep a fixed *screen* size, so zooming
 * in makes dots look tiny relative to the map (and zooming out makes them look huge). Metre-based circles
 * behave like approximate suburb footprints until real boundaries exist in the DB.
 *
 * The parent MUST render this component with:
 *   const VisibilityMap = dynamic(() => import("./VisibilityMap"), { ssr: false })
 * because Leaflet uses browser-only APIs.
 *
 * Race-condition note: Leaflet loads asynchronously. Results from SSE may arrive
 * before the map is ready. We keep resultsRef always up-to-date so the map
 * initialisation callback can immediately draw whatever results already exist.
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
  | import("leaflet").Circle;

/** Approximate footprint when no polygon — keep modest so dense metros don’t look like one blob. */
const FALLBACK_SUBURB_RADIUS_METERS = 1100;

// ─────────────────────────────────────────────────────────────
// Helper: build tooltip HTML for a suburb result
// ─────────────────────────────────────────────────────────────
/** UUID / id keys must match between client results and /api/suburb-geo (pg often lowercases UUIDs). */
function normSid(id: string | null | undefined): string {
  if (id == null || id === "") return "";
  return String(id).trim().toLowerCase();
}

function tooltipHtml(result: SerpMapResult): string {
  const posText = result.rank_position
    ? `Position #${result.rank_position}${result.is_in_local_pack ? " (Local Pack)" : ""}`
    : "Not ranking in top 20";
  return `
    <div style="font-family:sans-serif;font-size:13px;line-height:1.5;min-width:140px;">
      <strong style="display:block;margin-bottom:2px;">${result.suburb_name}</strong>
      <span style="color:#555;">${posText}</span><br/>
      <span style="color:#888;font-size:11px;">Keyword demand for your city is shown in the report panel.</span>
    </div>`;
}

// ─────────────────────────────────────────────────────────────
// Helper: polygon style
// ─────────────────────────────────────────────────────────────
function polygonStyle(color: string, weight = 0.75) {
  return {
    fillColor: color,
    fillOpacity: 0.38,
    color: color,
    weight,
    opacity: 0.85,
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
  const initializingMapRef = useRef(false);
  // Always holds the latest results so map-init callback can render them
  const resultsRef = useRef<SerpMapResult[]>(results);
  const isPartialRef = useRef(isPartial);
  // Maps result_id → Leaflet layer (GeoJSON polygon or metre-based Circle fallback)
  const layersRef = useRef<Map<string, LayerHandle>>(new Map());
  const didAutoFitRef = useRef(false);

  // ── Fetch GeoJSON polygons for a batch of suburb_ids ─────────
  const fetchPolygons = useCallback(
    async (
      suburbIds: string[]
    ): Promise<Record<string, { polygon?: GeoJSONPolygon; lat?: number; lng?: number }>> => {
      if (suburbIds.length === 0) return {};
      try {
        const res = await fetch("/api/suburb-geo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ suburb_ids: suburbIds }),
        });
        if (!res.ok) return {};
        const data: Array<Pick<SuburbCoordinate, "suburb_id" | "geojson_polygon" | "lat" | "lng">> =
          await res.json();
        return Object.fromEntries(
          data.map((d) => [
            normSid(d.suburb_id),
            {
              polygon: d.geojson_polygon ?? undefined,
              lat: toNumberOrUndefined(d.lat),
              lng: toNumberOrUndefined(d.lng),
            },
          ])
        );
      } catch {
        return {};
      }
    },
    []
  );

  // ── Core render function: draw/update layers on the map ───────
  // Extracted so it can be called from both the map-init callback
  // and the results-changed effect without duplicating logic.
  const renderLayers = useCallback(
    (currentResults: SerpMapResult[], partial: boolean) => {
      if (!mapInstanceRef.current || !L) return;

      const displayResults = partial ? currentResults.slice(0, 10) : currentResults;
      const displayIds = new Set(displayResults.map((r) => r.result_id));

      // Remove layers that belong to a previous dataset (e.g. device toggle switch).
      // Without this, old red/green polygons can remain and make counts look incorrect.
      const staleLayerIds: string[] = [];
      layersRef.current.forEach((_layer, resultId) => {
        if (!displayIds.has(resultId)) staleLayerIds.push(resultId);
      });
      staleLayerIds.forEach((resultId) => {
        const layer = layersRef.current.get(resultId);
        if (!layer) return;
        try {
          mapInstanceRef.current?.removeLayer(layer);
        } catch {
          // Ignore layer removal edge cases.
        }
        layersRef.current.delete(resultId);
      });

      // 1) Update colours for layers we already have (rank may change during streaming)
      for (const result of displayResults) {
        const band = getRankBand(result.rank_position);
        const color = RANK_COLORS[band];
        const existing = layersRef.current.get(result.result_id);
        if (existing) {
          (existing as import("leaflet").Path).setStyle(polygonStyle(color));
        }
      }

      // 2) Fetch coordinates / polygons only for results not yet drawn (never use business lat/lng as placeholder)
      const pending = displayResults.filter(
        (r) => r.suburb_id && !layersRef.current.has(r.result_id)
      );
      if (pending.length === 0) return;

      const suburbIdsToFetch = Array.from(
        new Set(pending.map((r) => normSid(r.suburb_id)).filter(Boolean))
      );

      fetchPolygons(suburbIdsToFetch).then((geoMap) => {
        if (!mapInstanceRef.current || !L) return;

        const map = mapInstanceRef.current;
        let combinedBounds: import("leaflet").LatLngBounds | null = null;
        const extendBounds = (lat: number, lng: number) => {
          const ll = L!.latLng(lat, lng);
          if (!combinedBounds) combinedBounds = L!.latLngBounds(ll, ll);
          else combinedBounds.extend(ll);
        };
        extendBounds(businessLat, businessLng);

        for (const result of pending) {
          if (!result.suburb_id) continue;
          if (layersRef.current.has(result.result_id)) continue;

          const geo = geoMap[normSid(result.suburb_id)];
          if (!geo) continue;

          const band = getRankBand(result.rank_position);
          const color = RANK_COLORS[band];

          if (geo.polygon) {
            const geoLayer = L!.geoJSON(geo.polygon as GeoJSON.Geometry, {
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
            });
            geoLayer.addTo(map);
            layersRef.current.set(result.result_id, geoLayer);
            try {
              const gb = geoLayer.getBounds();
              if (gb.isValid()) {
                if (!combinedBounds) combinedBounds = gb;
                else combinedBounds.extend(gb);
              }
            } catch {
              /* ignore */
            }
          } else if (geo.lat != null && geo.lng != null) {
            const lat = Number(geo.lat);
            const lng = Number(geo.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
            const circle = L!.circle([lat, lng], {
              radius: FALLBACK_SUBURB_RADIUS_METERS,
              ...polygonStyle(color, 1),
            });
            circle.bindTooltip(tooltipHtml(result), {
              sticky: true,
              opacity: 1,
              className: "serp-tooltip",
            });
            circle.addTo(map);
            layersRef.current.set(result.result_id, circle);
            try {
              const cb = circle.getBounds();
              if (cb.isValid()) {
                if (!combinedBounds) combinedBounds = cb;
                else combinedBounds.extend(cb);
              }
            } catch {
              /* ignore */
            }
          }
        }

        map.invalidateSize();
        layersRef.current.forEach((layer) => {
          const path = layer as import("leaflet").Path & { redraw?: () => void };
          if (typeof path.redraw === "function") path.redraw();
        });

        // Frame business + suburbs so rings aren’t all visually piled on the centre.
        const addedInThisPass = pending.filter((r) => layersRef.current.has(r.result_id)).length;
        if (
          !didAutoFitRef.current &&
          addedInThisPass > 0 &&
          combinedBounds &&
          combinedBounds.isValid()
        ) {
          didAutoFitRef.current = true;
          map.fitBounds(combinedBounds, { padding: [40, 48], maxZoom: 13 });
        }
      });
    },
    [fetchPolygons, businessLat, businessLng]
  );

  // ── Keep refs in sync with latest props ──────────────────────
  useEffect(() => {
    resultsRef.current = results;
    isPartialRef.current = isPartial;
  });

  // ── Initialise map (runs once) ────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current || initializingMapRef.current) return;
    initializingMapRef.current = true;

    import("leaflet").then((leaflet) => {
      if (!mapRef.current || mapInstanceRef.current) {
        initializingMapRef.current = false;
        return;
      }
      L = leaflet;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [businessLat, businessLng],
        zoom: 11,
        zoomControl: true,
        attributionControl: true,
      });

      /** Geographic circles/polygons must redraw when zoom changes (fixes edge cases in flex layouts). */
      const redrawOverlayPaths = () => {
        layersRef.current.forEach((layer) => {
          const path = layer as import("leaflet").Path & { redraw?: () => void };
          if (typeof path.redraw === "function") path.redraw();
        });
      };
      map.on("zoomend", redrawOverlayPaths);

      map.whenReady(() => {
        map.invalidateSize();
        redrawOverlayPaths();
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 20,
        }
      ).addTo(map);

      const markerPane = map.createPane("markerPane");
      markerPane.style.zIndex = "650";
      L.marker([businessLat, businessLng], { pane: "markerPane" })
        .bindPopup(
          `<strong>Your business</strong><br/>${businessLat.toFixed(4)}, ${businessLng.toFixed(4)}`
        )
        .addTo(map);

      mapInstanceRef.current = map;
      initializingMapRef.current = false;

      // ── Draw any results that arrived before the map was ready ──
      if (resultsRef.current.length > 0) {
        renderLayers(resultsRef.current, isPartialRef.current);
      }
    }).catch(() => {
      initializingMapRef.current = false;
    });

    return () => {
      didAutoFitRef.current = false;
      mapInstanceRef.current?.remove();
      mapInstanceRef.current = null;
      layersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render / update layers when results arrive ────────────────
  useEffect(() => {
    // Guard: if the map isn't ready yet, the init callback will call renderLayers
    // once it finishes, so we skip here to avoid double-rendering.
    if (!mapInstanceRef.current || !L) return;
    renderLayers(results, isPartial);
  }, [results, isPartial, renderLayers]);

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
        /* Softer “heat” where suburb areas overlap (Leaflet SVG paths) */
        .leaflet-overlay-pane svg path {
          mix-blend-mode: multiply;
        }
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

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// ─────────────────────────────────────────────────────────────
// Map Legend
// ─────────────────────────────────────────────────────────────

function MapLegend() {
  const entries = (
    Object.keys(RANK_COLORS) as Array<keyof typeof RANK_COLORS>
  ).map((band) => ({ band, color: RANK_COLORS[band], label: RANK_LABELS[band] }));

  return (
    <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-lg p-3 text-xs space-y-1.5 z-[1000] max-w-[220px]">
      {entries.map(({ band, color, label }) => (
        <div key={band} className="flex items-center gap-2">
          <span
            className="w-4 h-4 rounded inline-block border border-gray-200 flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="text-gray-700 font-medium">{label}</span>
        </div>
      ))}
      <p className="text-[10px] text-gray-500 leading-snug pt-1 border-t border-gray-100 mt-1">
        Each suburb is centred on its real coordinates; rings scale when you zoom. True outlines need{" "}
        <code className="text-[9px] bg-gray-100 px-0.5 rounded">npm run backfill:polygons</code>.
      </p>
    </div>
  );
}
