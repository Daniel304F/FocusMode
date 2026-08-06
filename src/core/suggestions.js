/**
 * Domain module for the autocomplete shown while blocking a site: ranking
 * of the suggested domains.
 */
import { normalizeSite } from "./site.js";

/**
 * Relevance of a match. Prefix matches clearly beat substring matches
 * (100 versus 55 points); closeness in length to the query adds up to 20;
 * the source contributes its base score (favorites above visited sites
 * above already blocked sites above the static top list).
 */
export function scoreSuggestion(query, domain, baseScore) {
  return (
    baseScore +
    (domain.startsWith(query) ? 100 : 55) +
    Math.max(0, 20 - Math.abs(domain.length - query.length))
  );
}

/**
 * Builds a deduplicated suggestion list from several sources, sorted by
 * relevance. sources is an array of { domains, label, baseScore }. When a
 * domain appears in several sources the highest score wins.
 */
export function rankSuggestions(query, sources, limit = 12) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const map = new Map();
  for (const { domains, label, baseScore } of sources || []) {
    for (const raw of domains || []) {
      const domain = normalizeSite(raw);
      if (!domain || !domain.includes(q)) continue;
      const score = scoreSuggestion(q, domain, baseScore);
      const existing = map.get(domain);
      if (!existing || score > existing.score) {
        map.set(domain, { domain, source: label, score });
      }
    }
  }

  return [...map.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
