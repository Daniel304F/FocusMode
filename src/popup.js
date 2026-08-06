/**
 * FocusMode popup entry point.
 * Orchestrates initialization, data loading, and event wiring.
 * All heavy logic lives in src/ui/* and src/lib/*.
 */

import { state } from "./state.js";
import { queryTabs } from "./lib/chrome.js";
import { parseHostname } from "./core/site.js";
import { refreshAllData } from "./data.js";

import { initNav } from "./ui/nav.js";
import { renderBlockedSites, initBlockerEvents } from "./ui/blocker.js";
import { renderHiddenElements, initElementsEvents } from "./ui/elements.js";
import { renderStats, renderLiveTimer, initStatsEvents } from "./ui/stats.js";
import { renderRecommendations, initRecsEvents } from "./ui/recs.js";
import { renderPomodoro, initPomodoroEvents, startCountdownTick } from "./ui/pomodoro.js";
import {
  initSettings, initSettingsEvents, renderSettings, renderTrackerChip,
} from "./ui/settings.js";

// Boot

document.addEventListener("DOMContentLoaded", async () => {
  // 1. Apply stored theme + language before anything renders
  await initSettings();

  // 2. Wire up all UI events
  initNav(onNavigate);
  initBlockerEvents();
  initElementsEvents();
  initStatsEvents();
  initRecsEvents();
  initPomodoroEvents();
  initSettingsEvents();

  // 3. Resolve current tab
  await resolveCurrentTab();

  // 4. Load all data and render
  await refreshAllData();
  renderAll();

  // 5. Live timers
  setInterval(() => {
    renderLiveTimer();
    renderPomodoro(); // updates countdown every second
  }, 1000);
});

// Helpers

async function resolveCurrentTab() {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  state.currentTab = tab || null;
  state.currentHostname = tab?.url ? parseHostname(tab.url) : "";

  const label = document.getElementById("currentHostLabel");
  if (label) label.textContent = `Aktive Seite: ${state.currentHostname || "nicht verfügbar"}`;

  const urlInput = document.getElementById("trackerUrlInput");
  if (urlInput) urlInput.value = state.trackerApiBase;
}

function renderAll() {
  renderTrackerChip();
  renderBlockedSites();
  renderHiddenElements();
  renderStats();
  renderRecommendations();
  renderPomodoro();
  renderSettings();
}

function onNavigate(pageId) {
  // Resume pomodoro tick when entering pomodoro tab
  if (pageId === "pomodoro") {
    const p = state.pomodoro;
    if (p.phase !== "idle" && !p.paused) startCountdownTick();
  }
}
