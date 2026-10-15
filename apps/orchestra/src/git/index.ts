import { LayerNode } from "@orchestra/core/effect/layer-node"
import { AppProcess } from "@orchestra/core/process"
import { Duration, Effect, Layer, Context, Option, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"

const cfg = [
  "--no-optional-locks",
  "-c",
  "core.autocrlf=false",
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.longpaths=true",
  "-c",
  "core.symlinks=true",
  "-c",
  "core.quotepath=false",
] as const

const out = (result: { text(): string }) => result.text().trim()
const nuls = (text: string) => text.split("\0").filter(Boolean)
// `@<seconds> +0000` is git's raw date form; a bare number below nine digits is not parsed as epoch seconds.
const epoch = (ms: number) => `@${Math.floor(ms / 1000)} +0000`
const fail = (err: unknown) =>
  ({
    exitCode: 1,
    text: () => "",
    stdout: Buffer.alloc(0),
    stderr: Buffer.from(err instanceof Error ? err.message : String(err)),
    truncated: false,
  }) satisfies Result

export type Kind = "added" | "deleted" | "modified"

export type Base = {
  readonly name: string
  readonly ref: string
}

export type Item = {
  readonly file: string
  readonly code: string
  readonly status: Kind
}

export type Stat = {
  readonly file: string
  readonly additions: number
  readonly deletions: number
}

export type Commit = {
  readonly hash: string
  readonly time: number
  readonly email: string
  readonly subject: string
  readonly files: Stat[]
}

export type Log = {
  readonly commits: Commit[]
  readonly truncated: boolean
}

export interface LogBounds {
  readonly limit: number
  readonly maxOutputBytes: number
  readonly timeout: Duration.Input
}

export interface LogOptions extends LogBounds {
  readonly since: number
  readonly until: number
  readonly merges: boolean
  readonly numstat: boolean
}

export type Patch = {
  readonly text: string
  readonly truncated: boolean
}

export interface PatchOptions {
  readonly context?: number
  readonly maxOutputBytes?: number
}

export interface Result {
  readonly exitCode: number
  readonly text: () => string
  readonly stdout: Buffer
  readonly stderr: Buffer
  readonly truncated: boolean
}

export interface Options {
  readonly cwd: string
  readonly env?: Record<string, string>
  readonly maxOutputBytes?: number
  readonly timeout?: Duration.Input
  readonly stdin?: ChildProcess.CommandInput
}

export interface Interface {
  readonly run: (args: string[], opts: Options) => Effect.Effect<Result>
  readonly branch: (cwd: string) => Effect.Effect<string | undefined>
  readonly prefix: (cwd: string) => Effect.Effect<string>
  readonly defaultBranch: (cwd: string) => Effect.Effect<Base | undefined>
  readonly hasHead: (cwd: string) => Effect.Effect<boolean>
  readonly mergeBase: (cwd: string, base: string, head?: string) => Effect.Effect<string | undefined>
  readonly show: (cwd: string, ref: string, file: string, prefix?: string) => Effect.Effect<string>
  readonly status: (cwd: string) => Effect.Effect<Item[]>
  readonly diff: (cwd: string, ref: string) => Effect.Effect<Item[]>
  readonly stats: (cwd: string, ref: string) => Effect.Effect<Stat[]>
  readonly patch: (cwd: string, ref: string, file: string, options?: PatchOptions) => Effect.Effect<Patch>
  readonly patchAll: (cwd: string, ref: string, options?: PatchOptions) => Effect.Effect<Patch>
  readonly patchUntracked: (cwd: string, file: string, options?: PatchOptions) => Effect.Effect<Patch>
  readonly statUntracked: (cwd: string, file: string) => Effect.Effect<Stat | undefined>
  readonly applyPatch: (cwd: string, patch: string) => Effect.Effect<Result>
  readonly log: (cwd: string, options: LogOptions) => Effect.Effect<Log>
  readonly upstream: (cwd: string, branch: string) => Effect.Effect<string | undefined>
  readonly aheadBehind: (
    cwd: string,
    base: string,
    timeout: Duration.Input,
  ) => Effect.Effect<{ ahead: number; behind: number } | undefined>
}

const numstat = (item: string) => {
  const a = item.indexOf("\t")
  const b = item.indexOf("\t", a + 1)
  if (a === -1 || b === -1) return
  const file = item.slice(b + 1)
  if (!file) return
  const adds = item.slice(0, a)
  const dels = item.slice(a + 1, b)
  const additions = adds === "-" ? 0 : Number.parseInt(adds || "0", 10)
  const deletions = dels === "-" ? 0 : Number.parseInt(dels || "0", 10)
  return {
    file,
    additions: Number.isFinite(additions) ? additions : 0,
    deletions: Number.isFinite(deletions) ? deletions : 0,
  } satisfies Stat
}

// `git log -z` emits each commit header as one NUL-terminated token and each numstat
// row as another, so tokens that open with the record separator start a new commit.
const parseLogToken = (list: Commit[], token: string) => {
  const item = token.startsWith("\n") ? token.slice(1) : token
  if (item.startsWith("\x1e")) {
    const fields = item.slice(1).split("\x1f")
    list.push({
      hash: fields[0] ?? "",
      time: Number(fields[1]) * 1000,
      email: fields[2] ?? "",
      subject: fields.slice(3).join("\x1f"),
      files: [],
    })
    return
  }
  const stat = numstat(item)
  if (stat) list.at(-1)?.files.push(stat)
}

// Streams `git log -z` output so a scan cut short by its time or byte budget still
// returns every commit it received in full instead of nothing.
export const collectLog = Effect.fnUntraced(function* (stdout: Stream.Stream<Uint8Array, unknown>, bounds: LogBounds) {
  const decoder = new TextDecoder()
  const state = { commits: [] as Commit[], pending: "", bytes: 0 }
  const feed = (text: string) => {
    const tokens = (state.pending + text).split("\0")
    state.pending = tokens.pop() ?? ""
    tokens.forEach((token) => parseLogToken(state.commits, token))
  }
  const finished = yield* stdout.pipe(
    Stream.takeWhile(() => state.bytes <= bounds.maxOutputBytes),
    Stream.runForEach((chunk) =>
      Effect.sync(() => {
        // Parse only bytes inside the budget: one chunk can carry whole commits past the cap.
        const room = Math.max(bounds.maxOutputBytes - state.bytes, 0)
        state.bytes += chunk.length
        feed(decoder.decode(chunk.length > room ? chunk.subarray(0, room) : chunk, { stream: true }))
      }),
    ),
    Effect.timeoutOption(bounds.timeout),
    Effect.map(Option.isSome),
    Effect.catch(() => Effect.succeed(false)),
  )
  const complete = finished && state.bytes <= bounds.maxOutputBytes
  if (complete) feed(decoder.decode() + "\0")
  // An interrupted scan may have stopped inside the last commit's numstat rows.
  const received = complete ? state.commits : state.commits.slice(0, -1)
  return {
    commits: received.slice(0, bounds.limit),
    truncated: !complete || received.length > bounds.limit,
  } satisfies Log
})

const kind = (code: string): Kind => {
  if (code === "??") return "added"
  if (code.includes("U")) return "modified"
  if (code.includes("A") && !code.includes("D")) return "added"
  if (code.includes("D") && !code.includes("A")) return "deleted"
  return "modified"
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/Git") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const appProcess = yield* AppProcess.Service
    const encoder = new TextEncoder()
    const stdin = (text: string) => Stream.make(encoder.encode(text))

    const run = Effect.fn("Git.run")(
      function* (args: string[], opts: Options) {
        const result = yield* appProcess.run(
          ChildProcess.make("git", [...cfg, ...args], {
            cwd: opts.cwd,
            env: opts.env,
            extendEnv: true,
            stdin: opts.stdin ?? "ignore",
            stdout: "pipe",
            stderr: "pipe",
          }),
          { maxOutputBytes: opts.maxOutputBytes, timeout: opts.timeout },
        )
        return {
          exitCode: result.exitCode,
          text: () => result.stdout.toString("utf8"),
          stdout: result.stdout,
          stderr: result.stderr,
          truncated: result.stdoutTruncated || result.stderrTruncated,
        } satisfies Result
      },
      Effect.catch((err) => Effect.succeed(fail(err))),
    )

    const text = Effect.fn("Git.text")(function* (args: string[], opts: Options) {
      return (yield* run(args, opts)).text()
    })

    const lines = Effect.fn("Git.lines")(function* (args: string[], opts: Options) {
      return (yield* text(args, opts))
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    })

    const refs = Effect.fnUntraced(function* (cwd: string) {
      return yield* lines(["for-each-ref", "--format=%(refname:short)", "refs/heads"], { cwd })
    })

    const configured = Effect.fnUntraced(function* (cwd: string, list: string[]) {
      const result = yield* run(["config", "init.defaultBranch"], { cwd })
      const name = out(result)
      if (!name || !list.includes(name)) return
      return { name, ref: name } satisfies Base
    })

    const primary = Effect.fnUntraced(function* (cwd: string) {
      const list = yield* lines(["remote"], { cwd })
      if (list.includes("origin")) return "origin"
      if (list.length === 1) return list[0]
      if (list.includes("upstream")) return "upstream"
      return list[0]
    })

    const branch = Effect.fn("Git.branch")(function* (cwd: string) {
      const result = yield* run(["symbolic-ref", "--quiet", "--short", "HEAD"], { cwd })
      if (result.exitCode !== 0) return
      const text = out(result)
      return text || undefined
    })

    const prefix = Effect.fn("Git.prefix")(function* (cwd: string) {
      const result = yield* run(["rev-parse", "--show-prefix"], { cwd })
      if (result.exitCode !== 0) return ""
      return out(result)
    })

    const defaultBranch = Effect.fn("Git.defaultBranch")(function* (cwd: string) {
      const remote = yield* primary(cwd)
      if (remote) {
        const head = yield* run(["symbolic-ref", `refs/remotes/${remote}/HEAD`], { cwd })
        if (head.exitCode === 0) {
          const ref = out(head).replace(/^refs\/remotes\//, "")
          const name = ref.startsWith(`${remote}/`) ? ref.slice(`${remote}/`.length) : ""
          if (name) return { name, ref } satisfies Base
        }
      }

      const list = yield* refs(cwd)
      const next = yield* configured(cwd, list)
      if (next) return next
      if (list.includes("main")) return { name: "main", ref: "main" } satisfies Base
      if (list.includes("master")) return { name: "master", ref: "master" } satisfies Base
    })

    const hasHead = Effect.fn("Git.hasHead")(function* (cwd: string) {
      const result = yield* run(["rev-parse", "--verify", "HEAD"], { cwd })
      return result.exitCode === 0
    })

    const mergeBase = Effect.fn("Git.mergeBase")(function* (cwd: string, base: string, head = "HEAD") {
      const result = yield* run(["merge-base", base, head], { cwd })
      if (result.exitCode !== 0) return
      const text = out(result)
      return text || undefined
    })

    const show = Effect.fn("Git.show")(function* (cwd: string, ref: string, file: string, prefix = "") {
      const target = prefix ? `${prefix}${file}` : file
      const result = yield* run(["show", `${ref}:${target}`], { cwd })
      if (result.exitCode !== 0) return ""
      if (result.stdout.includes(0)) return ""
      return result.text()
    })

    const status = Effect.fn("Git.status")(function* (cwd: string) {
      return nuls(
        yield* text(["status", "--porcelain=v1", "--untracked-files=all", "--no-renames", "-z", "--", "."], {
          cwd,
        }),
      ).flatMap((item) => {
        const file = item.slice(3)
        if (!file) return []
        const code = item.slice(0, 2)
        return [{ file, code, status: kind(code) } satisfies Item]
      })
    })

    const diff = Effect.fn("Git.diff")(function* (cwd: string, ref: string) {
      const list = nuls(
        yield* text(["diff", "--no-ext-diff", "--no-renames", "--name-status", "-z", ref, "--", "."], { cwd }),
      )
      return list.flatMap((code, idx) => {
        if (idx % 2 !== 0) return []
        const file = list[idx + 1]
        if (!code || !file) return []
        return [{ file, code, status: kind(code) } satisfies Item]
      })
    })

    const stats = Effect.fn("Git.stats")(function* (cwd: string, ref: string) {
      return nuls(
        yield* text(["diff", "--no-ext-diff", "--no-renames", "--numstat", "-z", ref, "--", "."], { cwd }),
      ).flatMap((item) => {
        const stat = numstat(item)
        return stat ? [stat] : []
      })
    })

    const patch = Effect.fn("Git.patch")(function* (cwd: string, ref: string, file: string, options?: PatchOptions) {
      const result = yield* run(
        ["diff", "--patch", "--no-ext-diff", "--no-renames", `--unified=${options?.context ?? 3}`, ref, "--", file],
        { cwd, maxOutputBytes: options?.maxOutputBytes },
      )
      return { text: result.truncated ? "" : result.text(), truncated: result.truncated } satisfies Patch
    })

    const patchAll = Effect.fn("Git.patchAll")(function* (cwd: string, ref: string, options?: PatchOptions) {
      const result = yield* run(
        ["diff", "--patch", "--no-ext-diff", "--no-renames", `--unified=${options?.context ?? 3}`, ref, "--", "."],
        { cwd, maxOutputBytes: options?.maxOutputBytes },
      )
      return { text: result.text(), truncated: result.truncated } satisfies Patch
    })

    const patchUntracked = Effect.fn("Git.patchUntracked")(function* (
      cwd: string,
      file: string,
      options?: PatchOptions,
    ) {
      const result = yield* run(
        [
          "diff",
          "--no-index",
          "--patch",
          "--no-ext-diff",
          "--no-renames",
          `--unified=${options?.context ?? 3}`,
          "--",
          "/dev/null",
          file,
        ],
        { cwd, maxOutputBytes: options?.maxOutputBytes },
      )
      return { text: result.truncated ? "" : result.text(), truncated: result.truncated } satisfies Patch
    })

    const statUntracked = Effect.fn("Git.statUntracked")(function* (cwd: string, file: string) {
      const result = yield* run(["diff", "--no-index", "--numstat", "--", "/dev/null", file], {
        cwd,
        maxOutputBytes: 4096,
      })

      if (result.truncated) return
      const text = result.text()

      const parts = text.split("\t")
      if (parts.length < 2) return

      const additions = parts[0] === "-" ? 0 : Number.parseInt(parts[0] || "0", 10)
      const deletions = parts[1] === "-" ? 0 : Number.parseInt(parts[1] || "0", 10)
      return {
        file,
        additions: Number.isFinite(additions) ? additions : 0,
        deletions: Number.isFinite(deletions) ? deletions : 0,
      } satisfies Stat
    })

    const applyPatch = Effect.fn("Git.applyPatch")(function* (cwd: string, patch: string) {
      return yield* run(["apply", "-"], { cwd, stdin: stdin(patch) })
    })

    const log = Effect.fn("Git.log")(function* (cwd: string, options: LogOptions) {
      const args = [
        "log",
        options.merges ? "--merges" : "--no-merges",
        ...(options.numstat ? ["--numstat", "--no-renames", "--no-ext-diff"] : []),
        "--no-color",
        "--no-show-signature",
        "-z",
        `--max-count=${options.limit + 1}`,
        `--since=${epoch(options.since)}`,
        `--until=${epoch(options.until)}`,
        "--format=%x1e%h%x1f%at%x1f%ae%x1f%s",
        "HEAD",
        "--",
      ]
      return yield* Effect.gen(function* () {
        const handle = yield* appProcess.spawn(
          ChildProcess.make("git", [...cfg, ...args], {
            cwd,
            extendEnv: true,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "ignore",
          }),
        )
        const result = yield* collectLog(handle.stdout, options)
        if (result.truncated) return result
        // A scan that git itself failed is reported as incomplete rather than as an empty window.
        return (yield* handle.exitCode) === 0 ? result : { commits: result.commits, truncated: true }
      }).pipe(
        Effect.scoped,
        Effect.catch(() => Effect.succeed({ commits: [], truncated: true } satisfies Log)),
      )
    })

    const upstream = Effect.fn("Git.upstream")(function* (cwd: string, branch: string) {
      const result = yield* run(["rev-parse", "--verify", "--quiet", "--symbolic-full-name", `${branch}@{upstream}`], {
        cwd,
      })
      if (result.exitCode !== 0) return
      return out(result) || undefined
    })

    const aheadBehind = Effect.fn("Git.aheadBehind")(function* (cwd: string, base: string, timeout: Duration.Input) {
      const result = yield* run(["rev-list", "--left-right", "--count", `${base}...HEAD`, "--"], { cwd, timeout })
      if (result.exitCode !== 0) return
      const counts = out(result)
        .split(/\s+/)
        .map((item) => Number.parseInt(item, 10))
      if (counts.length !== 2 || !counts.every(Number.isFinite)) return
      return { behind: counts[0], ahead: counts[1] }
    })

    return Service.of({
      run,
      branch,
      prefix,
      defaultBranch,
      hasHead,
      mergeBase,
      show,
      status,
      diff,
      stats,
      patch,
      patchAll,
      patchUntracked,
      statUntracked,
      applyPatch,
      log,
      upstream,
      aheadBehind,
    })
  }),
)

export const node = LayerNode.make({ service: Service, layer: layer, deps: [AppProcess.node] })

export * as Git from "."
