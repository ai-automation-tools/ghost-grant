import { appendFileSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Status } from "./adapters.ts";
import type { Credential } from "./manifest.ts";

// When each check is due, measured from the decommission time. "initial" is the first
// check, due straight away.
export const WINDOWS = [
  ["initial", 0],
  ["24h", 24 * 3600_000],
  ["7d", 7 * 24 * 3600_000],
  ["30d", 30 * 24 * 3600_000],
  ["90d", 90 * 24 * 3600_000],
] as const;
export type Window = (typeof WINDOWS)[number][0];

// One answer for one credential, keyed by its hash. Mock and live answers are kept apart
// so canned responses can never stand in for a real check.
export type CheckResult = {
  window: Window;
  checkedAt: string; // ISO 8601
  source: "mock" | "live";
  hash: string;
  status: Status;
};

export type DecommissionRecord = {
  agent: string;
  decommissionedAt: string; // ISO 8601
  manifestSha256: string;
  credentials: Credential[];
  checks?: CheckResult[]; // append-only, oldest first
};

export type Alert = {
  at: string; // ISO 8601
  agent: string;
  window: Window;
  source: "mock" | "live";
  provider: string;
  type: string;
  prefix: string;
};

const dir = (home: string) => join(home, "records");
const file = (home: string, agent: string) => join(dir(home), `${agent}.json`);
const json = (v: unknown) => JSON.stringify(v, null, 2) + "\n";

// The latest window whose time has come, or undefined before the first one.
export function dueWindow(record: DecommissionRecord, now: Date): Window | undefined {
  const age = now.getTime() - Date.parse(record.decommissionedAt);
  return WINDOWS.findLast(([, offset]) => age >= offset)?.[0];
}

// Refuses to overwrite: an existing record is history, not something to replace.
export function writeRecord(home: string, record: DecommissionRecord): string {
  mkdirSync(dir(home), { recursive: true });
  const f = file(home, record.agent);
  writeFileSync(f, json(record), { flag: "wx" });
  return f;
}

// Replaces an existing record with one that has new check results. Written to a temp file
// and renamed, so a crash mid-write can't leave half a record.
export function saveRecord(home: string, record: DecommissionRecord): void {
  const f = file(home, record.agent);
  writeFileSync(`${f}.tmp`, json(record));
  renameSync(`${f}.tmp`, f);
}

export function loadRecords(home: string): DecommissionRecord[] {
  let names: string[];
  try {
    names = readdirSync(dir(home));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return names
    .filter((n) => n.endsWith(".json"))
    .sort()
    .map((n) => JSON.parse(readFileSync(join(dir(home), n), "utf8")) as DecommissionRecord);
}

// One JSON object per line in $GHOSTGRANT_HOME/alerts.log.
export function appendAlert(home: string, alert: Alert): void {
  mkdirSync(home, { recursive: true });
  appendFileSync(join(home, "alerts.log"), JSON.stringify(alert) + "\n");
}
