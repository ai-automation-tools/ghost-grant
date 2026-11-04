import { test } from "node:test";
import assert from "node:assert/strict";
import { slack } from "../src/adapters.ts";

// Fake on purpose: Slack's prefix, nothing else real about it.
const TOKEN = "xoxb-FAKE-FAKE-FAKEFAKEFAKEFAKE";

const answering = (body: unknown, status = 200, headers: Record<string, string> = {}): typeof fetch =>
  async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });

for (const [name, fetchFn, want] of [
  ["ok: true is alive", answering({ ok: true, user_id: "U0FAKE" }), "alive"],
  ["invalid_auth is dead", answering({ ok: false, error: "invalid_auth" }), "dead"],
  ["token_revoked is dead", answering({ ok: false, error: "token_revoked" }), "dead"],
  ["account_inactive is dead", answering({ ok: false, error: "account_inactive" }), "dead"],
  ["another error is unknown", answering({ ok: false, error: "fatal_error" }), "unknown"],
  ["ok: false with no error is unknown", answering({ ok: false }), "unknown"],
  ["a 200 ratelimited body is unknown", answering({ ok: false, error: "ratelimited" }), "unknown"],
  ["a 429 is unknown", answering({ ok: false, error: "ratelimited" }, 429, { "retry-after": "30" }), "unknown"],
  ["a 500 is unknown", answering("", 500), "unknown"],
  ["a 503 is unknown", answering("", 503), "unknown"],
  ["a body that isn't JSON is unknown", answering("<html>maintenance</html>"), "unknown"],
  ["a network error is unknown", async () => { throw new TypeError("fetch failed"); }, "unknown"],
] as const) {
  test(`slack: ${name}`, async () => {
    assert.equal(await slack(TOKEN, fetchFn), want);
  });
}

test("slack: a request that outlasts the timeout is unknown", async () => {
  const hang: typeof fetch = (_url, init) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
  assert.equal(await slack(TOKEN, hang, 20), "unknown");
});

test("slack: calls auth.test with the token as a bearer header, never in the URL or body", async () => {
  let seen: { url: string; method: string; auth: string | null; body: unknown } | undefined;
  await slack(TOKEN, async (url, init) => {
    seen = {
      url: String(url),
      method: init?.method ?? "GET",
      auth: new Headers(init?.headers).get("authorization"),
      body: init?.body,
    };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
  assert.deepEqual(seen, {
    url: "https://slack.com/api/auth.test",
    method: "POST",
    auth: `Bearer ${TOKEN}`,
    body: undefined,
  });
});
