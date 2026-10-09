import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Credential } from "./manifest.ts";

export type DecommissionRecord = {
  agent: string;
  decommissionedAt: string; // ISO 8601
  manifestSha256: string;
  credentials: Credential[];
};

const dir = (home: string) => join(home, "records");

// Refuses to overwrite: an existing record is history, not something to replace.
export function writeRecord(home: string, record: DecommissionRecord): string {
  mkdirSync(dir(home), { recursive: true });
  const file = join(dir(home), `${record.agent}.json`);
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  return file;
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
