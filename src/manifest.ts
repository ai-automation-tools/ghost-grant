import { parse, YAMLParseError } from "yaml";

export const PROVIDERS = ["github", "slack", "aws", "okta", "google-workspace"] as const;
export type Provider = (typeof PROVIDERS)[number];

export type Credential = {
  provider: Provider;
  type: string;
  prefix: string; // empty for a credential imported from an inventory
  hash: string; // or "inventory:<credential id>" for an imported credential
  fingerprint?: string; // from an inventory: the start of the secret's SHA-256 in hex
};

export type Manifest = {
  agent: string;
  credentials: Credential[];
};

// Thrown for anything wrong with a manifest. Messages name the field, never its value,
// so a raw secret pasted by mistake can't leak into a terminal or a log.
export class ManifestError extends Error {}

export const MAX_PREFIX = 12;
const AGENT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HASH = /^sha256:[0-9a-f]{64}$/;

// Shapes of real provider secrets. Matching any of them means someone pasted the secret
// instead of its identifier.
const SECRET_SHAPES = [
  /gh[pousr]_[A-Za-z0-9]{30,}/, // GitHub classic and app tokens
  /github_pat_[A-Za-z0-9_]{30,}/, // GitHub fine-grained tokens
  /xox[abposre]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /^[A-Za-z0-9/+]{40}$/, // AWS secret access key
  /^00[A-Za-z0-9_-]{40}$/, // Okta API token
  /AIza[0-9A-Za-z_-]{35}/, // Google API key
  /ya29\.[0-9A-Za-z_-]{20,}/, // Google OAuth access token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

export function looksLikeSecret(s: string): boolean {
  return SECRET_SHAPES.some((re) => re.test(s));
}

// Every string in the document, keys included, with a path for error messages.
export function* strings(v: unknown, path: string): Generator<[string, string]> {
  if (typeof v === "string") yield [path, v];
  else if (Array.isArray(v)) for (const [i, x] of v.entries()) yield* strings(x, `${path}[${i}]`);
  else if (v && typeof v === "object")
    for (const [k, x] of Object.entries(v)) {
      yield [`${path}.${k} (key)`, k];
      yield* strings(x, `${path}.${k}`);
    }
}

function str(v: unknown, path: string): string {
  if (typeof v !== "string" || v.trim() === "") throw new ManifestError(`${path} must be a non-empty string.`);
  return v;
}

export function parseManifest(text: string): Manifest {
  if (text.trim() === "") throw new ManifestError("The manifest is empty.");
  let doc: unknown;
  try {
    doc = parse(text);
  } catch (e) {
    // yaml's own message quotes the offending line, which could hold a secret.
    const pos = e instanceof YAMLParseError ? e.linePos?.[0] : undefined;
    throw new ManifestError(`The manifest is not valid YAML${pos ? ` (line ${pos.line}, column ${pos.col})` : ""}.`);
  }
  if (doc === null || doc === undefined) throw new ManifestError("The manifest is empty.");

  for (const [path, s] of strings(doc, "manifest"))
    if (looksLikeSecret(s))
      throw new ManifestError(
        `${path} looks like a raw secret. The manifest holds identifiers only: a short prefix and a salted hash.`,
      );

  if (typeof doc !== "object" || Array.isArray(doc)) throw new ManifestError("The manifest must be a YAML mapping.");
  const { agent, credentials } = doc as Record<string, unknown>;

  if (typeof agent !== "string" || !AGENT_NAME.test(agent))
    throw new ManifestError("agent must be a name of letters, digits, '.', '_' or '-' (64 characters at most).");
  if (!Array.isArray(credentials) || credentials.length === 0)
    throw new ManifestError("credentials must be a list with at least one entry.");

  return {
    agent,
    credentials: credentials.map((c: unknown, i): Credential => {
      const p = `credentials[${i}]`;
      if (!c || typeof c !== "object" || Array.isArray(c)) throw new ManifestError(`${p} must be a mapping.`);
      const r = c as Record<string, unknown>;
      const provider = str(r.provider, `${p}.provider`);
      if (!(PROVIDERS as readonly string[]).includes(provider))
        throw new ManifestError(`${p}.provider must be one of: ${PROVIDERS.join(", ")}.`);
      const prefix = str(r.prefix, `${p}.prefix`);
      if (prefix.length > MAX_PREFIX)
        throw new ManifestError(`${p}.prefix is longer than ${MAX_PREFIX} characters. Keep only the visible start of the credential.`);
      const hash = str(r.hash, `${p}.hash`);
      if (!HASH.test(hash)) throw new ManifestError(`${p}.hash must be "sha256:" followed by 64 lowercase hex digits.`);
      return { provider: provider as Provider, type: str(r.type, `${p}.type`), prefix, hash };
    }),
  };
}
