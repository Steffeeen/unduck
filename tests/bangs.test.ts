import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { readSavedBangs, redirectUrl, refreshBangs, validateBangs } from "../src/bangs.ts";

const bangs = [
  { t: "g", d: "www.google.com", u: "https://www.google.com/search?q={{{s}}}" },
  { t: "gh", d: "github.com", u: "https://github.com/search?q={{{s}}}" },
];

test("shipped catalogue uses only t, d, u and passes validation", async () => {
  const entries = JSON.parse(await readFile(new URL("../public/bangs/bangs.json", import.meta.url), "utf8"));
  assert.ok(entries.length > 0);
  for (const entry of entries) assert.deepEqual(Object.keys(entry).sort(), ["d", "t", "u"]);
  assert.equal(validateBangs(entries).length, entries.length);
});

test("redirects preserve query handling and fallback behavior", () => {
  assert.equal(redirectUrl("hello world", bangs), "https://www.google.com/search?q=hello%20world");
  assert.equal(redirectUrl("!GH t3dotgg/unduck", bangs), "https://github.com/search?q=t3dotgg/unduck");
  assert.equal(redirectUrl("hello !gh world", bangs), "https://github.com/search?q=hello%20world");
  assert.equal(redirectUrl("!gh", bangs), "https://github.com/");
  assert.equal(redirectUrl("!unknown test", bangs), "https://www.google.com/search?q=test");
  assert.equal(redirectUrl("test", bangs, "gh"), "https://github.com/search?q=test");
  assert.equal(redirectUrl("test", bangs, "deleted"), "https://www.google.com/search?q=test");
  assert.equal(redirectUrl("a & b # c", bangs), "https://www.google.com/search?q=a%20%26%20b%20%23%20c");
  assert.equal(redirectUrl("   ", bangs), null);
  assert.throws(() => redirectUrl("test", [bangs[1]]), /default bang is missing/);
});

test("standalone ! uses DuckDuckGo without definitions", () => {
  assert.equal(redirectUrl("hello !", []), "https://duckduckgo.com/?q=!ducky+hello");
  assert.equal(redirectUrl("! hello world", []), "https://duckduckgo.com/?q=!ducky+hello%20world");
});

test("upstream relative destinations resolve against DuckDuckGo", () => {
  const relative = [{ t: "bang", d: "", u: "/bang?q={{{s}}}" }];
  assert.equal(redirectUrl("!bang cats", relative), "https://duckduckgo.com/bang?q=cats");
  assert.equal(redirectUrl("!bang", relative), "https://duckduckgo.com");
});

test("validation rejects malformed and unsafe data", () => {
  for (const value of [null, [], {}, [null], [{ t: "g" }], [{ ...bangs[0], u: "javascript:alert(1)" }], [{ ...bangs[0], u: "//evil.example" }], [{ ...bangs[0], d: "a@evil.example" }], [bangs[0], { ...bangs[0], t: "G" }]]) {
    assert.throws(() => validateBangs(value));
  }
  assert.deepEqual(validateBangs([{ ...bangs[0], t: "G" }]), [bangs[0]]);
  assert.throws(() => validateBangs([bangs[1]]), /must include !g/);
});

const originalFetch = globalThis.fetch;
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, "caches");
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalCaches) Object.defineProperty(globalThis, "caches", originalCaches);
  else Reflect.deleteProperty(globalThis, "caches");
});

function mockCache() {
  let stored: Response | undefined;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: {
    open: async () => ({
      match: async () => stored?.clone(),
      put: async (_url: string, response: Response) => { stored = response.clone(); },
    }),
  } });
}

test("refresh persists definitions; cached searches do not fetch", async () => {
  mockCache();
  assert.equal(await readSavedBangs(), null);
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/bangs/bangs.json");
    assert.equal(options?.cache, "no-cache");
    return Response.json(bangs);
  };
  const result = await refreshBangs();
  assert.equal(result.persisted, true);
  assert.deepEqual((await readSavedBangs())?.bangs, bangs);
  assert.equal(calls, 1);
});

test("invalid or unavailable refresh leaves last good definitions intact", async () => {
  mockCache();
  globalThis.fetch = async () => Response.json(bangs);
  await refreshBangs();
  globalThis.fetch = async () => Response.json([{ t: "broken" }]);
  await assert.rejects(refreshBangs());
  assert.deepEqual((await readSavedBangs())?.bangs, bangs);
  globalThis.fetch = async () => new Response("Missing", { status: 404 });
  await assert.rejects(refreshBangs(), /HTTP 404/);
  assert.deepEqual((await readSavedBangs())?.bangs, bangs);
  globalThis.fetch = async () => { throw new TypeError("Offline"); };
  await assert.rejects(refreshBangs(), /Offline/);
  assert.deepEqual((await readSavedBangs())?.bangs, bangs);
});

test("unavailable browser storage does not prevent online use", async () => {
  Reflect.deleteProperty(globalThis, "caches");
  assert.equal(await readSavedBangs(), null);
  globalThis.fetch = async () => Response.json(bangs);
  const result = await refreshBangs();
  assert.equal(result.persisted, false);
  assert.deepEqual(result.bangs, bangs);
});
