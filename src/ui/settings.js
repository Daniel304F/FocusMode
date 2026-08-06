/**
 * Settings tab: SQLite toggle, server reconnect, theme toggle switch,
 * language select, API key management, and LLM summary.
 * Supports Anthropic API and custom OpenAI-compatible endpoints.
 */
import { state } from "../state.js";
import { storageGet, storageSet, sendToRuntime } from "../lib/chrome.js";
import { formatDuration } from "../lib/format.js";
import { applyLanguage, t } from "../lib/i18n.js";
import { refreshAllData } from "../data.js";

// Init

export async function initSettings() {
  const stored = await storageGet([
    "uiTheme", "uiLanguage", "anthropicApiKey", "sqliteEnabled",
    "llmProvider", "llmEndpoint", "llmModel",
  ]);

  state.uiTheme = stored.uiTheme || "light";
  state.uiLanguage = stored.uiLanguage || "de";
  state.sqliteEnabled = stored.sqliteEnabled ?? false;
  state.llmProvider = stored.llmProvider || "anthropic";
  state.llmEndpoint = stored.llmEndpoint || "";
  state.llmModel = stored.llmModel || "";

  applyTheme(state.uiTheme);
  applyLanguage(state.uiLanguage);

  const keyInput = document.getElementById("apiKeyInput");
  if (keyInput && stored.anthropicApiKey) keyInput.value = stored.anthropicApiKey;

  const langSelect = document.getElementById("langSelect");
  if (langSelect) langSelect.value = state.uiLanguage;

  const sqliteToggle = document.getElementById("sqliteToggle");
  if (sqliteToggle) sqliteToggle.checked = state.sqliteEnabled;

  const sqliteConfig = document.getElementById("sqliteConfig");
  if (sqliteConfig) sqliteConfig.style.display = state.sqliteEnabled ? "" : "none";

  const providerSelect = document.getElementById("llmProviderSelect");
  if (providerSelect) providerSelect.value = state.llmProvider;

  const endpointInput = document.getElementById("llmEndpointInput");
  if (endpointInput) endpointInput.value = state.llmEndpoint;

  const modelInput = document.getElementById("llmModelInput");
  if (modelInput) modelInput.value = state.llmModel;

  _applyProviderVisibility(state.llmProvider);
}

export function initSettingsEvents() {
  // SQLite toggle
  document.getElementById("sqliteToggle")?.addEventListener("change", (e) => {
    toggleSqlite(e.target.checked);
  });

  // Theme toggle switch
  document.getElementById("themeToggle")?.addEventListener("change", (e) => {
    toggleTheme(e.target.checked);
  });

  // Language select
  document.getElementById("langSelect")?.addEventListener("change", (e) => {
    setLanguage(e.target.value);
  });

  // Server
  document.getElementById("saveTrackerUrlBtn")?.addEventListener("click", saveTrackerUrl);
  document.getElementById("reconnectBtn")?.addEventListener("click", reconnectTracker);

  // LLM provider select
  document.getElementById("llmProviderSelect")?.addEventListener("change", (e) => {
    state.llmProvider = e.target.value;
    storageSet({ llmProvider: e.target.value });
    _applyProviderVisibility(e.target.value);
  });

  // LLM endpoint + model inputs
  const endpointInput = document.getElementById("llmEndpointInput");
  endpointInput?.addEventListener("blur", () => {
    state.llmEndpoint = endpointInput.value.trim();
    storageSet({ llmEndpoint: state.llmEndpoint });
  });

  const modelInput = document.getElementById("llmModelInput");
  modelInput?.addEventListener("blur", () => {
    state.llmModel = modelInput.value.trim();
    storageSet({ llmModel: state.llmModel });
  });

  // API key
  const keyInput = document.getElementById("apiKeyInput");
  keyInput?.addEventListener("blur", () => {
    storageSet({ anthropicApiKey: keyInput.value.trim() });
  });
  document.getElementById("toggleApiKeyBtn")?.addEventListener("click", () => {
    const isPassword = keyInput.type === "password";
    keyInput.type = isPassword ? "text" : "password";
    document.getElementById("toggleApiKeyBtn").textContent = isPassword ? "Verbergen" : "Zeigen";
  });

  // LLM summary
  document.getElementById("summarizeBtn")?.addEventListener("click", summarizeData);
}

export function renderSettings() {
  const urlInput = document.getElementById("trackerUrlInput");
  if (urlInput) urlInput.value = state.trackerApiBase;
  renderTrackerChip();
}

export function renderTrackerChip() {
  const chip = document.getElementById("trackerStatusChip");
  if (!chip) return;

  chip.classList.remove("ok", "err", "dis");

  if (!state.sqliteEnabled) {
    chip.classList.add("dis");
    chip.textContent = "SQLite: aus";
    return;
  }

  const online = Boolean(state.trackerStatus?.online);
  chip.classList.add(online ? "ok" : "err");
  chip.textContent = online
    ? `SQLite: online (${state.trackerStatus.totalSessions || 0})`
    : "SQLite: offline";
}

// SQLite

async function toggleSqlite(enabled) {
  state.sqliteEnabled = enabled;
  await storageSet({ sqliteEnabled: enabled });

  const sqliteConfig = document.getElementById("sqliteConfig");
  if (sqliteConfig) sqliteConfig.style.display = enabled ? "" : "none";

  if (enabled) {
    const ping = await sendToRuntime({ action: "ping_tracker" }).catch(() => null);
    if (ping?.ok && ping.status) state.trackerStatus = ping.status;
  } else {
    state.trackerStatus = { online: false };
  }

  renderTrackerChip();
}

// Theme

function toggleTheme(isDark) {
  const theme = isDark ? "dark" : "light";
  state.uiTheme = theme;
  applyTheme(theme);
  storageSet({ uiTheme: theme });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = theme === "dark";
}

// Language

async function setLanguage(lang) {
  state.uiLanguage = lang;
  applyLanguage(lang);
  await storageSet({ uiLanguage: lang });
}

// Server

async function saveTrackerUrl() {
  const value = (document.getElementById("trackerUrlInput")?.value || "").trim();
  if (!value) return;
  await storageSet({ trackerApiBase: value.replace(/\/$/, "") });
  state.trackerApiBase = value.replace(/\/$/, "");
  const ping = await sendToRuntime({ action: "ping_tracker" }).catch(() => null);
  if (ping?.ok && ping.status) state.trackerStatus = ping.status;
  renderTrackerChip();
  await refreshAllData();
}

async function reconnectTracker() {
  const lang = state.uiLanguage;
  const btn = document.getElementById("reconnectBtn");
  const statusEl = document.getElementById("reconnectStatus");
  if (!btn) return;

  btn.disabled = true;
  btn.textContent = t(lang, "reconnectTrying");
  if (statusEl) statusEl.textContent = "";

  const ping = await sendToRuntime({ action: "ping_tracker" }).catch(() => null);
  const ok = ping?.ok && ping?.status?.online;

  if (ok) {
    state.trackerStatus = ping.status;
    if (statusEl) { statusEl.style.color = "var(--ok)"; statusEl.textContent = t(lang, "reconnectOk"); }
  } else {
    if (statusEl) { statusEl.style.color = "var(--warning)"; statusEl.textContent = t(lang, "reconnectErr"); }
  }

  renderTrackerChip();
  btn.textContent = t(lang, "setupReconnectBtn");
  btn.disabled = false;
  setTimeout(() => { if (statusEl) statusEl.textContent = ""; }, 3000);
}

// LLM

function _applyProviderVisibility(provider) {
  const customFields = document.getElementById("llmCustomFields");
  const keyLabel = document.getElementById("llmKeyLabel");
  if (customFields) customFields.style.display = provider === "custom" ? "" : "none";
  if (keyLabel) {
    const lang = state.uiLanguage;
    keyLabel.textContent = t(lang, "setupLlmKeyLabel");
  }
}

async function summarizeData() {
  const lang = state.uiLanguage;
  const apiKey = document.getElementById("apiKeyInput")?.value.trim();
  const provider = state.llmProvider;
  const btn = document.getElementById("summarizeBtn");
  if (!btn) return;

  if (!state.pageStatsTop?.length) return showSummary(t(lang, "llmErrNoData"), "error");

  if (provider === "anthropic") {
    if (!apiKey) return showSummary(t(lang, "llmErrNoKey"), "error");
  } else {
    const endpoint = (document.getElementById("llmEndpointInput")?.value || "").trim();
    const model = (document.getElementById("llmModelInput")?.value || "").trim();
    if (!endpoint) return showSummary(t(lang, "llmErrNoEndpoint"), "error");
    if (!model) return showSummary(t(lang, "llmErrNoModel"), "error");
    // save in case user didn't blur
    state.llmEndpoint = endpoint;
    state.llmModel = model;
    await storageSet({ llmEndpoint: endpoint, llmModel: model });
  }

  btn.disabled = true;
  showSummary(t(lang, "setupLlmLoading"), "loading");

  const prompt = buildPrompt(lang);
  try {
    if (provider === "custom") {
      await _callCustomEndpoint(apiKey, prompt);
    } else {
      await _callAnthropic(apiKey, prompt);
    }
  } catch {
    showSummary(t(lang, "llmErrNetwork"), "error");
  } finally {
    btn.disabled = false;
  }
}

async function _callAnthropic(apiKey, prompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    showSummary(`API Error ${resp.status}: ${err?.error?.message || resp.statusText}`, "error");
    return;
  }
  const data = await resp.json();
  showSummary(data?.content?.[0]?.text || "Keine Antwort erhalten.", "ok");
}

async function _callCustomEndpoint(apiKey, prompt) {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const resp = await fetch(state.llmEndpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: state.llmModel,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    showSummary(`API Error ${resp.status}: ${err?.error?.message || resp.statusText}`, "error");
    return;
  }
  const data = await resp.json();
  // Support both OpenAI-compatible and Anthropic response shapes
  const text = data?.choices?.[0]?.message?.content ?? data?.content?.[0]?.text;
  showSummary(text || "Keine Antwort erhalten.", "ok");
}

function buildPrompt(lang) {
  const top5 = (state.pageStatsTop || []).slice(0, 5)
    .map((s, i) => `  ${i + 1}. ${s.hostname} — ${formatDuration(s.totalMs || 0)} (${s.visits || 0}×)`)
    .join("\n");
  return [
    t(lang, "llmPromptIntro"),
    "",
    `Heute: ${formatDuration(state.todayMs)}`,
    `Diese Woche: ${formatDuration(state.weekMs)}`,
    `Getrackte Seiten: ${state.trackedSiteCount}`,
    `Blockierte Seiten: ${state.blockedSites.length}`,
    "Top-Seiten:",
    top5,
  ].join("\n");
}

function showSummary(text, type) {
  const el = document.getElementById("summaryResult");
  if (!el) return;
  el.style.display = "";
  el.className = `summary-box${type !== "ok" ? ` ${type}` : ""}`;
  el.textContent = text;
}
