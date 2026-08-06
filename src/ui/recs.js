/**
 * Recommendations tab: shows the recommended sites with direct follow up
 * actions (block, favorite).
 */
import { state } from "../state.js";
import { escapeHtml } from "../lib/format.js";
import { normalizeSite } from "../core/site.js";
import { toggleSite } from "../core/blocklist.js";
import { sendToRuntime, storageGet, storageSet } from "../lib/chrome.js";
import { addBlocked } from "./blocker.js";
import { refreshAllData } from "../data.js";

export function renderRecommendations() {
  const list = document.getElementById("recommendationList");
  if (!list) return;
  list.innerHTML = "";

  const items = state.recommendations?.items || [];
  if (!items.length) {
    list.innerHTML = `<li class="item"><div class="item-main"><div class="item-sub">Keine Empfehlungen. Nutze die Erweiterung etwas länger und lade neu.</div></div></li>`;
    return;
  }

  for (const rec of items.slice(0, 12)) {
    const domain = normalizeSite(rec.domain);
    const isBlocked = state.blockedSites.includes(domain);
    const isFav = state.favoriteSites.includes(domain);
    const li = document.createElement("li");
    li.className = "item";
    li.innerHTML = `
      <div class="item-main">
        <div class="item-title">${escapeHtml(rec.name || domain)}</div>
        <div class="item-sub">${escapeHtml(domain)} · ${escapeHtml(rec.sourceKeyword || "allgemein")}</div>
      </div>
      <div class="item-actions">
        <button class="icon-btn star ${isFav ? "active" : ""}" title="Favorit">★</button>
        <button class="icon-btn block" title="Blockieren">${isBlocked ? "✓" : "+"}</button>
      </div>`;
    li.querySelector(".star").addEventListener("click", () => toggleFav(domain));
    li.querySelector(".block").addEventListener("click", async () => {
      if (isBlocked) return;
      await addBlocked(domain);
      renderRecommendations();
    });
    list.appendChild(li);
  }
}

export function initRecsEvents() {
  document.getElementById("refreshRecommendationsBtn")?.addEventListener("click", async () => {
    await sendToRuntime({ action: "refresh_recommendations" }).catch(() => null);
    await refreshAllData();
    renderRecommendations();
  });
}

async function toggleFav(site) {
  // The toggle logic lives in the domain core.
  const { favoriteSites = [] } = await storageGet(["favoriteSites"]);
  const newList = toggleSite(favoriteSites, site);
  await storageSet({ favoriteSites: newList });

  state.favoriteSites = newList;
  renderRecommendations();

  await refreshAllData();
  renderRecommendations();
}
