export * as ReviewHistory from "./history"

import path from "path"
import { realpath } from "fs/promises"
import { Effect, Schema } from "effect"
import { ResearchProcess } from "../research-toolkit/process"

// K6 review_history: read-only git history for the review seat. The host owns the binary and every flag; the model
// supplies only values (path, range, pattern, rev), each refused when it could read as an option. Runs on the host
// like the research seat's git reads, through ResearchProcess (AppProcess, omni under its flag).

export const Input = Schema.Struct({
  op: Schema.Literals(["log", "blame", "pickaxe", "show"]),
  path: Schema.optional(Schema.String),
  range: Schema.optional(Schema.String),
  pattern: Schema.optional(Schema.String),
  rev: Schema.optional(Schema.String),
  /** Pickaxe only: `-G` (regex over the diff text) instead of `-S` (change in occurrence count). */
  regex: Schema.optional(Schema.Boolean),
})
export type Input = typeof Input.Type

export type Context = {
  /** The repository the review reads; every path resolves inside it. */
  readonly repository: string
  readonly executionSessionID: string
}

export type Result = {
  readonly historyID: string
  /** Capped text for the model. */
  readonly text: string
  /** The citation the caller retains `raw` under. */
  readonly uri: string
  readonly argv: ReadonlyArray<string>
  /** The captured stdout, at most Limits.rawBytes; `truncated` when git produced more. */
  readonly raw: string
  readonly truncated: boolean
}

export class HistoryError extends Schema.TaggedErrorClass<HistoryError>()("ReviewHistory.Error", {
  code: Schema.Literals(["refused", "failed"]),
  reason: Schema.String,
}) {}

export const uri = (executionSessionID: string, historyID: string) => `history:${executionSessionID}/${historyID}`

export const Limits = { textBytes: 32 * 1024, rawBytes: 4 * 1024 * 1024, commits: 200, timeoutMs: 30_000 } as const

// The value fields each op takes; any other field present is refused.
const FIELDS: Record<Input["op"], ReadonlyArray<string>> = {
  log: ["path", "range", "rev"],
  blame: ["path", "rev"],
  pickaxe: ["pattern", "path", "range", "rev", "regex"],
  show: ["rev", "path"],
}

const COMMON = ["--no-color", "--no-ext-diff", "--no-textconv"]
const LOG = ["log", ...COMMON, "--no-show-signature", "--format=%H %ad %an%n    %s", "--date=short", `--max-count=${Limits.commits}`]

export const run = Effect.fn("ReviewHistory.run")(function* (raw: unknown, context: Context) {
  const input = yield* Schema.decodeUnknownEffect(Input)(raw, { onExcessProperty: "error" }).pipe(
    Effect.mapError((error) => refused(`invalid input: ${error.message}`)),
  )
  const extra = (["path", "range", "pattern", "rev", "regex"] as const).filter((field) => input[field] !== undefined && !FIELDS[input.op].includes(field))
  if (extra.length) return yield* refused(`${input.op} does not take ${extra.join(", ")}`)
  if (input.range !== undefined && input.rev !== undefined) return yield* refused("give range or rev, not both")
  const root = yield* Effect.promise(() => realpath(context.repository).catch(() => undefined))
  if (!root) return yield* refused("repository not found")
  const revs = yield* Effect.forEach([input.range, input.rev].filter((value) => value !== undefined), (value) => argument(value, "rev"))
  const paths = input.path === undefined ? [] : ["--", yield* resolve(root, input.path)]
  const args = yield* template(input, revs, paths)
  const argv = [
    "--no-pager", "--literal-pathspecs", "-C", root,
    // No transport, and none of the helpers the repository's own config could name.
    "-c", "protocol.allow=never", "-c", "core.fsmonitor=false", "-c", "diff.external=", "-c", "core.hooksPath=/dev/null",
    ...args,
  ]
  const outcome = yield* ResearchProcess.run({
    command: "git", args: argv, cwd: root, env: { ...ResearchProcess.environment(), GIT_NO_LAZY_FETCH: "1" },
    timeoutMs: Limits.timeoutMs, maxBytes: Limits.rawBytes,
  })
  if (outcome.timedOut) return yield* new HistoryError({ code: "failed", reason: "timed out" })
  if (outcome.failure !== undefined) return yield* new HistoryError({ code: "failed", reason: outcome.failure })
  // An overflow stopped git at the cap; what it wrote up to there is kept and marked truncated.
  if (!outcome.overflow && outcome.exitCode !== 0)
    return yield* new HistoryError({ code: "failed", reason: outcome.stderr.data.toString("utf8").trim().slice(0, 2000) || `git exited ${outcome.exitCode}` })
  const historyID = Bun.randomUUIDv7()
  const stdout = outcome.stdout.data.toString("utf8")
  const truncated = outcome.overflow || outcome.stdout.truncated
  return {
    historyID,
    text: text(stdout, truncated, uri(context.executionSessionID, historyID)),
    uri: uri(context.executionSessionID, historyID),
    argv: ["git", ...argv],
    raw: stdout,
    truncated,
  } satisfies Result
})

const template = Effect.fnUntraced(function* (input: Input, revs: ReadonlyArray<string>, paths: ReadonlyArray<string>) {
  if (input.op === "log") return [...LOG, "--end-of-options", ...revs, ...paths]
  if (input.op === "blame") {
    if (!paths.length) return yield* refused("blame needs a path")
    return ["blame", "--no-progress", "--date=short", ...revs, ...paths]
  }
  if (input.op === "pickaxe") {
    if (input.pattern === undefined) return yield* refused("pickaxe needs a pattern")
    // The attached form keeps the pattern one argument that git cannot read as another flag.
    const pattern = yield* argument(input.pattern, "pattern")
    return [...LOG, `${input.regex ? "-G" : "-S"}${pattern}`, "--end-of-options", ...revs, ...paths]
  }
  return ["show", ...COMMON, "--no-show-signature", "--format=fuller", "--end-of-options", ...(revs.length ? revs : ["HEAD"]), ...paths]
})

/** A value that reaches git as an argument: never empty, never option-like, no control characters. */
function argument(value: string, field: string) {
  if (!value) return Effect.fail(refused(`${field} is empty`))
  if (value.startsWith("-")) return Effect.fail(refused(`${field} looks like an option`))
  if (/[\u0000-\u001f\u007f]/u.test(value)) return Effect.fail(refused(`${field} holds control characters`))
  return Effect.succeed(value)
}

/** A repository-relative path in git's form; refused when it leaves the repository, also through a symlink. */
const resolve = Effect.fnUntraced(function* (root: string, value: string) {
  const absolute = path.resolve(root, yield* argument(value, "path"))
  const relative = path.relative(root, absolute)
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return yield* refused("path is outside the repository")
  const real = yield* Effect.promise(() => realpath(absolute).catch(() => undefined))
  if (real !== undefined && real !== root && !real.startsWith(root + path.sep)) return yield* refused("path is outside the repository")
  if (relative.split(path.sep).includes(".git")) return yield* refused("path is inside the git directory")
  return relative === "" ? "." : relative.split(path.sep).join("/")
})

function text(stdout: string, truncated: boolean, citation: string) {
  const bytes = Buffer.byteLength(stdout)
  if (bytes <= Limits.textBytes && !truncated) return stdout
  const shown = Buffer.from(stdout).subarray(0, Limits.textBytes).toString("utf8").replace(/�$/u, "")
  return `${shown}\n[truncated: ${Buffer.byteLength(shown)} of ${truncated ? "more than " : ""}${bytes} bytes shown; full output at ${citation}]`
}

const refused = (reason: string) => new HistoryError({ code: "refused", reason })
