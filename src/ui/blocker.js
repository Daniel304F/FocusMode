/**
 * Blocker tab: list of blocked sites and the autocomplete input. Domain
 * rules come from src/core; this module only handles DOM, events and
 * persistence.
 */
import { state } from "../state.js";
import { storageGet, storageSet } from "../lib/chrome.js";
import { normalizeSite } from "../core/site.js";
import { addSite, removeSite, toggleSite } from "../core/blocklist.js";
import { rankSuggestions } from "../core/suggestions.js";
import { escapeHtml, highlightMatch } from "../lib/format.js";
import { refreshAllData } from "../data.js";

// Static top list serving as the base of the autocomplete.
const STATIC_SUGGESTIONS = [
  "youtube.com","facebook.com","instagram.com","x.com","twitter.com","reddit.com",
  "tiktok.com","linkedin.com","netflix.com","twitch.tv","pinterest.com","amazon.com",
  "wikipedia.org","bild.de","spiegel.de","zeit.de","welt.de","ebay.de",
  "kleinanzeigen.de","paypal.com","gmx.net","web.de","t-online.de","focus.de",
  "chip.de","tagesschau.de","whatsapp.com","discord.com","bing.com","duckduckgo.com",
  "booking.com","immobilienscout24.de","mobile.de","chefkoch.de","wetter.com",
  "9gag.com","tumblr.com","quora.com","stackoverflow.com","github.com","gitlab.com",
  "openai.com","notion.so","figma.com","asana.com","trello.com","cnn.com","bbc.com",
  "nytimes.com","medium.com","substack.com","news.ycombinator.com","producthunt.com",
  "imdb.com","spotify.com","soundcloud.com","udemy.com","coursera.org","edx.org",
  "khanacademy.org","fiverr.com","upwork.com","airbnb.com","tripadvisor.com",
  "skyscanner.com","kayak.com","canva.com","dribbble.com","behance.net","slack.com",
  "zoom.us","teams.microsoft.com","dropbox.com","drive.google.com","maps.google.com",
  "finance.yahoo.com","investing.com","tradingview.com","coinmarketcap.com",
  "binance.com","stripe.com","shopify.com","etsy.com","zalando.de","otto.de",
  "heise.de","computerbild.de","n-tv.de","kicker.de","transfermarkt.de",
  "xing.com","researchgate.net","arxiv.org","deepl.com","translate.google.com",
  "duck.ai","claude.ai",
];

let acState = { index: -1, options: [] };
let _flashSite = null;

// Rendering

export function renderBlockedSites() {
  const list = document.getElementById("blockList");
  const label = document.getElementById("blockedCountLabel");
  if (!list || !label) return;

  label.textContent = `${state.blockedSites.length} geblockt`;
  list.innerHTML = "";

  if (state.blockedSites.length === 0) {
    list.innerHTML = `<li class="item"><div class="item-main"><div class="item-sub">Noch keine blockierten Seiten.</div></div></li>`;
    return;
  }

  for (const site of state.blockedSites) {
    const isFav = state.favoriteSites.includes(site);
    const li = document.createElement("li");
    li.className = "item" + (site === _flashSite ? " is-new" : "");
    li.innerHTML = `
      <div class="item-main"><div class="item-title">${escapeHtml(site)}</div></div>
      <div class="item-actions">
        <button class="icon-btn star ${isFav ? "active" : ""}" title="Favorit">★</button>
        <button class="icon-btn remove" title="Entfernen">✕</button>
      </div>`;
    li.querySelector(".star").addEventListener("click", () => toggleFavorite(site));
    li.querySelector(".remove").addEventListener("click", () => removeBlocked(site));
    list.appendChild(li);
  }

  _flashSite = null;
}

// Autocomplete

export function initBlockerEvents() {
  const input = document.getElementById("siteInput");
  const addBtn = document.getElementById("addBtn");
  if (!input || !addBtn) return;

  addBtn.addEventListener("click", () => addFromInput());
  input.addEventListener("input", () => onInputChange());
  input.addEventListener("keydown", (e) => onInputKeyDown(e));
  document.addEventListener("click", (e) => closeAc(e.target));
}

function onInputChange() {
  const q = document.getElementById("siteInput").value.trim().toLowerCase();
  if (!q) { closeAc(); return; }
  acState.options = rankSuggestions(q, suggestionSources());
  acState.index = -1;
  renderAc();
}

/** Sources with base scores: favorites above visited above blocked above top list. */
function suggestionSources() {
  return [
    { domains: STATIC_SUGGESTIONS, label: "Top", baseScore: 10 },
    { domains: state.blockedSites, label: "Geblockt", baseScore: 40 },
    { domains: state.favoriteSites, label: "Favorit", baseScore: 60 },
    { domains: state.pageStatsTop.map((r) => r.hostname), label: "Besucht", baseScore: 50 },
    { domains: (state.recommendations?.items || []).map((r) => r.domain), label: "Empfehlung", baseScore: 35 },
  ];
}

function onInputKeyDown(e) {
  if (e.key === "Enter") {
    e.preventDefault();
    const sel = acState.options[acState.index];
    if (sel) document.getElementById("siteInput").value = sel.domain;
    addFromInput();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (!acState.options.length) return;
    acState.index = (acState.index + 1) % acState.options.length;
    renderAc();
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    if (!acState.options.length) return;
    acState.index = (acState.index - 1 + acState.options.length) % acState.options.length;
    renderAc();
  }
}

function renderAc() {
  closeAc();
  if (!acState.options.length) return;
  const input = document.getElementById("siteInput");
  const wrap = input.parentElement;
  const box = document.createElement("div");
  box.className = "autocomplete-items";
  box.id = "siteInput-ac";
  acState.options.forEach((opt, i) => {
    const item = document.createElement("div");
    item.className = "autocomplete-item" + (i === acState.index ? " active" : "");
    item.innerHTML = `${highlightMatch(opt.domain, input.value.trim())} <small>(${escapeHtml(opt.source)})</small>`;
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
      input.value = opt.domain;
      closeAc();
      addFromInput();
    });
    box.appendChild(item);
  });
  wrap.appendChild(box);
}

function closeAc(target) {
  const box = document.getElementById("siteInput-ac");
  if (!box) return;
  const input = document.getElementById("siteInput");
  if (target && (target === input || box.contains(target))) return;
  box.remove();
}

// Data mutations

async function addFromInput() {
  const input = document.getElementById("siteInput");
  const site = normalizeSite(input.value);
  if (!site) return;
  input.value = "";
  acState = { index: -1, options: [] };
  closeAc();

  const btn = document.getElementById("addBtn");
  setBtnBusy(btn, true);
  try {
    await addBlocked(site);
  } finally {
    setBtnBusy(btn, false);
  }
}

export async function addBlocked(site) {
  const n = normalizeSite(site);
  if (!n || state.blockedSites.includes(n)) return;

  // Optimistic update: change state and rerender before any async work.
  state.blockedSites = [...state.blockedSites, n];
  _flashSite = n;
  renderBlockedSites();

  // The domain core keeps the persisted list free of duplicates.
  const { blockedSites = [] } = await storageGet(["blockedSites"]);
  await storageSet({ blockedSites: addSite(blockedSites, n) });

  await refreshAllData();
  renderBlockedSites();
}

async function removeBlocked(site) {
  const n = normalizeSite(site);

  state.blockedSites = state.blockedSites.filter((s) => s !== n);
  renderBlockedSites();

  const { blockedSites = [] } = await storageGet(["blockedSites"]);
  await storageSet({ blockedSites: removeSite(blockedSites, n) });

  await refreshAllData();
  renderBlockedSites();
}

async function toggleFavorite(site) {
  const n = normalizeSite(site);
  const wasFav = state.favoriteSites.includes(n);
  state.favoriteSites = wasFav
    ? state.favoriteSites.filter((s) => s !== n)
    : [...state.favoriteSites, n];
  renderBlockedSites();

  const { favoriteSites = [] } = await storageGet(["favoriteSites"]);
  await storageSet({ favoriteSites: toggleSite(favoriteSites, n) });

  await refreshAllData();
  renderBlockedSites();
}

// UI helpers

function setBtnBusy(btn, busy) {
  if (!btn) return;
  if (busy) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.classList.add("is-busy");
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>`;
  } else {
    btn.disabled = false;
    btn.classList.remove("is-busy");
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}
