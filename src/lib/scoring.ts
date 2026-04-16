import { SerpMapResult, getRankBand, RANK_WEIGHTS } from "./types";

/**
 * Calculate the SERPMapper Visibility Score (0–100).
 *
 * Formula:
 *   Score = SUM(rankWeight(position) × normalisedVolume) / totalPossibleScore × 100
 *
 * Rank weights: pos 1-3 = 1.0 | pos 4-10 = 0.6 | pos 11-20 = 0.3 | not ranking = 0
 * Search volume weight: each suburb's volume normalised against the highest-volume suburb.
 * This ensures visibility in high-demand suburbs counts more.
 */
export function calculateVisibilityScore(results: SerpMapResult[]): number {
  if (results.length === 0) return 0;

  const rawMaxVolume = Math.max(...results.map((r) => r.monthly_volume || 0), 0);
  // If we have no volume data for this keyword (all zeros), fall back to
  // equal weighting so the score still reflects ranking positions.
  const maxVolume = rawMaxVolume === 0 ? 1 : rawMaxVolume;

  let weightedSum = 0;
  let totalPossible = 0;

  for (const result of results) {
    const volumeWeight = rawMaxVolume === 0 ? 1 : (result.monthly_volume || 0) / maxVolume;
    const rankWeight = RANK_WEIGHTS[getRankBand(result.rank_position)];

    weightedSum += rankWeight * volumeWeight;
    totalPossible += volumeWeight; // max if ranked #1 everywhere
  }

  if (totalPossible === 0) return 0;

  return Math.round((weightedSum / totalPossible) * 100);
}

/**
 * Return the top N suburbs where the business is NOT ranking,
 * sorted by monthly search volume descending.
 */
export function getTopMissedSuburbs(
  results: SerpMapResult[],
  limit = 5
): SerpMapResult[] {
  return results
    .filter((r) => r.rank_position === null)
    .sort((a, b) => (b.monthly_volume || 0) - (a.monthly_volume || 0))
    .slice(0, limit);
}

/**
 * Return a compact summary object suitable for passing to Claude.
 */
export function buildReportSummary(
  results: SerpMapResult[],
  businessName: string,
  keyword: string
) {
  const total = results.length;
  const ranking = results.filter((r) => r.rank_position !== null);
  const top3 = results.filter((r) => r.rank_position !== null && r.rank_position <= 3);
  const missed = getTopMissedSuburbs(results, 5);
  const score = calculateVisibilityScore(results);

  return {
    businessName,
    keyword,
    score,
    total,
    rankingCount: ranking.length,
    top3Count: top3.length,
    missedCount: total - ranking.length,
    topMissedSuburbs: missed.map((r) => ({
      name: r.suburb_name,
      volume: r.monthly_volume,
    })),
    topRankedSuburbs: ranking
      .sort((a, b) => (a.rank_position ?? 99) - (b.rank_position ?? 99))
      .slice(0, 3)
      .map((r) => ({ name: r.suburb_name, position: r.rank_position })),
  };
}
