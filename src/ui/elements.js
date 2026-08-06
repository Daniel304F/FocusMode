/** Elements tab: manages the hidden elements of the active domain. */
import { state } from "../state.js";
import { storageGet, storageSet, sendToTab } from "../lib/chrome.js";
import { escapeHtml } from "../lib/format.js";
import { removeHiddenEntry } from "../core/hidden-elements.js";
import { refreshAllData } from "../data.js";

export function renderHiddenElements() {
  const list = document.getElementById("hiddenElementList");
  const label = document.getElementById("hiddenCountLabel");
  if (!list || !label) return;

  label.textContent = `${state.hiddenForCurrentHost.length} Elemente`;
  list.innerHTML = "";

  if (!state.currentHostname) {
    list.innerHTML = `<li class="item"><div class="item-main"><div class="item-sub">Auf dieser Seite ist kein Element-Picker verfügbar.</div></div></li>`;
    return;
  }

  if (state.hiddenForCurrentHost.length === 0) {
    list.innerHTML = `<li class="item"><div class="item-main"><div class="item-sub">Keine ausgeblendeten Elemente auf ${escapeHtml(state.currentHostname)}.</div></div></li>`;
    return;
  }

  for (const entry of state.hiddenForCurrentHost) {
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-main">
        <div class="item-title">${escapeHtml(entry.label || entry.selector)}</div>
        <div class="item-sub">${escapeHtml(entry.selector)}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn restore" title="Wiederherstellen">↺</button>
      </div>`;
    li.querySelector(".restore").addEventListener("click", () => unhide(entry));
    list.appendChild(li);
  }
}

export function initElementsEvents() {
  document.getElementById("picker-btn")?.addEventListener("click", () => sendToTabAndClose("start_selection"));
  document.getElementById("manage-btn")?.addEventListener("click", () => sendToTabAndClose("toggle_manage"));
  document.getElementById("reset-all-btn")?.addEventListener("click", resetAll);
}

async function sendToTabAndClose(action) {
  if (!state.currentTab?.id) return;
  await sendToTab(state.currentTab.id, { action }).catch(() => null);
  window.close();
}

async function unhide(entry) {
  if (!state.currentHostname || !entry) return;
  // Removal (by id, falling back to the selector) is computed by the core.
  const { hiddenElements = {} } = await storageGet(["hiddenElements"]);
  const filtered = removeHiddenEntry(hiddenElements[state.currentHostname] || [], entry);
  if (filtered.length === 0) delete hiddenElements[state.currentHostname];
  else hiddenElements[state.currentHostname] = filtered;
  await storageSet({ hiddenElements });

  state.hiddenForCurrentHost = filtered;
  renderHiddenElements();

  if (state.currentTab?.id) {
    await sendToTab(state.currentTab.id, { action: "remove_hidden_selector", selector: entry.selector, id: entry.id }).catch(() => null);
    await sendToTab(state.currentTab.id, { action: "refresh_hidden_elements" }).catch(() => null);
  }
  await refreshAllData();
  renderHiddenElements();
}

async function resetAll() {
  if (!state.currentHostname) return;
  if (!confirm(`Alle versteckten Elemente auf ${state.currentHostname} wiederherstellen?`)) return;
  const { hiddenElements = {} } = await storageGet(["hiddenElements"]);
  delete hiddenElements[state.currentHostname];
  await storageSet({ hiddenElements });

  state.hiddenForCurrentHost = [];
  renderHiddenElements();

  if (state.currentTab?.id) {
    await sendToTab(state.currentTab.id, { action: "refresh_hidden_elements" }).catch(() => null);
  }
  await refreshAllData();
  renderHiddenElements();
}
