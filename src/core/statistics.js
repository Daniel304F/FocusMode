/**
 * Domain module for screen time evaluation: daily and weekly totals,
 * the seven day series, sorting of top sites, and the live counter.
 */

/** Calendar day key in local time (YYYY-MM-DD). */
export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Aggregates a session history into today and week totals plus a per day
 * map. A session counts towards the day it started on; the week covers the
 * last seven calendar days including today.
 */
export function aggregateSessions(sessions, now = Date.now()) {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const weekStartMs = todayStartMs - 6 * 24 * 60 * 60 * 1000;

  let todayMs = 0;
  let weekMs = 0;
  const dayMap = {};

  for (const s of sessions || []) {
    const ts = Number(s.startedAt || 0);
    const dur = Number(s.durationMs || 0);
    if (!ts || !dur) continue;
    if (ts >= todayStartMs) todayMs += dur;
    if (ts >= weekStartMs) {
      weekMs += dur;
      const key = toDateStr(new Date(ts));
      dayMap[key] = (dayMap[key] || 0) + dur;
    }
  }

  return { todayMs, weekMs, dayMap };
}

/**
 * Builds the seven day series from a per day map (oldest day first, today
 * marked; days without usage appear with zero). dayNames allows localized
 * labels (index equals weekday, 0 is Sunday).
 */
export function buildDailySeries(dayMap, now = Date.now(), dayNames = DAY_NAMES_DE, todayLabel = "Heute") {
  const result = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = toDateStr(d);
    result.push({
      label: i === 0 ? todayLabel : dayNames[d.getDay()],
      totalMs: dayMap[key] || 0,
      isToday: i === 0,
    });
  }
  return result;
}

export const DAY_NAMES_DE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/**
 * Sorts per site statistics by total time or visit count, ascending or
 * descending. Returns a new list.
 */
export function sortPageStats(entries, field = "totalMs", dir = "desc") {
  const key = field === "visits" ? "visits" : "totalMs";
  const sign = dir === "asc" ? 1 : -1;
  return [...(entries || [])].sort((a, b) => sign * ((a[key] || 0) - (b[key] || 0)));
}

/**
 * Live screen time of the active domain: stored total plus the running
 * session, provided that session belongs to the same domain.
 */
export function liveTotalMs(storedMs, activeSession, hostname, now = Date.now()) {
  let total = Number(storedMs || 0);
  if (activeSession?.hostname === hostname && activeSession.startedAt) {
    total += Math.max(0, now - Number(activeSession.startedAt));
  }
  return total;
}
