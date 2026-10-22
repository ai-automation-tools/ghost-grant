import { test } from "node:test";
import assert from "node:assert/strict";
import { github } from "../src/adapters.ts";

// Fake on purpose: right shape, no real checksum.
const TOKEN = "ghp_FAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKEFAKE";

const answering = (status: number, headers: Record<string, string> = {}): typeof fetch =>
  async () => new Response("{}", { status, headers });

for (const [name, fetchFn, want] of [
  ["200 is alive", answering(200), "alive"],
  ["401 is dead", answering(401), "dead"],
  ["a 403 rate limit is unknown", answering(403, { "x-ratelimit-remaining": "0" }), "unknown"],
  ["a 429 is unknown", answering(429, { "retry-after": "60" }), "unknown"],
  ["a 500 is unknown", answering(500), "unknown"],
  ["a 503 is unknown", answering(503), "unknown"],
  ["a network error is unknown", async () => { throw new TypeError("fetch failed"); }, "unknown"],
] as const) {
  test(`github: ${name}`, async () => {
    assert.equal(await github(TOKEN, fetchFn), want);
  });
}

test("github: a request that outlasts the timeout is unknown", async () => {
  // Never answers; only the adapter's own abort signal ends it.
  const hang: typeof fetch = (_url, init) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  assert.equal(await github(TOKEN, hang, 20), "unknown");
});

test("github: calls GET /user with the token as a bearer and nothing else", async () => {
  let seen: { url: string; method: string; auth: string | null } | undefined;
  await github(TOKEN, async (url, init) => {
    seen = { url: String(url), method: init?.method ?? "GET", auth: new Headers(init?.headers).get("authorization") };
    return new Response("{}", { status: 200 });
  });
  assert.deepEqual(seen, { url: "https://api.github.com/user", method: "GET", auth: `Bearer ${TOKEN}` });
});
