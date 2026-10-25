import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { DecommissionRecord } from "../src/records.ts";
import { buildReport, type Report } from "../src/report.ts";
import { renderReport } from "../site/app.ts";

const read = (f: string) => JSON.parse(readFileSync(new URL(`../site/${f}`, import.meta.url), "utf8"));
const record: DecommissionRecord = read("demo-record.json");
const bundled: Report = read("demo-report.json");

test("the bundled demo report is exactly what the CLI builds from the demo record", () => {
  // If this fails after a change to the Report type, regenerate site/demo-report.json with
  // buildReport(demo-record.json, "mock", new Date(generatedAt)).
  assert.deepEqual(bundled, buildReport(record, "mock", new Date(bundled.generatedAt)));
});

test("the demo covers GitHub across every window, with one flip and made-up identifiers", () => {
  assert.equal(bundled.verdict, "flipped");
  assert.ok(bundled.credentials.every((c) => c.provider === "github" && c.prefix.includes("FAKE")));
  for (const c of bundled.credentials)
    assert.deepEqual([...new Set(c.checks.map((k) => k.window))], ["initial", "24h", "7d", "30d", "90d"]);
  assert.equal(bundled.credentials.flatMap((c) => c.checks).filter((k) => k.flip).length, 1);
});

test("the page renders every credential, the flip and the verdict, escaping what it prints", () => {
  const html = renderReport(bundled);
  assert.match(html, /GhostGrant report: triage-bot/);
  for (const c of bundled.credentials) assert.ok(html.includes(`<code>${c.prefix}</code>`));
  assert.equal(html.match(/FLIP: was dead, alive again/g)?.length, 1);
  assert.match(html, /went from dead back to alive/);
  assert.ok(!html.includes("sha256:1111"), "hashes stay out of the page");
  const evil = renderReport({ ...bundled, agent: "<img src=x onerror=alert(1)>" });
  assert.ok(!evil.includes("<img") && evil.includes("&lt;img"));
});
