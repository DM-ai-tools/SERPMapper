// ============================================================
// Shared TypeScript types for SERPMapper
// ============================================================

export type ReportStatus = "pending" | "processing" | "partial" | "completed" | "failed";
export type DataforSEOStatus = "pending" | "processing" | "completed" | "error";

export interface SuburbCoordinate {
  suburb_id: string;
  name: string;
  state: string;
  postcode: string;
  lat: number;
  lng: number;
  population: number | null;
  dataforseo_location_name: string | null;
  geojson_polygon: GeoJSONPolygon | null;
  search_volume_plumber: number;
  search_volume_electrician: number;
  search_volume_dentist: number;
  search_volume_cleaner: number;
  search_volume_mechanic: number;
}

export interface GeoJSONPolygon {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export interface SerpMapReport {
  report_id: string;
  business_url: string;
  business_name: string | null;
  keyword: string;
  city: string;
  city_monthly_volume: number | null;
  business_lat: number | null;
  business_lng: number | null;
  business_address: string | null;
  radius_km: number;
  status: ReportStatus;
  visibility_score: number | null;
  summary_text: string | null;
  cta_copy: string | null;
  suburbs_checked: number;
  suburbs_total: number;
  cached_until: string | null;
  created_at: string;
  completed_at: string | null;
  cache_key: string | null;
}

export interface SerpMapResult {
  result_id: string;
  report_id: string;
  suburb_id: string | null;
  suburb_name: string;
  suburb_state: string | null;
  rank_position: number | null;
  is_in_local_pack: boolean;
  monthly_volume: number;
  dataforseo_task_id: string | null;
  dataforseo_status: DataforSEOStatus;
  created_at: string;
  updated_at: string;
}

export interface OpportunityCard {
  card_id: string;
  report_id: string;
  suburb_name: string;
  rank_position: number | null;
  monthly_volume: number;
  card_text: string;
  display_order: number;
}

export interface SerpMapLead {
  lead_id: string;
  email: string;
  report_id: string | null;
  business_name: string | null;
  business_url: string | null;
  primary_keyword: string | null;
  top_missed_suburb: string | null;
  utm_source: string | null;
  created_at: string;
}

// ──────────────────────────────────────────────
// API request/response shapes
// ──────────────────────────────────────────────

export interface AnalyzeRequest {
  url: string;
  keyword: string;
  city: string;
  radius_km?: number;
}

export interface AnalyzeResponse {
  report_id: string;
  status: ReportStatus;
  cached: boolean;
  business_name?: string;
  business_address?: string;
}

export interface LeadCaptureRequest {
  email: string;
  report_id: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface LeadCaptureResponse {
  success: boolean;
  lead_id: string;
}

// ──────────────────────────────────────────────
// Scoring helpers
// ──────────────────────────────────────────────

export type RankBand = "top3" | "page1" | "page2" | "missing" | "nodata";

export function getRankBand(position: number | null | undefined): RankBand {
  if (position === null || position === undefined) return "missing";
  if (position <= 3)  return "top3";
  if (position <= 10) return "page1";
  if (position <= 20) return "page2";
  return "missing";
}

export const RANK_COLORS: Record<RankBand, string> = {
  top3:    "#22C55E",
  page1:   "#86EFAC",
  page2:   "#FCD34D",
  missing: "#EF4444",
  nodata:  "#D1D5DB",
};

export const RANK_LABELS: Record<RankBand, string> = {
  top3:    "Top 3 — Highly Visible",
  page1:   "Page 1 — Visible",
  page2:   "Page 2 — Weak",
  missing: "Not Visible",
  nodata:  "No Data",
};

export const RANK_WEIGHTS: Record<RankBand, number> = {
  top3:    1.0,
  page1:   0.6,
  page2:   0.3,
  missing: 0,
  nodata:  0,
};
