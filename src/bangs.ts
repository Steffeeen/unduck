export interface Bang {
  t: string;
  d: string;
  u: string;
}

export interface SavedBangs {
  bangs: Bang[];
  updatedAt: string;
}

const CACHE_NAME = "unduck-bangs-v1";
const DATA_URL = "/bangs/bangs.json";

export function httpUrl(value: string): URL {
  // A few original DuckDuckGo bangs use paths relative to DuckDuckGo itself.
  const url = new URL(value.trim(), "https://duckduckgo.com");
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Bang destinations must use HTTP or HTTPS.");
  }
  return url;
}

export function validateBangs(value: unknown): Bang[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("The bang file must contain a non-empty array.");
  }
  const triggers = new Set<string>();
  const bangs = value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("Each bang must be an object with t, d, and u fields.");
    }
    const { t, d, u } = entry as Record<string, unknown>;
    if (typeof t !== "string" || !t || /[\s!]/.test(t) ||
        typeof d !== "string" || typeof u !== "string" || !u.trim()) {
      throw new Error("Each bang needs a trigger (t), domain (d), and URL (u).");
    }
    const trigger = t.toLowerCase();
    if (triggers.has(trigger)) throw new Error(`Duplicate bang: !${trigger}`);
    triggers.add(trigger);
    if (!/^https?:\/\//i.test(u.trim()) && !/^\/(?!\/)/.test(u.trim())) {
      throw new Error(`Invalid destination for !${trigger}.`);
    }
    httpUrl(u);
    if (d) {
      const domain = httpUrl(`https://${d}`);
      if (domain.username || domain.password || domain.host !== d.toLowerCase() || domain.pathname !== "/" || domain.search || domain.hash) {
        throw new Error(`Invalid domain for !${trigger}.`);
      }
    }
    return { t: trigger, d, u };
  });
  if (!triggers.has("g")) throw new Error("The bang file must include !g as the default search engine.");
  return bangs;
}

export async function readSavedBangs(): Promise<SavedBangs | null> {
  try {
    const cache = await caches.open(CACHE_NAME);
    const response = await cache.match(DATA_URL);
    if (!response) return null;
    return {
      // Only refreshBangs writes this versioned cache, after validation.
      bangs: await response.json() as Bang[],
      updatedAt: response.headers.get("X-Unduck-Updated-At") ?? "",
    };
  } catch {
    return null;
  }
}

export async function refreshBangs(): Promise<SavedBangs & { persisted: boolean }> {
  const response = await fetch(DATA_URL, {
    cache: "no-cache",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Could not load bangs (HTTP ${response.status}).`);
  const bangs = validateBangs(await response.json());
  const updatedAt = new Date().toISOString();
  let persisted = false;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(DATA_URL, new Response(JSON.stringify(bangs), {
      headers: { "Content-Type": "application/json", "X-Unduck-Updated-At": updatedAt },
    }));
    persisted = true;
  } catch {
    // Storage may be unavailable or full; online searches should still work.
  }
  return { bangs, updatedAt, persisted };
}

export function redirectUrl(query: string, bangs: Bang[], defaultTrigger = "g"): string | null {
  query = query.trim();
  if (!query) return null;
  if (/!(?:\s|$)/.test(query)) {
    return `https://duckduckgo.com/?q=!ducky+${encodeURIComponent(query.replace("!", "").trim())}`;
  }
  const trigger = query.match(/!(\S+)/)?.[1]?.toLowerCase();
  const selected = bangs.find((bang) => bang.t === trigger)
    ?? bangs.find((bang) => bang.t === defaultTrigger.toLowerCase())
    ?? bangs.find((bang) => bang.t === "g");
  if (!selected) throw new Error("The default bang is missing. Add !g to your bang file.");
  const cleanQuery = query.replace(/!\S+\s*/i, "").trim();
  if (!cleanQuery) {
    return selected.d ? httpUrl(`https://${selected.d}`).href : httpUrl(selected.u).origin;
  }
  return httpUrl(selected.u.replace("{{{s}}}", encodeURIComponent(cleanQuery).replace(/%2F/g, "/"))).href;
}
