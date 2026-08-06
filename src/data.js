/**
 * Data loading: fetches extension data from the background service worker
 * and fills the shared state. Calculation rules live in the domain core;
 * this module only picks the data source and writes results into the state.
 */
import { state } from "./state.js";
import { storageGet, sendToRuntime } from "./lib/chrome.js";
import { normalizeSites } from "./core/site.js";
import { normalizeHiddenEntries } from "./core/hidden-elements.js";
import { toDateStr, aggregateSessions, buildDailySeries } from "./core/statistics.js";

export async function refreshAllData() {
  const res = await sendToRuntime({ action: "get_popup_data", hostname: state.currentHostname });

  if (res?.ok && res.data) {
    const d = res.data;
    state.blockedSites = normalizeSites(d.blockedSites || []);
    state.hiddenForCurrentHost = normalizeHiddenEntries(d.hiddenForCurrentHost || []);
    state.pageStatsTop = d.pageStatsTop || [];
    state.currentHostStats = d.currentHostStats || null;
    state.favoriteSites = normalizeSites(d.favoriteSites || []);
    state.recommendations = d.recommendations || { items: [], updatedAt: 0 };
    state.trackerStatus = d.trackerStatus || { online: false };
    state.trackerApiBase = d.trackerApiBase || "http://127.0.0.1:4545";
    state.trackedSiteCount = Number(d.trackedSiteCount ?? state.pageStatsTop.length);
    state.activeSession = d.activeSession || null;
  } else {
    // Fallback when the background worker is unreachable: read storage directly.
    const fb = await storageGet([
      "blockedSites", "hiddenElements", "favoriteSites",
      "siteRecommendations", "pageStats", "trackerApiBase",
    ]);
    state.blockedSites = normalizeSites(fb.blockedSites || []);
    state.favoriteSites = normalizeSites(fb.favoriteSites || []);
    state.recommendations = fb.siteRecommendations || { items: [], updatedAt: 0 };
    const pageStats = fb.pageStats || {};
    state.pageStatsTop = Object.values(pageStats).sort((a, b) => b.totalMs - a.totalMs).slice(0, 10);
    state.currentHostStats = pageStats[state.currentHostname] || null;
    state.trackedSiteCount = Object.keys(pageStats).length;
    state.hiddenForCurrentHost = normalizeHiddenEntries(
      (fb.hiddenElements || {})[state.currentHostname] || []
    );
    state.trackerApiBase = fb.trackerApiBase || "http://127.0.0.1:4545";
    state.trackerStatus = { online: false };
  }

  await computeExtendedStats();
  await loadPomodoroState();
}

// Extended statistics: today, week, seven day series.

async function computeExtendedStats() {
  // Prefer the SQLite server, but only when enabled and reachable.
  if (state.sqliteEnabled && state.trackerStatus?.online) {
    try {
      const resp = await fetch(`${state.trackerApiBase}/api/stats/daily?days=7`);
      if (resp.ok) {
        const body = await resp.json();
        // Response shape: { ok, days, items: [{day, totalMs, sessions}] }
        const rows = body.items || [];
        const todayStr = toDateStr(new Date());

        const dayMap = {};
        let weekMs = 0;
        let todayMs = 0;
        for (const r of rows) {
          const ms = Number(r.totalMs || 0);
          dayMap[r.day] = ms;
          weekMs += ms;
          if (r.day === todayStr) todayMs = ms;
        }

        state.todayMs = todayMs;
        state.weekMs = weekMs;
        state.dailyStats = buildDailySeries(dayMap);
        return;
      }
    } catch {
      // Server unreachable, fall through to the local calculation.
    }
  }

  // Local calculation from the capped session history.
  const stored = await storageGet(["recentSessions"]);
  const { todayMs, weekMs, dayMap } = aggregateSessions(stored.recentSessions || []);
  state.todayMs = todayMs;
  state.weekMs = weekMs;
  state.dailyStats = buildDailySeries(dayMap);
}

// Pomodoro state

export async function loadPomodoroState() {
  const stored = await storageGet(["pomodoroState"]);
  const ps = stored.pomodoroState;
  if (ps) Object.assign(state.pomodoro, ps);
}
