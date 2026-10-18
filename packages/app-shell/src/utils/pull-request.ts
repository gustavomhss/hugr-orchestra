// Pull requests come from the server's /api/pull-request routes, which run the gh or glab CLI signed in there.
// A failure keeps the server's reason so screens can say why there is no number or no pull request.
export const PULL_REQUEST_FAILURES = [
  "not_installed",
  "not_authenticated",
  "no_remote",
  "branch_not_pushed",
  "cli_failed",
] as const

export type PullRequestHost = "github" | "gitlab"

export type PullRequestFailure = {
  // `unavailable` is a server without the routes; `error` is anything that cannot be read as an answer.
  reason: (typeof PULL_REQUEST_FAILURES)[number] | "unavailable" | "error"
  host?: PullRequestHost
  branch?: string
  remote?: string
  message?: string
}

export type PullRequestResult<T> = { data: T } | { failure: PullRequestFailure }

// Reads a legacy SDK call made with `throwOnError: false`. Malformed data is an error, never a value.
export async function pullRequestCall<T>(
  call: Promise<{ data?: unknown; error?: unknown; response?: Response }>,
  parse: (data: unknown) => T | undefined,
): Promise<PullRequestResult<T>> {
  const result = await call.catch(() => undefined)
  const status = result?.response?.status
  if (status !== undefined && [404, 405, 501].includes(status)) return { failure: { reason: "unavailable" } }
  if (!result?.response?.ok) return { failure: hostFailure(result?.error) }
  const data = parse(isRecord(result.data) ? result.data.data : undefined)
  return data === undefined ? { failure: { reason: "error" } } : { data }
}

// Only an https address with a number counts as a created pull request.
export function createdPullRequest(value: unknown) {
  if (!isRecord(value) || typeof value.url !== "string" || !/^https:\/\/\S+$/.test(value.url)) return
  if (typeof value.number !== "number" || !Number.isSafeInteger(value.number)) return
  return { url: value.url, number: value.number }
}

// The host's own total of open pull requests; the listed items may be only its newest page.
export function openPullRequests(value: unknown) {
  if (!isRecord(value) || !host(value.host) || typeof value.truncated !== "boolean") return
  if (typeof value.count !== "number" || !Number.isSafeInteger(value.count) || value.count < 0) return
  return { host: value.host, count: value.count, truncated: value.truncated }
}

export function pullRequestCli(value: PullRequestHost | undefined) {
  return value === "gitlab" ? "glab" : "gh"
}

function hostFailure(error: unknown): PullRequestFailure {
  const data = isRecord(error) && error.name === "PullRequestError" && isRecord(error.data) ? error.data : undefined
  const reason = PULL_REQUEST_FAILURES.find((kind) => kind === data?.kind)
  if (!data || !reason) return { reason: "error" }
  return {
    reason,
    host: host(data.host) ? data.host : undefined,
    branch: typeof data.branch === "string" ? data.branch : undefined,
    remote: typeof data.remote === "string" ? data.remote : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
  }
}

function host(value: unknown): value is PullRequestHost {
  return value === "github" || value === "gitlab"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
