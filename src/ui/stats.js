/** Statistics tab: overview tiles, top sites bars, seven day chart. */
import { state } from "../state.js";
import { escapeHtml, formatDuration } from "../lib/format.js";
import { sortPageStats, liveTotalMs } from "../core/statistics.js";

let _sortField = "totalMs"; // "totalMs" | "visits"
let _sortDir = "desc";      // "desc" | "asc"

export function initStatsEvents() {
  document.getElementById("sortByTime")?.addEventListener("click", () => {
    _sortField = "totalMs";
    _updateSortBtns();
    _renderTopSites();
  });
  document.getElementById("sortByVisits")?.addEventListener("click", () => {
    _sortField = "visits";
    _updateSortBtns();
    _renderTopSites();
  });
  document.getElementById("sortDirBtn")?.addEventListener("click", () => {
    _sortDir = _sortDir === "desc" ? "asc" : "desc";
    _updateSortBtns();
    _renderTopSites();
  });
}

export function renderStats() {
  _renderOverview();
  _renderTopSites();
  _renderDailyChart();
}

export function renderLiveTimer() {
  if (!state.currentHostname) return;
  // Stored total plus the running session of the active domain.
  const total = liveTotalMs(
    state.currentHostStats?.totalMs,
    state.activeSession,
    state.currentHostname
  );
  const el = document.getElementById("currentHostTimeValue");
  if (el) el.textContent = formatDuration(total);
}

// private

function _renderOverview() {
  const setVal = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  setVal("currentHostTimeValue", formatDuration(Number(state.currentHostStats?.totalMs || 0)));
  const label = document.getElementById("currentHostTimeLabel");
  if (label) label.textContent = state.currentHostname || "Aktive Domain";
  setVal("trackedSitesValue", String(state.trackedSiteCount || 0));
  setVal("todayTimeValue", formatDuration(state.todayMs || 0));
  setVal("weekTimeValue", formatDuration(state.weekMs || 0));
}

function _renderTopSites() {
  const container = document.getElementById("topStatsList");
  if (!container) return;

  container.innerHTML = "";
  if (!state.pageStatsTop?.length) {
    container.innerHTML = `<div class="item"><div class="item-main"><div class="item-sub">Noch keine Tracking-Daten vorhanden.</div></div></div>`;
    return;
  }

  // Sorting by time or visits is computed by the domain core.
  const sorted = sortPageStats(state.pageStatsTop, _sortField, _sortDir);

  const top = sorted.slice(0, 5);
  // Max is always computed from time for bar width, regardless of sort field
  const maxMs = Math.max(...top.map((e) => e.totalMs || 0), 1);

  for (const entry of top) {
    const pct = Math.max(3, Math.round((entry.totalMs / maxMs) * 100));
    const div = document.createElement("div");
    div.className = "bar-item";
    div.innerHTML = `
      <div class="bar-top">
        <span class="bar-name">${escapeHtml(entry.hostname)}</span>
        <span class="bar-meta">${formatDuration(entry.totalMs || 0)} · ${entry.visits || 0}×</span>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>`;
    container.appendChild(div);
  }
}

function _updateSortBtns() {
  document.getElementById("sortByTime")?.classList.toggle("active", _sortField === "totalMs");
  document.getElementById("sortByVisits")?.classList.toggle("active", _sortField === "visits");
  const dirBtn = document.getElementById("sortDirBtn");
  if (dirBtn) dirBtn.textContent = _sortDir === "desc" ? "↓" : "↑";
}

function _renderDailyChart() {
  const card = document.getElementById("dailyCard");
  const chart = document.getElementById("dailyChart");
  const weekLabel = document.getElementById("weekTotalLabel");
  if (!card || !chart) return;

  const days = state.dailyStats;
  if (!days?.length || !days.some((d) => d.totalMs > 0)) {
    card.style.display = "none";
    return;
  }

  card.style.display = "";
  const maxMs = Math.max(...days.map((d) => d.totalMs), 1);
  const weekTotal = days.reduce((s, d) => s + d.totalMs, 0);
  if (weekLabel) weekLabel.textContent = `Gesamt: ${formatDuration(weekTotal)}`;

  chart.innerHTML = "";
  for (const day of days) {
    const h = Math.max(3, Math.round((day.totalMs / maxMs) * 100));
    const col = document.createElement("div");
    col.className = "day-col";
    col.innerHTML = `
      <div class="day-bar" style="height:${h}%" title="${formatDuration(day.totalMs)}"></div>
      <div class="day-label${day.isToday ? " today" : ""}">${escapeHtml(day.label)}</div>`;
    chart.appendChild(col);
  }
}
