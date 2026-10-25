import path from "node:path"
import { Effect, Option } from "effect"
import type { GitCli } from "@orchestra/core/git-cli"
import { LocationMutation } from "@orchestra/core/location-mutation"
import type { ResearchRecords } from "@orchestra/core/research/records"
import { Tool } from "@orchestra/core/tool/tool"
import { Research } from "@orchestra/schema/research"
import type { Services } from "./research"
import { denied } from "./research-denied"

const FULL_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
// A range diff gates every changed file it would project, so a path set that touches more is refused, not sampled.
export const COMPARE_FILE_LIMIT = 100

export type Retain = (capture: ResearchRecords.CaptureInput) => Effect.Effect<Research.SourceReceipt, Tool.Failure>

/**
 * Git state in the bound worktree (V1 `research/history.ts`): the received Git output, then its structured projection
 * derived from it. Every path it names or projects passes the read gates a file capture passes.
 */
export const history = Effect.fn("MaestroResearchTools.history")(function* (
  services: Services,
  binding: Research.Binding,
  context: Tool.Context,
  input: Research.HistoryInput,
  retain: Retain,
) {
  if (input.operation === "blame" && input.end !== undefined && input.end < (input.start ?? 1))
    return yield* denied(new Research.Error({ code: "reference_invalid", message: "Blame line range does not exist" }))
  if (input.operation === "search" && input.message === undefined && input.path === undefined)
    return yield* denied(new Research.Error({ code: "reference_invalid", message: "Commit search requires a message substring, a path, or both" }))
  const root = yield* services.fs.realPath(binding.worktree).pipe(
    Effect.mapError(() => new Tool.Failure({ message: "Research worktree is unavailable" })),
  )
  const requested = "paths" in input ? input.paths : "path" in input && input.path !== undefined ? [input.path] : []
  const relatives = requested.map((entry) => path.relative(root, path.resolve(binding.directory, entry)).replaceAll("\\", "/"))
  if (relatives.some((relative) => !relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)))
    return yield* denied(new Research.Error({ code: "binding_mismatch", message: "Historical path must address one file inside the bound worktree" }))
  yield* gate(services, context, root, relatives)
  // A redirected caller environment (a VS Code terminal sets GIT_ASKPASS, a hook sets GIT_DIR) never reaches Git (J2.14).
  const exec = { cwd: root, env: environment(), extendEnv: false }
  const actual = yield* services.git.run(["rev-parse", "--show-toplevel"], { ...exec, maxOutputBytes: 8192, timeout: "10 seconds" })
  const top = actual.exitCode === 0 && !actual.truncated
    ? yield* services.fs.realPath(actual.text().trim()).pipe(Effect.orElseSucceed(() => undefined))
    : undefined
  if (top !== root)
    return yield* denied(new Research.Error({ code: "binding_mismatch", message: "Git repository differs from native research worktree" }))
  const resolve = (revision: string) =>
    services.git
      .run(["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], { ...exec, maxOutputBytes: 1024, timeout: "10 seconds" })
      .pipe(
        Effect.flatMap((head) =>
          head.exitCode !== 0 || head.truncated || !FULL_HASH.test(head.text().trim())
            ? denied(new Research.Error({ code: "source_unavailable", message: "Requested historical commit is unavailable" }))
            : Effect.succeed(head.text().trim()),
        ),
      )
  const origin = (operation: string, revision?: string) =>
    ({
      kind: "tool-output",
      uri: `native:${context.sessionID}/${context.assistantMessageID}/${context.toolCallID}/git-${operation}`,
      ...(revision ? { revision } : {}),
    }) as const
  if (input.operation === "status") {
    const head = yield* resolve("HEAD").pipe(Effect.option)
    const result = yield* services.git.run(
      ["--no-pager", "status", "--porcelain=v2", "--branch", "-z", "--untracked-files=normal"],
      { ...exec, maxOutputBytes: Research.Limits.sourceBytes, timeout: "30 seconds" },
    )
    if (result.exitCode !== 0)
      return yield* denied(new Research.Error({ code: "source_unavailable", message: "Working tree status failed; no empty successful source was admitted" }))
    if (result.truncated)
      return yield* denied(new Research.Error({ code: "over_cap", message: "Working tree status exceeds the capture bound" }))
    const where = origin("status", Option.getOrUndefined(head))
    const received = yield* retain({ origin: where, representation: "received", mediaType: "text/plain", content: result.stdout, complete: true })
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(result.stdout),
      catch: () => new Tool.Failure({ message: "Research denied: unsupported: Working tree status is not lossless UTF-8 text" }),
    })
    const parsed = porcelain(text)
    if (!parsed)
      return yield* denied(new Research.Error({ code: "publication_uncertain", message: "Working tree status projection is malformed" }))
    const content = JSON.stringify({
      operation: "status", head: Option.getOrNull(head), ...parsed, complete: true,
      scope: "working-tree-status", dirtyWorkingTreeObserved: true,
    })
    const receipt = yield* retain({ origin: where, representation: "structured-json", mediaType: "application/json", content, complete: true,
      derivedFrom: received.ref, transformation: "native-git-status-v1" })
    return { receipt, content }
  }
  const revision = yield* resolve(input.operation === "resolve" ? input.ref : input.revision ?? "HEAD")
  const base = input.operation === "compare" || input.operation === "diff" ? yield* resolve(input.base) : undefined
  const shallow = yield* services.git.run(["rev-parse", "--is-shallow-repository"], { ...exec, maxOutputBytes: 1024, timeout: "10 seconds" })
  if (shallow.exitCode !== 0 || shallow.truncated || !["true", "false"].includes(shallow.text().trim()))
    return yield* denied(new Research.Error({ code: "publication_uncertain", message: "Historical repository coverage is unavailable" }))
  const changed = input.operation === "compare" && base ? yield* changedFiles(services, exec, base, revision, relatives) : relatives
  if (input.operation === "compare") yield* gate(services, context, root, changed)
  // An empty changed set keeps the requested pathspecs: an empty pathspec would widen the query to the whole tree.
  const literal = (changed.length > 0 ? changed : relatives).map((relative) => `:(literal)${relative}`)
  const limit = input.operation === "log" || input.operation === "search" ? input.limit ?? 20 : 0
  const result = yield* services.git.run(
    input.operation === "resolve" ? ["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`]
      : input.operation === "log"
      ? ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H", `--max-count=${limit + 1}`, revision, "--", ...literal]
      : input.operation === "show" ? ["--no-pager", "show", "--no-ext-diff", "--no-textconv", `${revision}:${relatives[0]}`]
      : input.operation === "diff" ? ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", base ?? input.base, revision, "--", ...literal]
      : input.operation === "blame" ? ["--no-pager", "blame", "--porcelain", "--no-progress",
        ...(input.start !== undefined || input.end !== undefined ? [`-L${input.start ?? 1},${input.end ?? ""}`] : []), revision, "--", relatives[0]]
      : input.operation === "compare" ? ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames",
        ...(input.stat ? ["--numstat", "-z"] : ["--unified=3"]), base ?? input.base, revision, "--", ...literal]
      : ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H%x00%at%x00%s", `--max-count=${limit + 1}`,
        ...(input.message === undefined ? [] : ["--fixed-strings", "--regexp-ignore-case", `--grep=${input.message}`]), revision, "--", ...literal],
    { ...exec, maxOutputBytes: Research.Limits.sourceBytes, timeout: "30 seconds" },
  )
  if (result.exitCode !== 0)
    return yield* denied(new Research.Error({ code: "source_unavailable", message: "Historical query failed; no empty successful source was admitted" }))
  const where = origin(input.operation, revision)
  const received = yield* retain({ origin: where, representation: "received", mediaType: "text/plain", content: result.stdout, complete: !result.truncated })
  // A byte-bounded capture may stop inside a record or a UTF-8 scalar; project only whole records.
  const whole = result.truncated
    ? result.stdout.subarray(0, result.stdout.lastIndexOf(input.operation === "compare" && input.stat ? 0 : 10) + 1)
    : result.stdout
  const text = yield* Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(whole),
    catch: () => new Tool.Failure({ message: "Research denied: unsupported: Historical output is not lossless UTF-8 text" }),
  })
  const projection = project(input, text, limit)
  if (!projection)
    return yield* denied(new Research.Error({ code: "publication_uncertain", message: "Historical commit projection is malformed" }))
  const complete = !result.truncated && (["compare", "diff", "show", "resolve"].includes(input.operation)
    || (shallow.text().trim() === "false" && projection.count <= limit))
  const content = JSON.stringify({
    operation: input.operation, ...(input.operation === "compare" ? { paths: relatives, files: changed, stat: input.stat === true }
      : relatives.length > 0 ? { path: relatives[0] } : {}),
    revision, ...(base ? { base } : {}), ...(input.operation === "search" && input.message !== undefined ? { message: input.message } : {}),
    complete, ...projection.fields,
    scope: "committed-history-only", shallow: shallow.text().trim() === "true", dirtyWorkingTreeObserved: false,
  })
  const receipt = yield* retain({ origin: where, representation: "structured-json", mediaType: "application/json", content, complete,
    derivedFrom: received.ref, transformation: "native-git-history-v1" })
  // The output is the projection itself, so the seat sees the commits or lines it retained without a research_view.
  return { receipt, content }
})

// Every worktree path a history query names or projects passes the read gates a file capture passes; none names the root.
export const gate = Effect.fn("MaestroResearchTools.gate")(function* (services: Services, context: Tool.Context, root: string, relatives: string[]) {
  const source = { type: "tool" as const, messageID: context.assistantMessageID, callID: context.toolCallID }
  const targets = yield* Effect.forEach(relatives.length > 0 ? relatives : ["."], (relative) =>
    services.mutation.resolve({ path: path.join(root, relative), kind: "directory" }).pipe(
      Effect.mapError(() => new Tool.Failure({ message: `Unable to read ${relative}` })),
    ),
  )
  yield* Effect.forEach(
    targets.flatMap((target) => (target.externalDirectory ? [target.externalDirectory] : [])),
    (external) =>
      services.permission
        .assert({ ...LocationMutation.externalDirectoryPermission(external), sessionID: context.sessionID, agent: context.agent, source })
        .pipe(Effect.mapError((error) => new Tool.Failure({ message: "Historical path was not permitted", error }))),
    { discard: true },
  )
  yield* services.permission
    .assert({
      action: "read",
      resources: targets.map((target) => target.resource),
      save: ["*"],
      sessionID: context.sessionID,
      agent: context.agent,
      source,
    })
    .pipe(Effect.mapError((error) => new Tool.Failure({ message: "Historical path was not permitted", error })))
})

/**
 * The caller environment without GIT_*, NODE_OPTIONS or NODE_PATH, and with no global or system config, prompt or
 * optional lock (J2.14, as modules/maestro/arsenal/src/engine/process.ts).
 */
export function environment(source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined &&
      !entry[0].toUpperCase().startsWith("GIT_") && !["NODE_OPTIONS", "NODE_PATH"].includes(entry[0].toUpperCase()))),
    GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0",
  }
}

// Porcelain v2 -z: NUL-terminated headers and entries; a rename entry ("2") is followed by its original path.
export function porcelain(text: string) {
  const tokens = text.split("\0")
  if (tokens.pop() !== "") return
  const state = { branch: null as string | null, skip: false, malformed: false }
  const dirty = tokens.flatMap((token) => {
    if (state.skip) {
      state.skip = false
      return []
    }
    if (token.startsWith("# ")) {
      const head = /^# branch\.head (.+)$/.exec(token)
      if (head) state.branch = head[1] === "(detached)" ? null : head[1]
      return []
    }
    const entry = /^(?:1 (\S\S)(?: \S+){6}|2 (\S\S)(?: \S+){7}|u (\S\S)(?: \S+){8}|(\?)) (.+)$/s.exec(token)
    if (!entry) {
      state.malformed = true
      return []
    }
    if (token.startsWith("2 ")) state.skip = true
    return [{ path: entry[5], status: entry[1] ?? entry[2] ?? entry[3] ?? "??" }]
  })
  if (state.malformed || state.skip) return
  return { branch: state.branch, dirty }
}

export const changedFiles = Effect.fn("MaestroResearchTools.changedFiles")(function* (
  services: Services,
  exec: GitCli.Options,
  base: string,
  revision: string,
  relatives: string[],
) {
  const names = yield* services.git.run(
    ["--no-pager", "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, revision, "--",
      ...relatives.map((relative) => `:(literal)${relative}`)],
    { ...exec, maxOutputBytes: 1024 * 1024, timeout: "30 seconds" },
  )
  if (names.exitCode !== 0 || names.truncated)
    return yield* denied(new Research.Error({ code: "source_unavailable", message: "Historical range file set is unavailable" }))
  const files = names.text().split("\0").filter(Boolean)
  if (files.length > COMPARE_FILE_LIMIT)
    return yield* denied(new Research.Error({ code: "over_cap", message: `Range diff touches ${files.length} files; narrow the path set to at most ${COMPARE_FILE_LIMIT}` }))
  return files
})

export function project(input: Research.HistoryInput, text: string, limit: number) {
  if (input.operation === "resolve") {
    const commit = text.trim()
    if (!FULL_HASH.test(commit)) return
    return { count: 0, fields: { ref: input.ref, commit } }
  }
  if (input.operation === "log") {
    const commits = text.split(/\r?\n/).filter(Boolean)
    if (commits.some((commit) => !FULL_HASH.test(commit))) return
    return { count: commits.length, fields: { commits: commits.slice(0, limit), limit } }
  }
  if (input.operation === "search") {
    const commits = text.split("\n").filter(Boolean).map((line) => line.split("\0"))
    if (commits.some((fields) => fields.length !== 3 || !FULL_HASH.test(fields[0]) || !/^\d+$/.test(fields[1]))) return
    return { count: commits.length, fields: { limit, commits: commits.slice(0, limit)
      .map((fields) => ({ commit: fields[0], authorTime: Number(fields[1]), summary: fields[2] })) } }
  }
  if (input.operation === "blame") return blame(text)
  if (input.operation === "compare" && input.stat) {
    const rows = text.split("\0").filter(Boolean).map((row) => row.split("\t"))
    if (rows.some((row) => row.length !== 3)) return
    return { count: 0, fields: { files: rows.map((row) => ({ path: row[2], added: row[0] === "-" ? null : Number(row[0]), deleted: row[1] === "-" ? null : Number(row[1]) })) } }
  }
  return { count: 0, fields: { text } }
}

// Porcelain prints commit details once per commit, then every line as a header followed by its tab-prefixed content.
export function blame(text: string) {
  const commits = new Map<string, { authorTime?: number; summary?: string }>()
  const state = { current: undefined as { commit: string; line: number } | undefined, malformed: false }
  const lines = text.split("\n").flatMap((row) => {
    const header = /^([0-9a-f]{40}|[0-9a-f]{64}) \d+ (\d+)(?: \d+)?$/.exec(row)
    if (header) {
      state.current = { commit: header[1], line: Number(header[2]) }
      if (!commits.has(header[1])) commits.set(header[1], {})
      return []
    }
    if (!state.current) {
      state.malformed = state.malformed || row !== ""
      return []
    }
    const details = commits.get(state.current.commit)
    if (row.startsWith("author-time ") && details) details.authorTime = Number(row.slice(12))
    if (row.startsWith("summary ") && details) details.summary = row.slice(8)
    if (!row.startsWith("\t")) return []
    const entry = { ...state.current, content: row.slice(1) }
    state.current = undefined
    return [entry]
  })
  if (state.malformed) return
  return { count: 0, fields: { lines: lines.map((entry) => ({ line: entry.line, commit: entry.commit,
    authorTime: commits.get(entry.commit)?.authorTime, summary: commits.get(entry.commit)?.summary, content: entry.content })) } }
}
