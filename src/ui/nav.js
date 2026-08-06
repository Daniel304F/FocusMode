/** Sidebar navigation: switches the active page panel. */

export function showPage(pageId) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.page === pageId);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === `page-${pageId}`);
  });
}

export function initNav(onNavigate) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showPage(btn.dataset.page);
      onNavigate?.(btn.dataset.page);
    });
  });
}
