// The Agent Security Suite's shared inventory format, schema v0.1, vendored unedited in
// schemas/agent-inventory.schema.json. `ghostgrant import` reads one, `ghostgrant export
// --format inventory` writes one, and both validate against the vendored schema.
import { readFileSync } from "node:fs";
import { looksLikeSecret, PROVIDERS, type Credential, type Provider, strings } from "./manifest.ts";
import type { CheckResult, DecommissionRecord } from "./records.ts";

type Json = Record<string, unknown>;

export type InventoryCredential = {
  id: string;
  type: string;
  fingerprint?: string;
  lastVerifiedDeadAt?: string | null;
  [k: string]: unknown;
};

export type InventoryIdentity = {
  id: string;
  kind: string;
  platform: string;
  displayName: string;
  status: string;
  credentials?: InventoryCredential[];
  [k: string]: unknown;
};

export type Finding = {
  id: string;
  identityId: string;
  ruleId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  evidence?: string;
  remediation?: string;
  status?: string;
  references?: string[];
};

export type Inventory = {
  schemaVersion: "0.1";
  generatedAt: string;
  producer: { name: string; version: string; url?: string };
  identities: InventoryIdentity[];
  findings?: Finding[];
  x?: Json;
};

// What a record keeps from the inventory it was imported from, so an export can hand the
// identity back as it came, with other producers' findings and `x` data unchanged.
export type ImportedFrom = { identity: InventoryIdentity; findings?: Finding[]; x?: Json };

export class InventoryError extends Error {}

export const PRODUCER = "ghost-grant";
export const RULE_STILL_LIVE = `${PRODUCER}/credential-still-live`;
const REPO = "https://github.com/ai-automation-tools/ghost-grant";

const SCHEMA = JSON.parse(
  readFileSync(new URL("../schemas/agent-inventory.schema.json", import.meta.url), "utf8"),
) as Json & { $defs: Record<string, Json & { properties: Record<string, { enum?: string[] }> }> };
const CREDENTIAL_TYPES = SCHEMA.$defs.credential.properties.type.enum!;
const PLATFORMS = SCHEMA.$defs.identity.properties.platform.enum!;

// A validator for the JSON Schema keywords the vendored schema uses. A keyword it doesn't
// know throws, so a schema update that needs more can't be validated by half.
const IGNORED = new Set(["$schema", "$id", "$defs", "title", "description", "default", "examples"]);
const FORMATS: Record<string, (s: string) => boolean> = {
  "date-time": (s) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(s) && !Number.isNaN(Date.parse(s)),
  email: (s) => /^[^\s@]+@[^\s@]+$/.test(s),
  uri: (s) => /^[a-z][a-z0-9+.-]*:/i.test(s) && URL.canParse(s),
};
const typeOf = (v: unknown) =>
  v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;

// The first way `v` breaks `s`, as "<path> <problem>", or undefined. Messages name paths and
// what the schema wants, never the value, so a pasted secret can't reach the terminal.
function check(v: unknown, s: Json, path: string): string | undefined {
  for (const k of Object.keys(s))
    if (!IGNORED.has(k) && !(k in KEYWORDS)) throw new Error(`The schema uses ${k}, which this validator doesn't support.`);
  for (const [k, kw] of Object.entries(KEYWORDS)) {
    if (!(k in s)) continue;
    const e = kw(v, s[k], path, s);
    if (e) return e;
  }
}

const KEYWORDS: Record<string, (v: unknown, arg: unknown, path: string, s: Json) => string | undefined> = {
  $ref: (v, ref, path) => {
    const m = /^#\/\$defs\/([^/]+)$/.exec(ref as string);
    if (!m) throw new Error(`The schema uses $ref ${ref}, which this validator doesn't support.`);
    return check(v, SCHEMA.$defs[m[1]], path);
  },
  type: (v, t, path) => {
    const want = [t].flat() as string[];
    const got = typeOf(v);
    return want.includes(got) || (got === "integer" && want.includes("number")) ? undefined : `${path} must be ${want.join(" or ")}`;
  },
  const: (v, c, path) => (v === c ? undefined : `${path} must be ${JSON.stringify(c)}`),
  enum: (v, e, path) => ((e as unknown[]).includes(v) ? undefined : `${path} must be one of: ${(e as unknown[]).join(", ")}`),
  pattern: (v, p, path) => (typeof v !== "string" || new RegExp(p as string, "u").test(v) ? undefined : `${path} must match ${p}`),
  format: (v, f, path) => {
    if (!FORMATS[f as string]) throw new Error(`The schema uses format ${f}, which this validator doesn't support.`);
    return typeof v !== "string" || FORMATS[f as string](v) ? undefined : `${path} must be a valid ${f}`;
  },
  minimum: (v, m, path) => (typeof v !== "number" || v >= (m as number) ? undefined : `${path} must be at least ${m}`),
  items: (v, items, path) => {
    if (!Array.isArray(v)) return;
    for (const [i, x] of v.entries()) {
      const e = check(x, items as Json, `${path}[${i}]`);
      if (e) return e;
    }
  },
  required: (v, req, path) => {
    if (typeOf(v) !== "object") return;
    const missing = (req as string[]).find((k) => !Object.hasOwn(v as Json, k));
    return missing && `${path}.${missing} is required`;
  },
  properties: (v, props, path) => {
    if (typeOf(v) !== "object") return;
    for (const [k, sub] of Object.entries(props as Record<string, Json>)) {
      if (!Object.hasOwn(v as Json, k)) continue;
      const e = check((v as Json)[k], sub, `${path}.${k}`);
      if (e) return e;
    }
  },
  additionalProperties: (v, allowed, path, s) => {
    if (allowed !== false) throw new Error("The schema uses an additionalProperties schema, which this validator doesn't support.");
    if (typeOf(v) !== "object") return;
    const extra = Object.keys(v as Json).find((k) => !Object.hasOwn((s.properties ?? {}) as Json, k));
    return extra && `${path}.${extra} is not allowed`;
  },
};

export function validateInventory(doc: unknown): string | undefined {
  return check(doc, SCHEMA, "inventory");
}

export function parseInventory(text: string): Inventory {
  if (text.trim() === "") throw new InventoryError("The inventory is empty.");
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    // JSON.parse's own message quotes the text around the error, which could hold a secret.
    throw new InventoryError("The inventory is not valid JSON.");
  }
  for (const [path, s] of strings(doc, "inventory"))
    if (looksLikeSecret(s))
      throw new InventoryError(`${path} looks like a raw secret. An inventory holds fingerprints only.`);
  const e = validateInventory(doc);
  if (e) throw new InventoryError(`${e}.`);
  return doc as Inventory;
}

const KEY = "inventory:"; // record credential key for an imported credential: "inventory:<credential id>"

// A record name from the identity's display name, falling back to its id.
function agentName(identity: InventoryIdentity): string {
  const slug = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[^A-Za-z0-9]+|-+$/g, "").slice(0, 64);
  return slug(identity.displayName) || slug(identity.id);
}

// One record per retired identity GhostGrant can check, plus a reason for each it can't.
export function recordsFromInventory(
  inv: Inventory,
  sha256: string,
  now: Date,
): { records: DecommissionRecord[]; skipped: string[] } {
  const records: DecommissionRecord[] = [];
  const skipped: string[] = [];
  for (const identity of inv.identities.filter((i) => i.status === "retired")) {
    const creds = identity.credentials ?? [];
    const why = !(PROVIDERS as readonly string[]).includes(identity.platform)
      ? `GhostGrant doesn't check ${identity.platform} credentials`
      : creds.length === 0
        ? "it lists no credentials"
        : new Set(creds.map((c) => c.id)).size < creds.length
          ? "two of its credentials share an id"
          : undefined;
    if (why) {
      skipped.push(`${identity.id}: ${why}.`);
      continue;
    }
    const findings = inv.findings?.filter((f) => f.identityId === identity.id && !f.ruleId.startsWith(`${PRODUCER}/`));
    records.push({
      agent: agentName(identity),
      decommissionedAt: now.toISOString(),
      manifestSha256: sha256,
      credentials: creds.map((c): Credential => ({
        provider: identity.platform as Provider,
        type: c.type,
        prefix: "",
        hash: KEY + c.id,
        ...(c.fingerprint && { fingerprint: c.fingerprint }),
      })),
      inventory: { identity, ...(findings?.length ? { findings } : {}), ...(inv.x && { x: inv.x }) },
    });
  }
  return { records, skipped };
}

// The inventory form of a record decommissioned from a manifest. The manifest's salted
// hashes stay out, as they do in reports.
function identityFromManifest(r: DecommissionRecord): InventoryIdentity {
  const providers = new Set(r.credentials.map((c) => c.provider));
  const [only] = providers;
  return {
    id: `${PRODUCER}:${r.agent}`,
    kind: "ai-agent",
    platform: providers.size === 1 && PLATFORMS.includes(only) ? only : "other",
    displayName: r.agent,
    status: "retired",
    retiredAt: r.decommissionedAt,
    credentials: r.credentials.map((c, i) => ({
      id: `${c.provider}:${c.prefix}:${i + 1}`,
      type: CREDENTIAL_TYPES.includes(c.type) ? c.type : "other",
    })),
  };
}

// Every record as one inventory. A credential's latest dead answer becomes its
// `lastVerifiedDeadAt`; one whose latest definite answer is alive gets a critical finding.
// Only answers from `source` count, and x["ghost-grant"].source says which that was.
export function exportInventory(
  records: DecommissionRecord[],
  source: CheckResult["source"],
  now: Date,
  version: string,
): Inventory {
  const identities: InventoryIdentity[] = [];
  const findings: Finding[] = [];
  const x: [string, unknown][] = [];
  for (const r of records) {
    const history = (r.checks ?? []).filter((c) => c.source === source);
    const base = r.inventory?.identity ?? identityFromManifest(r);
    // Record credentials and inventory credentials line up by position: both are built so.
    const credentials = (base.credentials ?? []).map((ic, i) => {
      const c = r.credentials[i];
      const dead = history.findLast((h) => h.hash === c.hash && h.status === "dead");
      const last = history.findLast((h) => h.hash === c.hash && h.status !== "unknown");
      if (last?.status === "alive")
        findings.push({
          id: `${RULE_STILL_LIVE}/${base.id}/${ic.id}`,
          identityId: base.id,
          ruleId: RULE_STILL_LIVE,
          severity: "critical",
          title: "A retired agent's credential still works",
          evidence:
            `${c.provider} ${c.type} ${ic.id} answered alive at the ${last.window} check (${last.checkedAt})` +
            (source === "mock" ? ", from canned mock responses." : "."),
          remediation: `Revoke it at ${c.provider}, then run ghostgrant check --live to confirm it answers dead.`,
          status: "open",
        });
      return dead ? { ...ic, lastVerifiedDeadAt: dead.checkedAt } : ic;
    });
    identities.push({ ...base, ...(base.credentials && { credentials }) });
    findings.push(...(r.inventory?.findings ?? []));
    x.push(...Object.entries(r.inventory?.x ?? {}).filter(([k]) => k !== PRODUCER));
  }
  return {
    schemaVersion: "0.1",
    generatedAt: now.toISOString(),
    producer: { name: PRODUCER, version, url: REPO },
    identities,
    findings,
    // ponytail: records from different inventories that share an x key keep the last one.
    x: Object.fromEntries([...x, [PRODUCER, { source }]]),
  };
}
