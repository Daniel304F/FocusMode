let hiddenSelectors = [];
const hostname = window.location.hostname;
let styleTag = null;
let manageModeActive = false;
let selectionModeActive = false;

initialize();

function initialize() {
  chrome.storage.local.get(["hiddenElements"], (result) => {
    const allHidden = result.hiddenElements || {};
    hiddenSelectors = allHidden[hostname] || [];
    updatePageStyles();
  });
}

function updatePageStyles() {
  if (styleTag) styleTag.remove();

  styleTag = document.createElement("style");
  document.head.appendChild(styleTag);

  if (hiddenSelectors.length === 0) return;

  if (manageModeActive) {
    const cssRules = hiddenSelectors
      .map(
        (s) => `
            ${s} { 
                display: block !important; 
                opacity: 0.5 !important;
                outline: 4px solid red !important;
                cursor: pointer !important;
                background-color: rgba(255, 0, 0, 0.1) !important;
                pointer-events: auto !important;
            }
            ${s}:hover {
                opacity: 1 !important;
                background-color: rgba(255, 0, 0, 0.3) !important;
            }
        `
      )
      .join(" ");
    styleTag.textContent = cssRules;
  } else {
    styleTag.textContent = hiddenSelectors
      .map((s) => `${s} { display: none !important; }`)
      .join(" ");
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start_selection") {
    startSelectionMode();
  } else if (request.action === "toggle_manage") {
    toggleManageMode();
  }
});

function globalEscHandler(e) {
  if (e.key === "Escape") {
    if (selectionModeActive) {
      cleanupSelectionMode();
      console.log("FocusMode: Auswahl abgebrochen.");
    }
    if (manageModeActive) {
      toggleManageMode();
    }
  }
}

function toggleManageMode() {
  if (selectionModeActive) cleanupSelectionMode();

  manageModeActive = !manageModeActive;

  if (manageModeActive) {
    alert(
      "BEARBEITEN:\nKlicke auf rot markierte Elemente, um sie wiederherzustellen.\nDrücke ESC zum Beenden."
    );
    document.addEventListener("click", manageClickHandler, true);
    document.addEventListener("keydown", globalEscHandler);
  } else {
    document.removeEventListener("click", manageClickHandler, true);
    document.removeEventListener("keydown", globalEscHandler);
  }

  updatePageStyles();
}

function manageClickHandler(e) {
  if (!manageModeActive) return;

  const clickedElement = e.target;
  const selectorToRemove = hiddenSelectors.find((sel) => {
    try {
      return clickedElement.matches(sel) || clickedElement.closest(sel);
    } catch (err) {
      return false;
    }
  });

  if (selectorToRemove) {
    e.preventDefault();
    e.stopPropagation();

    if (confirm("Wieder anzeigen?")) {
      removeSelector(selectorToRemove);
    }
  }
}

function removeSelector(selector) {
  hiddenSelectors = hiddenSelectors.filter((s) => s !== selector);
  chrome.storage.local.get(["hiddenElements"], (result) => {
    const allHidden = result.hiddenElements || {};
    allHidden[hostname] = hiddenSelectors;
    chrome.storage.local.set({ hiddenElements: allHidden }, () => {
      updatePageStyles();
      if (hiddenSelectors.length === 0) {
        if (manageModeActive) toggleManageMode();
      }
    });
  });
}

function startSelectionMode() {
  if (manageModeActive) toggleManageMode();
  if (selectionModeActive) cleanupSelectionMode();

  selectionModeActive = true;
  document.body.style.cursor = "crosshair";
  document.addEventListener("keydown", globalEscHandler);

  const highlighter = document.createElement("div");
  highlighter.id = "focus-mode-highlighter";
  Object.assign(highlighter.style, {
    position: "fixed",
    border: "2px solid #10b981",
    background: "rgba(16, 185, 129, 0.2)",
    pointerEvents: "none",
    zIndex: "9999999",
    transition: "all 0.05s",
  });
  document.body.appendChild(highlighter);

  function moveHandler(e) {
    const rect = e.target.getBoundingClientRect();
    Object.assign(highlighter.style, {
      top: rect.top + "px",
      left: rect.left + "px",
      width: rect.width + "px",
      height: rect.height + "px",
    });
  }

  function clickHandler(e) {
    e.preventDefault();
    e.stopPropagation();

    const target = e.target;

    let selector = target.tagName.toLowerCase();
    if (target.id) {
      selector += `#${target.id}`;
    } else if (
      target.className &&
      typeof target.className === "string" &&
      target.className.trim() !== ""
    ) {
      selector += `.${target.className.trim().split(/\s+/)[0]}`;
    } else {
      let parent = target.parentElement;
      if (parent) {
        let children = Array.from(parent.children);
        let index = children.indexOf(target) + 1;
        selector += `:nth-child(${index})`;
      }
    }

    // Speichern
    chrome.storage.local.get(["hiddenElements"], (result) => {
      const allHidden = result.hiddenElements || {};
      if (!allHidden[hostname]) allHidden[hostname] = [];

      if (!allHidden[hostname].includes(selector)) {
        allHidden[hostname].push(selector);
      }

      chrome.storage.local.set({ hiddenElements: allHidden }, () => {
        hiddenSelectors = allHidden[hostname];
        updatePageStyles();
        cleanupSelectionMode(); // Beenden nach Klick
      });
    });
  }

  window.focusModeMoveHandler = moveHandler;
  window.focusModeClickHandler = clickHandler;

  document.addEventListener("mousemove", moveHandler);
  document.addEventListener("click", clickHandler, {
    capture: true,
    once: true,
  });
}

function cleanupSelectionMode() {
  selectionModeActive = false;
  document.body.style.cursor = "default";

  const highlighter = document.getElementById("focus-mode-highlighter");
  if (highlighter) highlighter.remove();

  document.removeEventListener("keydown", globalEscHandler);
  if (window.focusModeMoveHandler)
    document.removeEventListener("mousemove", window.focusModeMoveHandler);
  if (window.focusModeClickHandler)
    document.removeEventListener("click", window.focusModeClickHandler, true);
}
