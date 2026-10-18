// @atlas/adapter-io — src/run-git.ts  (#74: the ONE resilient no-shell git seam)
//
// Every adapter git call routes through here: a single `execFileSync('git', …)` seam (NO shell), one error
// classifier, and one clock-free backoff — so the resilience WP-73 proved on rev-index is UNIFORM across the
// fleet, not a one-off (bobby's WP-73 note).
//
// HONEST scope (#74): the other seams are NOT blanket-retried. rev-index ALONE takes the contention-prone
// `.git/worktrees` admin lock; a plain `rev-parse`/`config`/`ls-files` read that fails does so
// DETERMINISTICALLY (bad rev, non-git dir, git absent) — where a retry only adds latency — and a WRITE
// (`notes add`, `clone`) is not safe to blindly repeat. So this module SHARES the classifier + backoff
// (rev-index reuses them for its STRUCTURAL fresh-worktree retry, which a command-level retry cannot provide —
// a half-created worktree wedges the same path) and offers an OPT-IN `runGitRetrying` for a caller that is
// idempotent AND contention-prone. The default `runGit` is a single classified attempt. stderr is CAPTURED on
// every call (never inherited) so a failure stays diagnosable via the thrown error and git's benign progress
// never leaks to the parent's stderr (fleet-wide the F7 anti-chatter property). No clock, no random.

import { execFileSync } from "node:child_process"

/** Options for one git invocation. `input` (when set) is piped to stdin (e.g. `notes add -F -`); otherwise
 *  stdin is closed. */
export interface RunGitOptions {
  readonly input?: string
}

/** The one git seam — `execFileSync`, NO shell (args are never shell-interpolated). stdin is closed (or
 *  `input`-piped); stdout+stderr are CAPTURED. On a non-zero exit `execFileSync` THROWS, the thrown error
 *  carrying the captured `.stderr` — a real failure is classifiable + diagnosable, never silently swallowed. */
export function runGit(repo: string, args: readonly string[], opts: RunGitOptions = {}): string {
  const hasInput = opts.input !== undefined
  return execFileSync("git", args as string[], {
    cwd: repo,
    encoding: "utf8",
    stdio: [hasInput ? "pipe" : "ignore", "pipe", "pipe"],
    ...(hasInput ? { input: opts.input } : {}),
  })
}

/** Read a caught git error's diagnostic text — `execFileSync` attaches the captured `.stderr` (and a generic
 *  `.message`) to the thrown Error. Total: any shape collapses to a string, never a throw. Classification-only
 *  (never enters any computed value, so it stays OFF the KERNEL identity path). */
export function gitErrText(err: unknown): string {
  if (err !== null && typeof err === "object") {
    const e = err as { stderr?: unknown; message?: unknown }
    return [e.stderr, e.message].map((p) => (p == null ? "" : String(p))).join("\n")
  }
  return String(err)
}

/** DETERMINISTIC git-failure signatures — a genuine bad rev / non-git dir / absent path fails IDENTICALLY on
 *  every retry, so retrying only wastes latency. Superset of rev-index's former BAD_REV_RE (adds the non-git
 *  and bad-path shapes); the result is unchanged for every caller (a deterministic failure was always going to
 *  fail-closed — this only reaches that verdict without the retry delay). */
const DETERMINISTIC_RE =
  /invalid reference|unknown revision|not a valid object|bad revision|not a git repository|does not exist|no such|ambiguous argument|unknown option/i

/** Classify a caught git error as DETERMINISTIC (no point retrying) vs transient/unclassified. The git binary
 *  being absent surfaces as `ENOENT` on the error object — also deterministic. Total: never throws. */
export function isDeterministicGitError(err: unknown): boolean {
  if (err !== null && typeof err === "object" && (err as { code?: unknown }).code === "ENOENT") return true
  return DETERMINISTIC_RE.test(gitErrText(err))
}

/** The fixed escalating inter-attempt schedule (ms) — values are NOT read from a clock. */
export const GIT_BACKOFF_MS = [5, 10, 20] as const
/** Bounded attempt cap for the retrying reader (1 initial + 3 retries). */
export const GIT_MAX_ATTEMPTS = 4

/** Clock-FREE synchronous inter-attempt yield — `Atomics.wait` blocks the thread on a never-signaled
 *  `SharedArrayBuffer` word, so NO wall-clock value (`Date.now`/`Math.random`) enters any computation. */
export function gitYieldMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// NOTE (#74 scope, deliberate): no generic `runGitRetrying` wrapper is shipped — rev-index is the ONLY
// contention-prone caller and it needs a STRUCTURAL fresh-worktree-per-attempt retry (a half-created worktree
// wedges a same-path retry), which a command-level retry cannot provide; it reuses the classifier + backoff
// primitives above directly. A generic retrying reader is added only when a real idempotent-and-contended
// caller lands (the other reads fail deterministically; the writes — `notes add`/`clone` — are not blindly
// re-runnable). Shipping the wrapper now would be dead, speculative public surface (bobby WP-74 review).

/** The current HEAD sha (trimmed), or `undefined` on ANY failure (non-git / detached-resolve failure / git
 *  absent) — TOTAL, never throws. The cheap freshness-watermark reader (N11): `rev-parse HEAD` takes NO
 *  worktree lock, so it never touches the `.git/worktrees` contention surface the reconcile oracle does — a
 *  query can honestly ask "has HEAD advanced past the projection?" without paying the oracle's cost. */
export function headSha(repo: string): string | undefined {
  try {
    const s = runGit(repo, ["rev-parse", "HEAD"]).trim()
    return s.length > 0 ? s : undefined
  } catch {
    return undefined
  }
}
