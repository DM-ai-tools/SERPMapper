// ============================================================
// DataforSEO API client for SERPMapper
// Docs: https://docs.dataforseo.com/v3/serp/google/maps/
// ============================================================

const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

function getAuthHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DataforSEO credentials not configured");
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

async function dfsRequest<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${DATAFORSEO_BASE}${path}`, {
    method,
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataforSEO ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ──────────────────────────────────────────────
// Types (minimal — only what SERPMapper needs)
// ──────────────────────────────────────────────

export interface DFSTaskPostRequest {
  keyword: string;
  location_name: string;
  language_name: string;
  device?: string;
  os?: string;
  tag?: string;
}

interface DFSTaskPostResponseItem {
  id: string;
  status_code: number;
  status_message: string;
  tag?: string;
}

interface DFSApiResponse<T> {
  status_code: number;
  tasks: Array<{
    id: string;
    status_code: number;
    status_message: string;
    result?: T;
    data?: { tag?: string };
  }>;
}

export interface DFSMapResultItem {
  type: string;
  rank_group: number;
  rank_absolute: number;
  domain: string;
  title: string;
  url?: string;
  rating?: { rating_max: number; value: number; votes_count: number };
}

export interface DFSTaskResult {
  items: DFSMapResultItem[];
}

export interface DFSKeywordVolumeItem {
  keyword: string;
  search_volume?: number;
  monthly_searches?: number;
  keyword_info?: {
    search_volume?: number;
    monthly_searches?: number;
  };
}

// ──────────────────────────────────────────────
// Live endpoint — returns results synchronously.
//
// IMPORTANT: The live endpoint only accepts ONE task per request.
// We fan out all tasks concurrently (in batches of 5 to avoid
// rate-limit errors), then collect all results.
// ──────────────────────────────────────────────
export interface LiveTaskResult {
  tag: string;
  result: DFSTaskResult | null;
}

export async function getLiveResults(
  tasks: DFSTaskPostRequest[],
  opts?: {
    onTask?: (task: LiveTaskResult) => void | Promise<void>;
  }
): Promise<LiveTaskResult[]> {
  const BATCH = 5; // max concurrent requests
  const results: LiveTaskResult[] = [];

  for (let i = 0; i < tasks.length; i += BATCH) {
    const slice = tasks.slice(i, i + BATCH);
    const batch = await Promise.all(
      slice.map((task) =>
        dfsRequest<DFSApiResponse<DFSTaskResult[]>>(
          "POST",
          "/serp/google/maps/live/advanced",
          [task] // single task per request — live endpoint requirement
        )
          .then((res) => ({
            tag:    res.tasks?.[0]?.data?.tag ?? task.tag ?? "",
            result: res.tasks?.[0]?.result?.[0] ?? null,
          }))
          .catch((err) => {
            console.warn(`[dataforseo] live task failed for tag=${task.tag}:`, err);
            return { tag: task.tag ?? "", result: null };
          })
      )
    );

    // Allow callers to update progress after each finished task.
    // (Batch tasks run concurrently; we stream progress at batch granularity.)
    if (opts?.onTask) {
      for (const item of batch) {
        await opts.onTask(item);
      }
    }

    results.push(...batch);
  }

  return results;
}

// ──────────────────────────────────────────────
// Keywords Data API (Google Ads) — monthly volume
// Returns Map<keyword, volume>
// ──────────────────────────────────────────────
export async function getKeywordVolumes(
  keywords: string[]
): Promise<Map<string, number>> {
  if (!keywords.length) return new Map();

  const response = await dfsRequest<DFSApiResponse<DFSKeywordVolumeItem[]>>(
    "POST",
    "/keywords_data/google_ads/search_volume/live",
    [
      {
        keywords,
        location_code: 2036, // Australia
        language_code: "en",
      },
    ]
  );

  const rows = response.tasks?.[0]?.result ?? [];
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = (row.keyword ?? "").trim();
    if (!key) continue;
    const volume = Number(
      row.search_volume ??
      row.monthly_searches ??
      row.keyword_info?.search_volume ??
      row.keyword_info?.monthly_searches ??
      NaN
    );
    if (Number.isFinite(volume)) {
      map.set(key, volume);
    }
  }
  return map;
}

// ──────────────────────────────────────────────
// Post a batch of Local Pack tasks (async mode)
// Kept for reference / fallback
// ──────────────────────────────────────────────
export async function postLocalPackTasks(
  tasks: DFSTaskPostRequest[]
): Promise<Array<{ tag: string; taskId: string }>> {
  const response = await dfsRequest<DFSApiResponse<DFSTaskPostResponseItem[]>>(
    "POST",
    "/serp/google/maps/task_post",
    tasks
  );

  return (response.tasks ?? [])
    .filter((t) => t.status_code === 20100)
    .map((t) => ({
      tag: t.data?.tag ?? "",
      taskId: t.id,
    }));
}

// ──────────────────────────────────────────────
// Poll for completed tasks (async mode only)
// ──────────────────────────────────────────────
export async function getReadyTaskIds(): Promise<string[]> {
  const response = await dfsRequest<DFSApiResponse<Array<{ id: string }>>>(
    "GET",
    "/serp/google/maps/tasks_ready"
  );

  return (response.tasks?.[0]?.result ?? []).map((item) => item.id);
}

// ──────────────────────────────────────────────
// Retrieve a single async task result
// ──────────────────────────────────────────────
export async function getTaskResult(taskId: string): Promise<DFSTaskResult | null> {
  const response = await dfsRequest<DFSApiResponse<DFSTaskResult[]>>(
    "GET",
    `/serp/google/maps/task_get/advanced/${taskId}`
  );

  return response.tasks?.[0]?.result?.[0] ?? null;
}

// ──────────────────────────────────────────────
// Domain matching: find rank position for the
// submitted business URL within a task result.
// Returns null if not found in top 20.
// ──────────────────────────────────────────────
export function findBusinessRank(
  result: DFSTaskResult,
  businessUrl: string,
  businessName?: string | null
): { position: number | null; inLocalPack: boolean } {
  const normUrl  = normaliseDomain(businessUrl);
  const bizWords = businessName
    ? businessName.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(w => w.length > 2)
    : [];

  for (const item of result.items ?? []) {
    const itemDomain = normaliseDomain(item.domain ?? item.url ?? "");
    const hit = () => ({ position: item.rank_absolute, inLocalPack: item.rank_group <= 3 });

    // 1. Exact domain match (e.g. racv.com.au === racv.com.au)
    if (itemDomain && itemDomain === normUrl) return hit();

    // 2. Subdomain match (e.g. hawthorn.jimsplumbing.com.au contains jimsplumbing.com.au)
    if (itemDomain && normUrl && itemDomain.endsWith(`.${normUrl}`)) return hit();

    // 3. Parent domain match (e.g. servicetoday.com.au matches servicetoday.com.au/plumbers/…)
    if (itemDomain && normUrl && normUrl.endsWith(`.${itemDomain}`)) return hit();

    // 4. Business name words: if 2+ significant words from the business name appear in the
    //    listing title, it's a confident match (handles franchise local branch names).
    if (bizWords.length >= 2 && item.title) {
      const titleLower = item.title.toLowerCase();
      const matchedWords = bizWords.filter(w => titleLower.includes(w));
      if (matchedWords.length >= Math.min(2, bizWords.length)) return hit();
    }

    // 5. Levenshtein fallback for short business names (distance < 20% of name length)
    if (businessName && item.title) {
      const maxDist = Math.max(3, Math.floor(businessName.length * 0.2));
      if (levenshteinDistance(item.title.toLowerCase(), businessName.toLowerCase()) <= maxDist) {
        return hit();
      }
    }
  }

  return { position: null, inLocalPack: false };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function normaliseDomain(url: string): string {
  return url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/$/, "")
    .split("/")[0]
    .split("?")[0];
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}
