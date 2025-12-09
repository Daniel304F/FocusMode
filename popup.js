document.addEventListener("DOMContentLoaded", () => {
  // UI Elemente
  const siteInput = document.getElementById("siteInput");
  const addBtn = document.getElementById("addBtn");
  const blockList = document.getElementById("blockList");

  // Hider Buttons
  const pickerBtn = document.getElementById("picker-btn");
  const manageBtn = document.getElementById("manage-btn");
  const resetAllBtn = document.getElementById("reset-all-btn");

  const topSites = [
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "tiktok.com",
    "linkedin.com",
    "netflix.com",
    "twitch.tv",
    "pinterest.com",
    "amazon.com",
    "wikipedia.org",
    "bild.de",
    "spiegel.de",
    "zeit.de",
    "welt.de",
    "ebay.de",
    "kleinanzeigen.de",
    "paypal.com",
    "gmx.net",
    "web.de",
    "t-online.de",
    "focus.de",
    "chip.de",
    "tagesschau.de",
    "whatsapp.com",
    "discord.com",
    "bing.com",
    "duckduckgo.com",
    "booking.com",
    "immobilienscout24.de",
    "mobile.de",
    "chefkoch.de",
    "wetter.com",
    "9gag.com",
    "tumblr.com",
    "quora.com",
    "stackoverflow.com",
    "github.com",
    "openai.com",
  ];
  autocomplete(siteInput, topSites);

  chrome.storage.local.get(["blockedSites"], (result) => {
    const sites = result.blockedSites || [];
    sites.forEach((site) => addSiteToUI(site));
  });

  addBtn.addEventListener("click", () => {
    addCurrentSite();
  });

  function addCurrentSite() {
    const site = siteInput.value.trim();
    if (site) {
      chrome.storage.local.get(["blockedSites"], (result) => {
        const sites = result.blockedSites || [];
        if (!sites.includes(site)) {
          sites.push(site);
          chrome.storage.local.set({ blockedSites: sites }, () => {
            addSiteToUI(site);
            siteInput.value = "";
            siteInput.focus();
            closeAllLists();
          });
        } else {
          siteInput.value = "";
        }
      });
    }
  }

  function addSiteToUI(site) {
    const li = document.createElement("li");
    li.textContent = site;
    const removeBtn = document.createElement("button");
    removeBtn.textContent = "✕";
    removeBtn.className = "remove-btn";
    removeBtn.onclick = () => {
      chrome.storage.local.get(["blockedSites"], (result) => {
        const sites = result.blockedSites || [];
        const newSites = sites.filter((s) => s !== site);
        chrome.storage.local.set({ blockedSites: newSites }, () => {
          li.remove();
        });
      });
    };
    li.appendChild(removeBtn);
    blockList.appendChild(li);
  }

  // autocomoplete logik
  function autocomplete(inp, arr) {
    let currentFocus;

    inp.addEventListener("input", function (e) {
      let a,
        b,
        i,
        val = this.value;
      closeAllLists();
      if (!val) {
        return false;
      }
      currentFocus = -1;

      a = document.createElement("DIV");
      a.setAttribute("id", this.id + "autocomplete-list");
      a.setAttribute("class", "autocomplete-items");

      this.parentNode.appendChild(a);

      for (i = 0; i < arr.length; i++) {
        // Prüfen ob der Anfang matcht
        if (arr[i].substr(0, val.length).toUpperCase() == val.toUpperCase()) {
          b = document.createElement("DIV");
          b.innerHTML = "<strong>" + arr[i].substr(0, val.length) + "</strong>";
          b.innerHTML += arr[i].substr(val.length);
          b.innerHTML += "<input type='hidden' value='" + arr[i] + "'>";

          b.addEventListener("click", function (e) {
            inp.value = this.getElementsByTagName("input")[0].value;
            closeAllLists();

            addBtn.click();
            inp.focus();
          });
          a.appendChild(b);
        }
      }
    });

    inp.addEventListener("keydown", function (e) {
      let x = document.getElementById(this.id + "autocomplete-list");
      if (x) x = x.getElementsByTagName("div");

      if (e.key === "ArrowDown") {
        currentFocus++;
        addActive(x);
      } else if (e.key === "ArrowUp") {
        currentFocus--;
        addActive(x);
      } else if (e.key === "Enter") {
        if (currentFocus > -1) {
          if (x) x[currentFocus].click();

          e.preventDefault();
          setTimeout(() => addBtn.click(), 50);
        } else {
          addBtn.click();
        }
      }
    });

    function addActive(x) {
      if (!x) return false;
      removeActive(x);
      if (currentFocus >= x.length) currentFocus = 0;
      if (currentFocus < 0) currentFocus = x.length - 1;
      x[currentFocus].classList.add("autocomplete-active");
      x[currentFocus].scrollIntoView({ block: "nearest" });
    }

    function removeActive(x) {
      for (let i = 0; i < x.length; i++) {
        x[i].classList.remove("autocomplete-active");
      }
    }
  }

  function closeAllLists(elmnt) {
    const x = document.getElementsByClassName("autocomplete-items");
    for (let i = 0; i < x.length; i++) {
      if (elmnt != x[i] && elmnt != siteInput) {
        x[i].parentNode.removeChild(x[i]);
      }
    }
  }

  document.addEventListener("click", function (e) {
    closeAllLists(e.target);
  });

  pickerBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    window.close();
    chrome.tabs.sendMessage(tab.id, { action: "start_selection" });
  });

  manageBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    window.close();
    chrome.tabs.sendMessage(tab.id, { action: "toggle_manage" });
  });

  resetAllBtn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const url = new URL(tab.url);
    const hostname = url.hostname;

    if (confirm("Alles zurücksetzen auf " + hostname + "?")) {
      chrome.storage.local.get(["hiddenElements"], (result) => {
        const allHidden = result.hiddenElements || {};
        if (allHidden[hostname]) {
          delete allHidden[hostname];
          chrome.storage.local.set({ hiddenElements: allHidden }, () => {
            chrome.tabs.reload(tab.id);
            window.close();
          });
        } else {
          alert("Nichts versteckt.");
        }
      });
    }
  });
});
