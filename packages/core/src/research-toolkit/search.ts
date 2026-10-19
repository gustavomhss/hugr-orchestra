export * as CodeSearch from "./search"

import { Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "../process"
import { RipgrepBinary } from "../ripgrep/binary"
import type { CodeIndex } from "./code-index/types"

// J3.1-J3.3: lexical search on the bundled ripgrep, through the same AppProcess and RipgrepBinary services as
// Ripgrep.Service (no new spawn site). The host builds the argv; the model supplies only values.

export class Failure extends Schema.TaggedErrorClass<Failure>()("CodeSearch.Failure", {
  reason: Schema.Literals(["pattern_invalid", "index_unavailable", "search_failed"]),
  message: Schema.String,
}) {}

export interface Options {
  readonly cwd: string
  readonly signal?: AbortSignal
  /** HEAD of the worktree, from Git.history.head; the caller owns it so search spawns nothing but ripgrep. */
  readonly commit?: string
  /** Resolves the index symbol containing a line; absent while no index exists. */
  readonly enclosing?: (path: string, line: number) => Effect.Effect<CodeIndex.SymbolRef | undefined>
}

const DEFAULT_LIMIT = 50
const MAX_TEXT = 300
// Capture ceiling for rg's JSON stream; hitting it is reported as an incomplete search, never as a clean zero.
const MAX_STDOUT = 8 * 1024 * 1024

/** `binaries` lists the files that match only when binary files are searched too: the ones the main pass skipped. */
export const argv = (input: CodeIndex.SearchInput, binaries = false) => {
  const limit = (input.limit ?? DEFAULT_LIMIT) + (input.offset ?? 0) + 1
  const mode = input.mode ?? "literal"
  return [
    "--no-config", "--no-messages", "--hidden", "--no-require-git",
    ...(binaries
      ? ["--files-with-matches", "--binary"]
      : [
          "--json", "--stats",
          // Stable order: offset pages must not shift between calls.
          "--sort=path",
          // At most this many hits can ever be returned from one file, so a larger count is wasted output.
          `--max-count=${limit}`,
        ]),
    ...(mode === "regex" ? [] : ["--fixed-strings"]),
    ...(mode === "identifier" ? ["--word-regexp"] : []),
    input.caseSensitive === false ? "--ignore-case" : "--case-sensitive",
    ...(input.context && !binaries ? [`--context=${input.context}`] : []),
    "--glob=!**/.git/**",
    ...(input.paths ?? []).map((glob) => `--glob=${glob.replace(/^(?:\.[\\/])+/u, "")}`),
    // -e keeps a pattern that starts with "-" from being read as an option; the explicit root stops rg reading stdin.
    "-e", input.pattern, "--", ".",
  ]
}

export const run = (input: CodeIndex.SearchInput, options: Options) =>
  Effect.gen(function* () {
    const started = Date.now()
    const process = yield* AppProcess.Service
    const binary = yield* RipgrepBinary.Service
    const command = yield* binary.filepath.pipe(
      Effect.mapError((cause) => new Failure({ reason: "index_unavailable", message: cause.message })),
    )
    const result = yield* process
      .run(ChildProcess.make(command, argv(input), { cwd: options.cwd, extendEnv: true, stdin: "ignore" }), {
        maxOutputBytes: MAX_STDOUT,
        maxErrorBytes: 8 * 1024,
        signal: options.signal,
      })
      .pipe(Effect.mapError((cause) => new Failure({ reason: "search_failed", message: cause.message })))
    const stderr = result.stderr.toString("utf8").trim()
    if (result.exitCode === 2 && /regex parse error|error parsing regex/.test(stderr))
      return yield* new Failure({ reason: "pattern_invalid", message: stderr })
    // Exit 2 with some output is a partial search (unreadable files); it is reported as incomplete below.
    if (result.exitCode > 2) return yield* new Failure({ reason: "search_failed", message: stderr || `ripgrep exited ${result.exitCode}` })

    // ripgrep skips binary files without a trace, so the files that match only as binary come from a second pass.
    const binaryPass = yield* process
      .run(ChildProcess.make(command, argv(input, true), { cwd: options.cwd, extendEnv: true, stdin: "ignore" }), {
        maxOutputBytes: MAX_STDOUT,
        maxErrorBytes: 8 * 1024,
        signal: options.signal,
      })
      .pipe(Effect.mapError((cause) => new Failure({ reason: "search_failed", message: cause.message })))

    const parsed = parse(result.stdout.toString("utf8"), input.context ?? 0)
    const seen = new Set(parsed.matches.map((match) => match.path))
    const binaryFiles = binaryPass.stdout.toString("utf8").split("\n").filter(Boolean).map(normalize)
    const offset = input.offset ?? 0
    const limit = input.limit ?? DEFAULT_LIMIT
    const page = parsed.matches.slice(offset, offset + limit)
    const more = parsed.matches.length > offset + limit
    const matches = options.enclosing
      ? yield* Effect.forEach(page, (match) =>
          options.enclosing!(match.path, match.line).pipe(
            Effect.map((enclosing) => (enclosing ? { ...match, enclosing } : match)),
          ),
        )
      : page
    const incomplete = result.exitCode === 2 || result.stdoutTruncated || (result.outputTruncated ?? false)
    return {
      matches,
      ...(more ? { next: offset + limit } : {}),
      basis: {
        basis: { commit: options.commit ?? "unversioned", shards: [] },
        execution: { op: "code_search", ms: Date.now() - started },
        coverage: {
          documents: parsed.searched,
          skipped: incomplete
            ? [{ path: ".", reason: result.exitCode === 2 ? "ripgrep could not read some paths" : "output ceiling reached" }]
            : [],
          languagesMissing: [],
          opaqueSites: 0,
          // Absence is claimable only from a search that ran to its end; a page cut by limit does not count.
          complete: !incomplete && !more,
          ignoreRespected: true,
          binariesSkipped: binaryFiles.filter((file) => !seen.has(file)).length,
        },
        freshness: "fresh" as const,
        bounds: { limit, truncated: more },
      },
    } satisfies CodeIndex.SearchResult
  })

// The subset of ripgrep's JSON message stream this adapter reads.
type Row = {
  type: string
  data: {
    path?: { text?: string }
    line_number?: number
    lines?: { text?: string; bytes?: string }
    stats?: { searches: number }
  }
}

function parse(stdout: string, context: number) {
  const matches: Array<{ path: string; line: number; text: string; before?: string[]; after?: string[] }> = []
  let searched = 0
  // Context lines of the file being read, kept until the next match claims them as "before".
  let pending: Array<{ line: number; text: string }> = []
  let last: (typeof matches)[number] | undefined
  let file = ""
  for (const row of stdout.split("\n")) {
    if (!row) continue
    const event = JSON.parse(row) as Row
    if (event.type === "summary") searched = event.data.stats?.searches ?? 0
    if (event.type === "begin") {
      file = event.data.path?.text ?? ""
      pending = []
      last = undefined
    }
    if (!file) continue
    const line = event.data.line_number ?? 0
    const text = clip(event.data.lines?.text ?? Buffer.from(event.data.lines?.bytes ?? "", "base64").toString("utf8"))
    if (event.type === "context") {
      if (last && line <= last.line + context) (last.after ??= []).push(text)
      else pending.push({ line, text })
    }
    if (event.type === "match") {
      const before = pending.slice(-context).map((item) => item.text)
      last = { path: normalize(file), line, text, ...(before.length ? { before } : {}) }
      matches.push(last)
      pending = []
    }
  }
  return { matches, searched }
}

const normalize = (file: string) => file.replace(/^(?:\.[\\/])+/u, "").replaceAll("\\", "/")

function clip(line: string) {
  const text = line.replace(/\r?\n$/u, "")
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT).replace(/[\uD800-\uDBFF]$/u, "") + "..." : text
}
