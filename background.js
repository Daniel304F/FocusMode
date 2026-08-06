/**
 * Background service worker. Acts as the adapter between browser events and
 * the domain core in src/core. Runs as an ES module (manifest "type": "module").
 *
 * Responsibilities (orchestration only, no domain rules):
 *   session lifecycle driven by tab and window events,
 *   enforcement of the blocklist while a page loads,
 *   alarms for periodic flushing, recommendation refresh and pomodoro expiry,
 *   persistence in chrome.storage.local and the optional tracker server,
 *   the message API used by the popup.
 */
import {
  parseHostname,
  normalizeSite,
  isBlockedBy,
  isTrackableUrl,
} from "./src/core/site.js";
import {
  closeSession,
  isSignificantSession,
  applySessionToPageStats,
  prependRecentSession,
  isResumableSession,
  MAX_PENDING_SESSIONS,
} from "./src/core/tracking.js";
import {
  buildInterestKeywords,
  buildExclusionSet,
  selectRecommendations,
  needsRefresh,
  MAX_RECOMMENDATIONS,
} from "./src/core/recommendations.js";
import * as pomodoro from "./src/core/pomodoro.js";

const TRACKER_DEFAULT_BASE_URL = "http://127.0.0.1:4545";
const FLUSH_ALARM = "focusmode-flush";
const RECOMMENDATIONS_ALARM = "focusmode-recommendations";
const POMODORO_ALARM = "focusmode-pomodoro";
const ACTIVE_SESSION_KEY = "activeSessionState";

let activeSession = null;

init();

function init() {
  ensureAlarms();
  hydrateActiveSession().then(() => {
    syncWithCurrentlyActiveTab();
    refreshRecommendations(false);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarms();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  syncWithCurrentlyActiveTab();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    syncWithCurrentlyActiveTab();
    flushPendingSessions();
    return;
  }
  if (alarm.name === RECOMMENDATIONS_ALARM) {
    refreshRecommendations(false);
  }
  if (alarm.name === POMODORO_ALARM) {
    handlePomodoroAlarm();
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    maybeBlockTab(tabId, tab.url);
  }
  if (changeInfo.status === "complete" && tab.active) {
    setActiveSessionFromTab(tab, "tab-complete");
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await getTab(activeInfo.tabId);
  if (!tab) return;
  setActiveSessionFromTab(tab, "tab-activated");
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeSession && activeSession.tabId === tabId) {
    finalizeActiveSession("tab-removed");
  }
});

// Losing focus of the browser window ends the running session.
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    finalizeActiveSession("window-blur");
    return;
  }
  const [tab] = await queryTabs({ active: true, windowId });
  if (tab) setActiveSessionFromTab(tab, "window-focus");
});

// Message API used by the popup

const messageHandlers = {
  get_popup_data: (request) => getPopupData(request.hostname),
  refresh_recommendations: () => refreshRecommendations(true),
  ping_tracker: () => pingTracker(),
  pomodoro_start: (request) => pomodoroTransition((s) => pomodoro.start(s, request.phase, request.settings, Date.now())),
  pomodoro_stop: () => pomodoroTransition((s) => pomodoro.stop(s)),
  pomodoro_pause: () => pomodoroTransition((s) => pomodoro.pause(s, Date.now())),
  pomodoro_resume: () => pomodoroTransition((s) => pomodoro.resume(s, Date.now())),
  record_manual_unhide: async (request) => {
    if (request.hostname && request.selector) {
      await recordUnhideEvent(request.hostname, request.selector);
    }
  },
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = request?.action && messageHandlers[request.action];
  if (!handler) return;

  Promise.resolve(handler(request))
    .then((result) => sendResponse(normalizeHandlerResult(request.action, result)))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true; // keep the channel open for the async response
});

/** Preserves the established response shape per action (data/items/status/state). */
function normalizeHandlerResult(action, result) {
  switch (action) {
    case "get_popup_data": return { ok: true, data: result };
    case "refresh_recommendations": return { ok: true, items: result };
    case "ping_tracker": return { ok: true, status: result };
    case "pomodoro_start":
    case "pomodoro_pause":
    case "pomodoro_resume": return { ok: true, state: result };
    default: return { ok: true };
  }
}

function ensureAlarms() {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(RECOMMENDATIONS_ALARM, { periodInMinutes: 180 });
}

// Blocklist enforcement

async function maybeBlockTab(tabId, tabUrl) {
  const currentHost = parseHostname(tabUrl);
  if (!currentHost) return;

  // Never redirect the blocked page itself.
  if (tabUrl.startsWith(blockedPageUrl())) return;

  const data = await storageGet(["blockedSites"]);
  if (!isBlockedBy(currentHost, data.blockedSites || [])) return;

  chrome.tabs.update(tabId, { url: blockedPageUrl() });
}

function blockedPageUrl() {
  return chrome.runtime.getURL("blocked.html");
}

// Session lifecycle

async function setActiveSessionFromTab(tab, reason) {
  if (!tab || !tab.url) return;

  const host = parseHostname(tab.url);
  // Internal pages and the blocked page are not trackable.
  if (!host || !isTrackableUrl(tab.url, [blockedPageUrl()])) {
    await finalizeActiveSession(reason + "-untrackable");
    return;
  }

  // Same domain in the same tab: the session simply continues.
  if (activeSession && activeSession.tabId === tab.id && activeSession.hostname === host) {
    activeSession.lastSeenAt = Date.now();
    await persistActiveSessionState();
    return;
  }

  await finalizeActiveSession(reason + "-switch");

  activeSession = {
    tabId: tab.id,
    windowId: tab.windowId,
    hostname: host,
    url: tab.url,
    title: tab.title || "",
    startedAt: Date.now(),
    lastSeenAt: Date.now(),
  };
  await persistActiveSessionState();
}

async function finalizeActiveSession(reason) {
  if (!activeSession) return;

  const session = closeSession(activeSession, Date.now(), reason);
  activeSession = null;
  await storageSet({ [ACTIVE_SESSION_KEY]: null });

  // Discard sessions below the minimum duration.
  if (!isSignificantSession(session)) return;

  await persistSessionLocally(session);
  await enqueuePendingSession(session);
  flushPendingSessions();
}

/** Updates the per site statistics and prepends the session to the history. */
async function persistSessionLocally(session) {
  const data = await storageGet(["pageStats", "recentSessions"]);
  await storageSet({
    pageStats: applySessionToPageStats(data.pageStats || {}, session),
    recentSessions: prependRecentSession(data.recentSessions || [], session),
  });
}

// Optional tracker server

async function enqueuePendingSession(session) {
  const data = await storageGet(["pendingSessions"]);
  const pending = data.pendingSessions || [];
  pending.push(session);
  await storageSet({ pendingSessions: pending.slice(-MAX_PENDING_SESSIONS) });
}

async function flushPendingSessions() {
  const data = await storageGet(["pendingSessions", "trackerApiBase"]);
  const pending = data.pendingSessions || [];
  if (pending.length === 0) return;

  const trackerApiBase = sanitizeTrackerBase(data.trackerApiBase);
  const stillPending = [];
  for (const session of pending) {
    const ok = await postSessionToTracker(session, trackerApiBase);
    if (!ok) stillPending.push(session);
  }
  await storageSet({ pendingSessions: stillPending });
}

async function postSessionToTracker(session, trackerApiBase) {
  try {
    const response = await fetch(`${trackerApiBase}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(session),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function syncWithCurrentlyActiveTab() {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  if (!tab) {
    await finalizeActiveSession("no-active-tab");
    return;
  }
  await setActiveSessionFromTab(tab, "sync");
}

/** Resumes an open session after a restart unless it is orphaned. */
async function hydrateActiveSession() {
  const data = await storageGet([ACTIVE_SESSION_KEY]);
  const stored = data[ACTIVE_SESSION_KEY];
  if (!stored) return;

  if (!isResumableSession(stored, Date.now())) {
    await storageSet({ [ACTIVE_SESSION_KEY]: null });
    return;
  }
  activeSession = stored;
}

async function persistActiveSessionState() {
  await storageSet({ [ACTIVE_SESSION_KEY]: activeSession });
}

// Popup data

async function getPopupData(hostname) {
  const data = await storageGet([
    "blockedSites",
    "hiddenElements",
    "pageStats",
    "recentSessions",
    "favoriteSites",
    "siteRecommendations",
    "trackerApiBase",
  ]);

  const pageStats = data.pageStats || {};
  const hiddenElements = data.hiddenElements || {};

  const sortedStats = Object.values(pageStats)
    .sort((a, b) => b.totalMs - a.totalMs)
    .slice(0, 10);

  const trackerStatus = await pingTracker().catch(() => ({ online: false }));

  return {
    blockedSites: (data.blockedSites || []).map(normalizeSite),
    hiddenForCurrentHost: hostname ? hiddenElements[hostname] || [] : [],
    pageStatsTop: sortedStats,
    trackedSiteCount: Object.keys(pageStats).length,
    currentHostStats: (hostname && pageStats[hostname]) || null,
    recentSessions: (data.recentSessions || []).slice(0, 12),
    favoriteSites: (data.favoriteSites || []).map(normalizeSite),
    recommendations: data.siteRecommendations || { updatedAt: 0, items: [] },
    trackerStatus,
    trackerApiBase: sanitizeTrackerBase(data.trackerApiBase),
    activeSession,
  };
}

async function pingTracker() {
  const data = await storageGet(["trackerApiBase"]);
  const trackerApiBase = sanitizeTrackerBase(data.trackerApiBase);

  try {
    const response = await fetch(`${trackerApiBase}/api/health`);
    if (!response.ok) return { online: false, baseUrl: trackerApiBase };
    const json = await response.json();
    return {
      online: true,
      baseUrl: trackerApiBase,
      dbPath: json.dbPath || "",
      totalSessions: json.totalSessions || 0,
    };
  } catch {
    return { online: false, baseUrl: trackerApiBase };
  }
}

// Recommendations

async function refreshRecommendations(forceRefresh) {
  const data = await storageGet([
    "siteRecommendations",
    "pageStats",
    "favoriteSites",
    "blockedSites",
  ]);

  const existing = data.siteRecommendations || { updatedAt: 0, items: [] };
  // Only refresh when the stock is stale or a refresh was requested.
  if (!forceRefresh && !needsRefresh(existing, Date.now())) {
    return existing.items || [];
  }

  const visitedHosts = Object.keys(data.pageStats || {});
  const favoriteSites = data.favoriteSites || [];
  const interestKeywords = buildInterestKeywords(visitedHosts, favoriteSites);

  let finalItems = [];
  if (interestKeywords.length > 0) {
    // Adapter part: fetch candidates per keyword from the suggestion API,
    // then let the domain core select and score them.
    const keywordItems = [];
    for (const keyword of interestKeywords) {
      keywordItems.push({ keyword, items: await fetchClearbitSuggestions(keyword) });
    }
    const excluded = buildExclusionSet(visitedHosts, favoriteSites, data.blockedSites || []);
    finalItems = selectRecommendations(keywordItems, excluded, MAX_RECOMMENDATIONS);
  }

  await storageSet({
    siteRecommendations: { updatedAt: Date.now(), items: finalItems },
  });
  return finalItems;
}

async function fetchClearbitSuggestions(keyword) {
  const url = `https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(keyword)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    const json = await response.json();
    if (!Array.isArray(json)) return [];
    return json
      .filter((entry) => entry && entry.domain)
      .map((entry) => ({
        domain: entry.domain,
        name: entry.name || "",
        logo: entry.logo || "",
      }));
  } catch {
    return [];
  }
}

async function recordUnhideEvent(hostname, selector) {
  const data = await storageGet(["unhideEvents"]);
  const unhideEvents = data.unhideEvents || [];
  unhideEvents.unshift({ hostname, selector, at: Date.now() });
  await storageSet({ unhideEvents: unhideEvents.slice(0, 200) });
}

// Pomodoro adapter. State transitions are computed by the domain core;
// this part only handles storage, the alarm and the notification.

async function pomodoroTransition(transition) {
  const existing = (await storageGet(["pomodoroState"])).pomodoroState || null;
  const newState = transition(existing);
  await storageSet({ pomodoroState: newState });
  syncPomodoroAlarm(newState);
  return newState;
}

/** Aligns the wake up alarm with the state (running means alarm set). */
function syncPomodoroAlarm(state) {
  chrome.alarms.clear(POMODORO_ALARM);
  if (!state || state.phase === "idle" || state.paused) return;
  chrome.alarms.create(POMODORO_ALARM, {
    when: Date.now() + pomodoro.remainingMs(state, Date.now()),
  });
}

/** Phase expiry: notify the user (localized) and end the timer. */
async function handlePomodoroAlarm() {
  const data = await storageGet(["pomodoroState", "uiLanguage"]);
  const state = data.pomodoroState || {};
  const lang = data.uiLanguage || "de";

  const isWork = state.phase === "work";
  const titles = {
    de: isWork ? "Pomodoro abgeschlossen! 🎉" : "Pause vorbei!",
    en: isWork ? "Pomodoro done! 🎉" : "Break's over!",
  };
  const messages = {
    de: isWork ? "Gut gemacht! Zeit für eine Pause." : "Bereit für die nächste Einheit?",
    en: isWork ? "Great work! Time for a break." : "Ready for the next session?",
  };

  chrome.notifications.create({
    type: "basic",
    iconUrl: "focus.svg",
    title: titles[lang] || titles.de,
    message: messages[lang] || messages.de,
  });

  await storageSet({ pomodoroState: pomodoro.complete(state) });
}

// Promise wrappers around the chrome APIs

function sanitizeTrackerBase(base) {
  if (typeof base !== "string" || base.trim() === "") {
    return TRACKER_DEFAULT_BASE_URL;
  }
  return base.trim().replace(/\/$/, "");
}

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(payload) {
  return new Promise((resolve) => chrome.storage.local.set(payload, resolve));
}

function queryTabs(queryInfo) {
  return new Promise((resolve) => chrome.tabs.query(queryInfo, resolve));
}

function getTab(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(tab);
    });
  });
}
