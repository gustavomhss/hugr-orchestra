// Command failure vocabulary and interpretation; process creation stays in llm.ts.

/** A failed invocation is never a model abstention. */
export type ModelFailure = "not-found" | "timeout" | "nonzero-exit"

export class ModelCommandError extends Error {
  constructor(
    readonly reason: ModelFailure,
    message: string,
  ) {
    super(message)
    this.name = "ModelCommandError"
  }
}

/** Operator-supplied argv, never a command sourced from a repository. */
export interface ModelCommand {
  readonly cmd: string
  readonly args: readonly string[]
}

/**
 * A child that FINISHED CLEANLY but stopped reading stdin before we finished writing the prompt (`EPIPE`
 * with `status === 0`). `execFileSync` throws on the failed *write*, yet the run succeeded and the real
 * stdout is carried on the thrown error — measured: `{ code:'EPIPE', status:0, stdout:'OUT' }`.
 *
 * THE TRADEOFF, STATED. Prompts here are whole source subtrees, so the write is long and the window is
 * wide: any model command that reads a prefix and exits — or that any wrapper truncates — would otherwise
 * be reported as a hard failure on a run that actually produced a claim. This was found as a load-dependent
 * flake in the full suite (an idle-box probe of 300 runs did NOT reproduce it). But salvaging is NOT free
 * and must not be sold as pure correctness: A CLAIM MAY THEREFORE BE PRODUCED FROM A PARTIALLY DELIVERED
 * PROMPT. The child provably did not read all of it — this suite's own green case salvages a claim from a
 * command that read ZERO bytes of an 8 MiB prompt — so the claim may rest on source the model never saw.
 * That is admissible here for ONE reason, and it is the backstop the whole design leans on: what a proposer
 * returns is a PROPOSAL, and the admission gate re-derives it mechanically against the anchored bytes
 * (GEN-4/12). A claim built on an unread prefix fails that gate exactly as any other unfounded claim does.
 * This is a third adapter rule alongside "empty ⇒ abstention" and "non-zero ⇒ error", and it is written
 * into ADR-0011 Decision 1 rather than living only here.
 *
 * `null` ⇒ not salvageable, let the caller throw. `status` must be EXACTLY `0`: `null` means the child was
 * killed by a signal, and a non-zero status is a genuine failure — neither may be salvaged. Returns the raw
 * stdout BUFFER (stdout is captured with no `encoding`, so the thrown error carries it as a Buffer) — the
 * salvaged bytes pass through the same #195c sanity gate as the happy path.
 */
export function salvageEarlyExit(e: unknown): Buffer | null {
  const err = e as { code?: unknown; status?: unknown; stdout?: unknown } | null
  if (err?.code !== "EPIPE" || err.status !== 0) return null
  return Buffer.isBuffer(err.stdout) ? err.stdout : Buffer.alloc(0)
}

/** Missing command and wall-clock expiry remain distinct from a non-zero exit. */
export function classifyModelFailure(e: unknown): ModelFailure {
  const code = (e as { code?: unknown } | null)?.code
  if (code === "ENOENT") return "not-found"
  if (code === "ETIMEDOUT" || (e as { signal?: unknown } | null)?.signal === "SIGTERM") return "timeout"
  return "nonzero-exit"
}

/** Name the actual command and preserve its captured diagnostic without rerunning it. */
export function describeModelFailure(command: ModelCommand, e: unknown): string {
  const shown = [command.cmd, ...command.args].join(" ")
  const stderr = (e as { stderr?: unknown } | null)?.stderr
  const detail = typeof stderr === "string" && stderr.trim() !== "" ? stderr.trim() : String((e as Error)?.message ?? e)
  return `the configured model command failed — \`${shown}\`: ${detail}`
}
