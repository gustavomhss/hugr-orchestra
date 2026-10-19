export * as ResearchHistory from "./history"

import path from "node:path"
import { Effect } from "effect"
import { Research } from "@orchestra/schema/research"
import { FSUtil } from "@orchestra/core/fs-util"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { Git } from "@/git"
import { Tool } from "@/tool/tool"
import { assertExternalDirectoryEffect } from "@/tool/external-directory"
import { ResearchSourceCapture } from "./source-capture"

const FULL_HASH = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/
// A range diff gates every changed file it would project, so a path set that touches more is refused, not sampled.
const COMPARE_FILE_LIMIT = 100

export const make = Effect.gen(function* () {
  const git = yield* Git.Service
  const fs = yield* FSUtil.Service
  return (binding: Research.Binding, input: Research.HistoryInput, ctx: Tool.Context) => Effect.gen(function* () {
    if (Object.entries(process.env).some(([key, value]) => key.startsWith("GIT_") && value))
      return yield* new Research.Error({ code: "binding_mismatch", message: "Historical acquisition requires an unredirected native Git environment" })
    if (input.operation === "blame" && input.end !== undefined && input.end < (input.start ?? 1))
      return yield* new Research.Error({ code: "reference_invalid", message: "Blame line range does not exist" })
    if (input.operation === "search" && input.message === undefined && input.path === undefined)
      return yield* new Research.Error({ code: "reference_invalid", message: "Commit search requires a message substring, a path, or both" })
    const root = yield* fs.realPath(binding.worktree)
    const requested = input.operation === "compare" ? input.paths : input.path === undefined ? [] : [input.path]
    const relatives = requested.map((entry) => path.relative(root, path.resolve(binding.directory, entry)).replaceAll("\\", "/"))
    if (relatives.some((relative) => !relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative)))
      return yield* new Research.Error({ code: "binding_mismatch", message: "Historical path must address one file inside the bound worktree" })
    yield* gate(ctx, binding, root, relatives)
    const actual = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: root, maxOutputBytes: 8192, timeout: "10 seconds" })
    if (actual.exitCode !== 0 || actual.truncated || (yield* fs.realPath(actual.text().trim())) !== root)
      return yield* new Research.Error({ code: "binding_mismatch", message: "Git repository differs from native research worktree" })
    const resolve = (revision: string) => git.run(["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`],
      { cwd: root, maxOutputBytes: 1024, timeout: "10 seconds" }).pipe(Effect.flatMap((head) =>
      head.exitCode !== 0 || head.truncated || !FULL_HASH.test(head.text().trim())
        ? Effect.fail(new Research.Error({ code: "source_unavailable", message: "Requested historical commit is unavailable" }))
        : Effect.succeed(head.text().trim())))
    const revision = yield* resolve(input.revision ?? "HEAD")
    const base = input.operation === "compare" || input.operation === "diff" ? yield* resolve(input.base) : undefined
    const shallow = yield* git.run(["rev-parse", "--is-shallow-repository"], { cwd: root, maxOutputBytes: 1024, timeout: "10 seconds" })
    if (shallow.exitCode !== 0 || shallow.truncated || !["true", "false"].includes(shallow.text().trim()))
      return yield* new Research.Error({ code: "publication_uncertain", message: "Historical repository coverage is unavailable" })
    const changed = input.operation === "compare" && base ? yield* changedFiles(git, root, base, revision, relatives) : relatives
    if (input.operation === "compare") yield* gate(ctx, binding, root, changed)
    // An empty changed set keeps the requested pathspecs: an empty pathspec would widen the query to the whole tree.
    const literal = (changed.length > 0 ? changed : relatives).map((relative) => `:(literal)${relative}`)
    const limit = input.operation === "log" || input.operation === "search" ? input.limit ?? 20 : 0
    const result = yield* git.run(
      input.operation === "log"
        ? ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H", `--max-count=${limit + 1}`, revision, "--", ...literal]
        : input.operation === "show" ? ["--no-pager", "show", "--no-ext-diff", "--no-textconv", `${revision}:${relatives[0]}`]
        : input.operation === "diff" ? ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", base ?? input.base, revision, "--", ...literal]
        : input.operation === "blame" ? ["--no-pager", "blame", "--porcelain", "--no-progress",
          ...(input.start !== undefined || input.end !== undefined ? [`-L${input.start ?? 1},${input.end ?? ""}`] : []), revision, "--", relatives[0]]
        : input.operation === "compare" ? ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--no-renames",
          ...(input.stat ? ["--numstat", "-z"] : ["--unified=3"]), base ?? input.base, revision, "--", ...literal]
        : ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H%x00%at%x00%s", `--max-count=${limit + 1}`,
          ...(input.message === undefined ? [] : ["--fixed-strings", "--regexp-ignore-case", `--grep=${input.message}`]), revision, "--", ...literal],
      { cwd: root, maxOutputBytes: Research.Limits.sourceBytes, timeout: "30 seconds" })
    if (result.exitCode !== 0)
      return yield* new Research.Error({ code: "source_unavailable", message: "Historical query failed; no empty successful source was admitted" })
    const capture = yield* ResearchSourceCapture.Current
    if (!capture) return yield* new Research.Error({ code: "binding_missing", message: "Historical acquisition requires its native source observer" })
    const origin = { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/git-${input.operation}`, revision } as const
    const received = yield* capture({ origin, representation: "received", mediaType: "text/plain", content: result.stdout, complete: !result.truncated })
    // A byte-bounded capture may stop inside a record or a UTF-8 scalar; project only whole records.
    const whole = result.truncated ? result.stdout.subarray(0, result.stdout.lastIndexOf(input.operation === "compare" && input.stat ? 0 : 10) + 1) : result.stdout
    const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(whole),
      catch: () => new Research.Error({ code: "unsupported", message: "Historical output is not lossless UTF-8 text" }) })
    const projection = project(input, text, limit)
    if (!projection)
      return yield* new Research.Error({ code: "publication_uncertain", message: "Historical commit projection is malformed" })
    const complete = !result.truncated && (input.operation === "compare" || input.operation === "diff" || input.operation === "show"
      || (shallow.text().trim() === "false" && projection.count <= limit))
    const receipt = yield* capture({ origin, representation: "structured-json", mediaType: "application/json", content: JSON.stringify({
      operation: input.operation, ...(input.operation === "compare" ? { paths: relatives, files: changed, stat: input.stat === true }
        : relatives.length > 0 ? { path: relatives[0] } : {}),
      revision, ...(base ? { base } : {}), ...(input.operation === "search" && input.message !== undefined ? { message: input.message } : {}),
      complete, ...projection.fields,
      scope: "committed-history-only", shallow: shallow.text().trim() === "true", dirtyWorkingTreeObserved: false,
    }), complete, derivedFrom: received.ref, transformation: "native-git-history-v1" })
    return { title: `Research history: ${input.operation}`, output: JSON.stringify(receipt), metadata: { researchSource: receipt, researchReceived: received } }
  }).pipe(Effect.orDie)
})

// Every worktree path a history query names or projects passes the same read gates as the native read tool.
function gate(ctx: Tool.Context, binding: Research.Binding, root: string, relatives: string[]) {
  return Effect.gen(function* () {
    if (relatives.length === 0) {
      yield* ctx.ask({ permission: "read", patterns: ["."], always: [], metadata: { history: true } })
      return
    }
    yield* Effect.forEach(relatives, (relative) => assertExternalDirectoryEffect(ctx, path.join(root, relative)), { discard: true })
    yield* ctx.ask({ permission: "read", patterns: relatives, always: [], metadata: { history: true } })
    yield* Effect.forEach(relatives, (relative) => ToolSafety.beforeInvocation({ tool: "read", args: { filePath: path.join(root, relative) },
      sessionID: ctx.sessionID, callID: ctx.callID ?? "", directory: binding.directory, projectID: binding.projectID,
      projectDirectory: binding.worktree }), { discard: true })
  })
}

function changedFiles(git: Git.Interface, root: string, base: string, revision: string, relatives: string[]) {
  return Effect.gen(function* () {
    const names = yield* git.run(["--no-pager", "diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, revision, "--",
      ...relatives.map((relative) => `:(literal)${relative}`)], { cwd: root, maxOutputBytes: 1024 * 1024, timeout: "30 seconds" })
    if (names.exitCode !== 0 || names.truncated)
      return yield* new Research.Error({ code: "source_unavailable", message: "Historical range file set is unavailable" })
    const files = names.text().split("\0").filter(Boolean)
    if (files.length > COMPARE_FILE_LIMIT)
      return yield* new Research.Error({ code: "over_cap", message: `Range diff touches ${files.length} files; narrow the path set to at most ${COMPARE_FILE_LIMIT}` })
    return files
  })
}

function project(input: Research.HistoryInput, text: string, limit: number) {
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
function blame(text: string) {
  const commits = new Map<string, { authorTime?: number, summary?: string }>()
  const state = { current: undefined as { commit: string, line: number } | undefined, malformed: false }
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
