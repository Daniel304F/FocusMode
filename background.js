chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url) {
    chrome.storage.local.get(["blockedSites"], (result) => {
      const sites = result.blockedSites || [];
      const currentUrl = new URL(tab.url).hostname;

      const isBlocked = sites.some((site) => currentUrl.includes(site));

      if (isBlocked && !tab.url.includes("blocked.html")) {
        chrome.tabs.update(tabId, {
          url: chrome.runtime.getURL("blocked.html"),
        });
      }
    });
  }
});
