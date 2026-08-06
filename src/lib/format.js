/**
 * Presentation helpers: formatting and safe rendering. Domain normalization
 * lives in the domain core (src/core), not here.
 */

/** Formats a duration as "3h 12m" or "45m". */
export function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h <= 0 ? `${m}m` : `${h}h ${m}m`;
}

/** Formats a remaining time as MM:SS for countdown displays. */
export function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Escapes user generated content before it is rendered as HTML. */
export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/** Wraps the matched substring in autocomplete suggestions in strong tags. */
export function highlightMatch(value, query) {
  const lv = value.toLowerCase();
  const lq = (query || "").toLowerCase();
  const i = lv.indexOf(lq);
  if (!lq || i < 0) return escapeHtml(value);
  return (
    escapeHtml(value.slice(0, i)) +
    `<strong>${escapeHtml(value.slice(i, i + lq.length))}</strong>` +
    escapeHtml(value.slice(i + lq.length))
  );
}
