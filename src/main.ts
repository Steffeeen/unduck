import { readSavedBangs, redirectUrl, refreshBangs } from "./bangs";

async function main() {
  const query = new URL(window.location.href).searchParams.get("q")?.trim();
  if (window.location.pathname === "/list" || window.location.pathname === "/list/") {
    const { renderBangList } = await import("./pages");
    await renderBangList();
    return;
  }
  if (!query) {
    const { renderHome } = await import("./pages");
    renderHome();
    return;
  }
  try {
    // Standalone ! does not need the catalogue at all.
    let destination: string | null;
    if (/!(?:\s|$)/.test(query)) {
      destination = redirectUrl(query, []);
    } else {
      const saved = await readSavedBangs() ?? await refreshBangs();
      let defaultTrigger = "g";
      try { defaultTrigger = localStorage.getItem("default-bang") ?? "g"; } catch { /* Use the default when storage is blocked. */ }
      destination = redirectUrl(query, saved.bangs, defaultTrigger);
    }
    if (destination) window.location.replace(destination);
  } catch (error) {
    const { renderError } = await import("./pages");
    renderError(error);
  }
}

void main();
