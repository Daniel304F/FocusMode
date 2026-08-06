/**
 * Domain module for site recommendations: interest detection and the
 * selection rules.
 *
 * Where candidates come from (the external suggestion API) is decided by
 * the adapter; this module only knows the selection and scoring rules.
 */
import { normalizeSite } from "./site.js";

/** Upper bound of kept recommendations. */
export const MAX_RECOMMENDATIONS = 24;
/** Maximum number of interest keywords taken into account. */
export const MAX_INTEREST_KEYWORDS = 8;
/** A stock older than three hours counts as stale. */
export const RECOMMENDATION_TTL_MS = 3 * 60 * 60 * 1000;

/**
 * Extracts keywords from a domain: the core name (second level label) plus
 * its parts split at dash and underscore; tokens shorter than three
 * characters are dropped.
 */
export function keywordsFromHost(hostname) {
  const normalized = normalizeSite(hostname);
  if (!normalized) return [];

  const segments = normalized.replace(/^www\./, "").split(".");
  const core = segments.length >= 2 ? segments[segments.length - 2] : segments[0] || "";
  const parts = core.split(/[-_]/).filter(Boolean);

  const out = new Set([core, ...parts]);
  return [...out].filter((token) => token.length >= 3);
}

/**
 * Weighs keywords from favorites (weight 4) and visited sites (weight 2)
 * and returns the heaviest ones, at most max entries. Without any sources
 * the result is empty (cold start, not an error).
 */
export function buildInterestKeywords(visitedHosts, favoriteSites, max = MAX_INTEREST_KEYWORDS) {
  const weightMap = new Map();
  const upsert = (keyword, weight) => {
    if (!keyword || keyword.length < 3) return;
    weightMap.set(keyword, (weightMap.get(keyword) || 0) + weight);
  };

  for (const site of favoriteSites || []) {
    for (const keyword of keywordsFromHost(site)) upsert(keyword, 4);
  }
  for (const site of visitedHosts || []) {
    for (const keyword of keywordsFromHost(site)) upsert(keyword, 2);
  }

  return [...weightMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([keyword]) => keyword)
    .slice(0, max);
}

/**
 * Scores a candidate: 2 points if the keyword occurs in the domain, 2 more
 * if it occurs in the name, and 1 extra point for a .com domain.
 */
export function recommendationScore(keyword, item) {
  const domain = (item.domain || "").toLowerCase();
  const name = (item.name || "").toLowerCase();
  let score = 0;
  if (domain.includes(keyword)) score += 2;
  if (name.includes(keyword)) score += 2;
  if (domain.endsWith(".com")) score += 1;
  return score;
}

/**
 * Builds the exclusion set: visited, favorited and blocked domains must
 * never be recommended.
 */
export function buildExclusionSet(visitedHosts, favoriteSites, blockedSites) {
  return new Set(
    [...(visitedHosts || []), ...(favoriteSites || []), ...(blockedSites || [])]
      .map((s) => normalizeSite(s))
      .filter(Boolean)
  );
}

/**
 * Selects the final recommendations from candidates per keyword: apply the
 * exclusions, deduplicate domains, cap at max, and sort by descending score.
 *
 * keywordItems is an array of { keyword, items: [{domain, name, logo}] }
 * in keyword priority order.
 */
export function selectRecommendations(keywordItems, excluded, max = MAX_RECOMMENDATIONS) {
  const recommendations = [];
  const seenDomains = new Set();

  outer: for (const { keyword, items } of keywordItems || []) {
    for (const item of items || []) {
      const domain = normalizeSite(item.domain);
      if (!domain || excluded.has(domain) || seenDomains.has(domain)) continue;

      seenDomains.add(domain);
      recommendations.push({
        domain,
        name: item.name || domain,
        logo: item.logo || "",
        sourceKeyword: keyword,
        score: recommendationScore(keyword, item),
      });

      if (recommendations.length >= max) break outer;
    }
  }

  recommendations.sort((a, b) => b.score - a.score);
  return recommendations;
}

/** A stock needs a refresh when it is missing or older than the TTL. */
export function needsRefresh(existing, now, ttlMs = RECOMMENDATION_TTL_MS) {
  return now - (existing?.updatedAt || 0) > ttlMs;
}
