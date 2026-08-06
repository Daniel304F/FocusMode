/**
 * Domain module for the blocklist and the favorites list.
 *
 * All functions are pure: they return new lists and never mutate their
 * input. Persistence is the caller's responsibility.
 */
import { normalizeSite, normalizeSites } from "./site.js";

/** Adds a site in normalized form; duplicates leave the list unchanged. */
export function addSite(list, raw) {
  const site = normalizeSite(raw);
  const normalized = normalizeSites(list);
  if (!site || normalized.includes(site)) return normalized;
  return [...normalized, site];
}

/** Removes a site (matched in normalized form) from the list. */
export function removeSite(list, raw) {
  const site = normalizeSite(raw);
  return normalizeSites(list).filter((s) => s !== site);
}

/** Toggles membership: present sites are removed, absent sites are added. */
export function toggleSite(list, raw) {
  const site = normalizeSite(raw);
  if (!site) return normalizeSites(list);
  const normalized = normalizeSites(list);
  return normalized.includes(site)
    ? normalized.filter((s) => s !== site)
    : [...normalized, site];
}
