import { readSavedBangs, refreshBangs, type Bang, type SavedBangs } from "./bangs";
import "./global.css";

const app = document.querySelector<HTMLDivElement>("#app")!;

export function renderHome() {
  app.innerHTML = `
    <main class="home">
      <div class="content-container">
        <h1>Und*ck</h1>
        <p>Fast, local bang redirects. Add this URL as a custom search engine in your browser.</p>
        <div class="url-container">
          <input class="url-input" aria-label="Search engine URL" readonly />
          <button class="copy-button" aria-label="Copy search engine URL"><img src="/clipboard.svg" alt="" /></button>
        </div>
        <p class="home-links"><a href="/list">Browse available bangs</a></p>
        <p class="copy-status" role="status"></p>
      </div>
      <footer class="footer"><a href="https://github.com/steffeeen/unduck" target="_blank" rel="noreferrer">github</a></footer>
    </main>`;
  const input = app.querySelector<HTMLInputElement>("input")!;
  input.value = `${window.location.origin}/?q=%s`;
  app.querySelector("button")!.addEventListener("click", async () => {
    const status = app.querySelector<HTMLElement>(".copy-status")!;
    try {
      await navigator.clipboard.writeText(input.value);
      status.textContent = "Copied to clipboard.";
    } catch {
      input.select();
      status.textContent = "Select and copy the URL above.";
    }
  });
}

export function renderError(error: unknown) {
  app.innerHTML = `<main class="home"><div class="content-container"><h1>Could not redirect</h1><p class="error-message" role="alert"></p><p><a href="/list">Open the bang list to refresh or try again</a></p><p><a href="/">Back to home</a></p></div></main>`;
  app.querySelector(".error-message")!.textContent = error instanceof Error ? error.message : "Could not load bang definitions.";
}

export async function renderBangList() {
  document.title = "Available Bangs | Unduck";
  app.innerHTML = `
    <main class="bang-page">
      <header class="bang-header"><a href="/">Und*ck</a><a href="/">Search engine setup</a></header>
      <h1>Available bangs</h1>
      <p class="bang-intro">Your shortcuts to the web. This page refreshes the list saved in this browser; searches use that saved list without checking for updates.</p>
      <div class="refresh-status"><p id="refresh-status" role="status">Loading saved bangs and checking for updates...</p><button class="refresh-button" disabled>Refreshing...</button></div>
      <p id="bang-count" class="bang-count" role="status"></p>
      <ul class="bang-list" aria-label="Available bangs"></ul>
    </main>`;
  const status = app.querySelector<HTMLElement>("#refresh-status")!;
  const count = app.querySelector<HTMLElement>("#bang-count")!;
  const list = app.querySelector<HTMLUListElement>(".bang-list")!;
  const refresh = app.querySelector<HTMLButtonElement>(".refresh-button")!;
  let bangs: Bang[] = [];
  let saved: SavedBangs | null = null;

  function render() {
    const fragment = document.createDocumentFragment();
    for (const bang of bangs) {
      const item = document.createElement("li");
      const trigger = document.createElement("code");
      trigger.textContent = `!${bang.t}`;
      const details = document.createElement("div");
      const domain = document.createElement("span");
      domain.className = "bang-domain";
      domain.textContent = bang.d || "duckduckgo.com";
      const template = document.createElement("span");
      template.className = "bang-template";
      template.textContent = bang.u;
      details.append(domain, template);
      item.append(trigger, details);
      fragment.append(item);
    }
    list.replaceChildren(fragment);
    count.textContent = bangs.length ? `${bangs.length.toLocaleString()} bangs` : "No saved bangs yet.";
  }

  async function update() {
    refresh.disabled = true;
    refresh.textContent = "Refreshing...";
    status.textContent = "Checking for the latest bangs...";
    status.classList.remove("error-message");
    try {
      const latest = await refreshBangs();
      bangs = latest.bangs;
      saved = latest;
      render();
      status.textContent = latest.persisted
        ? `Saved ${bangs.length.toLocaleString()} bangs in this browser. Last checked ${new Date(latest.updatedAt).toLocaleString()}.`
        : "Loaded the latest bangs, but browser storage is unavailable. Searches will need to download the list until storage is available.";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Refresh failed.";
      const previous = saved?.updatedAt ? ` Last saved ${new Date(saved.updatedAt).toLocaleString()}.` : "";
      status.textContent = `${message} ${bangs.length ? "Keeping your saved list." : "Check your connection and bang file, then try again."}${previous}`;
      status.classList.add("error-message");
    } finally {
      refresh.disabled = false;
      refresh.textContent = "Refresh now";
    }
  }

  refresh.addEventListener("click", () => void update());
  saved = await readSavedBangs();
  bangs = saved?.bangs ?? [];
  render();
  await update();
}
