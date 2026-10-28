import type { Provider } from "./manifest.ts";

export type Status = "alive" | "dead" | "unknown";

// One provider check. Takes the raw token for the length of one request and returns only
// a status: the token never reaches a return value, an error message or a log line.
export type Adapter = (token: string, fetchFn: typeof fetch, timeoutMs?: number) => Promise<Status>;

const TIMEOUT_MS = 10_000;

// GET /user is GitHub's whoami and changes nothing. 200 means the token still works, 401
// means GitHub refuses it. Anything else (403 rate limit, 5xx, timeout, network error) is
// unknown, never dead. GitHub's Credential Revocation API was not used: it revokes tokens,
// and GhostGrant only reads.
export const github: Adapter = async (token, fetchFn, timeoutMs = TIMEOUT_MS) => {
  // A plain setTimeout, not AbortSignal.timeout: that timer is unref'd, so on Node 22 a
  // request holding nothing else open lets the process exit before the timeout fires.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new DOMException("timed out", "TimeoutError")), timeoutMs);
  try {
    const res = await fetchFn("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ghostgrant",
      },
      signal: abort.signal,
    });
    if (res.status === 200) return "alive";
    if (res.status === 401) return "dead";
    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timer);
  }
};

export const ADAPTERS: Partial<Record<Provider, Adapter>> = { github };
