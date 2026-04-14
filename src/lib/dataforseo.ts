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

// ──────────────────────────────────────────────
// Post a batch of Local Pack tasks (async mode)
// Returns: array of { tag, taskId }
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
// Poll for completed tasks
// Returns array of task IDs ready for retrieval
// ──────────────────────────────────────────────
export async function getReadyTaskIds(): Promise<string[]> {
  const response = await dfsRequest<DFSApiResponse<Array<{ id: string }>>>(
    "GET",
    "/serp/google/maps/tasks_ready"
  );

  return (response.tasks?.[0]?.result ?? []).map((item) => item.id);
}

// ──────────────────────────────────────────────
// Retrieve a single task result
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
  const normUrl = normaliseDomain(businessUrl);

  for (const item of result.items ?? []) {
    const itemDomain = normaliseDomain(item.domain ?? item.url ?? "");

    // Exact domain match
    if (itemDomain && itemDomain === normUrl) {
      return {
        position: item.rank_absolute,
        inLocalPack: item.rank_group <= 3,
      };
    }

    // Fuzzy business name match as fallback
    if (businessName && item.title) {
      if (levenshteinDistance(item.title.toLowerCase(), businessName.toLowerCase()) < 3) {
        return {
          position: item.rank_absolute,
          inLocalPack: item.rank_group <= 3,
        };
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
