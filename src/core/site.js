/**
 * Domain module for sites: normalization of user input and block matching.
 *
 * Pure functions without browser APIs. This module is the single source of
 * truth for the question "is this the same site?" and is shared by the
 * popup, the background worker, and the tests.
 */

/**
 * Normalizes user input to a canonical site: lowercased, trimmed, protocol,
 * path and query removed, leading "www." stripped. Input that cannot be
 * interpreted yields an empty string.
 */
export function normalizeSite(raw) {
  if (!raw || typeof raw !== "string") return "";
  let value = raw.trim().toLowerCase();
  if (!value) return "";
  if (!value.includes("://")) value = `https://${value}`;
  try {
    const { hostname } = new URL(value);
    return hostname ? hostname.replace(/^www\./, "") : "";
  } catch {
    return raw.trim().toLowerCase().replace(/^www\./, "").split("/")[0];
  }
}

/** Normalizes a list of sites, dropping duplicates and empty values. */
export function normalizeSites(sites) {
  if (!Array.isArray(sites)) return [];
  const seen = new Set();
  for (const s of sites) {
    const n = normalizeSite(s);
    if (n) seen.add(n);
  }
  return [...seen];
}

/**
 * Returns the hostname of an http(s) URL, otherwise an empty string.
 * Other protocols (chrome:, file:, ...) are not trackable pages.
 */
export function parseHostname(rawUrl) {
  try {
    const { protocol, hostname } = new URL(rawUrl);
    if (protocol !== "http:" && protocol !== "https:") return "";
    return hostname.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * A blocklist entry matches the site itself and all of its subdomains,
 * but never mere name similarity (notreddit.com stays reachable).
 */
export function matchesBlockedHost(hostname, blockedEntry) {
  const blocked = normalizeSite(blockedEntry);
  if (!blocked || !hostname) return false;
  if (hostname === blocked) return true;
  return hostname.endsWith(`.${blocked}`);
}

/** Checks a hostname against the entire blocklist. */
export function isBlockedBy(hostname, blockedSites) {
  return (blockedSites || []).some((entry) => matchesBlockedHost(hostname, entry));
}

/**
 * Decides whether a URL counts towards screen time. The caller can pass
 * internal pages (for example the extension's own blocked page) via
 * excludedUrls, so this module never needs to know about browser APIs.
 */
export function isTrackableUrl(rawUrl, excludedUrls = []) {
  if (!rawUrl) return false;
  for (const excluded of excludedUrls) {
    if (excluded && rawUrl.startsWith(excluded)) return false;
  }
  return parseHostname(rawUrl) !== "";
}
