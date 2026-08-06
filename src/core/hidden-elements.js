/**
 * Domain module for hidden page elements: data format and migration.
 *
 * An entry is { id, selector, label, createdAt }. Legacy data (bare
 * selector strings) is migrated into this format without loss.
 */

/** Stable short hash used to derive ids from selectors (deterministic). */
export function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Normalizes stored entries into the current format. Strings are migrated
 * as legacy entries; entries without a selector are dropped.
 */
export function normalizeHiddenEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (typeof entry === "string") {
        return { id: `legacy_${hashString(entry)}`, selector: entry, label: entry, createdAt: 0 };
      }
      if (!entry || typeof entry.selector !== "string") return null;
      return {
        id: entry.id || `fm_${hashString(entry.selector)}`,
        selector: entry.selector,
        label: entry.label || entry.selector,
        createdAt: Number(entry.createdAt || 0),
      };
    })
    .filter(Boolean);
}

/**
 * Removes an entry, preferring the stable id and falling back to the
 * selector for legacy callers. Returns a new list.
 */
export function removeHiddenEntry(entries, { id, selector } = {}) {
  return normalizeHiddenEntries(entries).filter((item) =>
    id ? item.id !== id : item.selector !== selector
  );
}
