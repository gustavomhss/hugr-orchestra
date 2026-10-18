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

export const make = Effect.gen(function* () {
  const git = yield* Git.Service
  const fs = yield* FSUtil.Service
  return (binding: Research.Binding, input: Research.HistoryInput, ctx: Tool.Context) => Effect.gen(function* () {
    if (Object.entries(process.env).some(([key, value]) => key.startsWith("GIT_") && value))
      return yield* new Research.Error({ code: "binding_mismatch", message: "Historical acquisition requires an unredirected native Git environment" })
    const root = yield* fs.realPath(binding.worktree)
    const selected = path.resolve(binding.directory, input.path)
    const relative = path.relative(root, selected).replaceAll("\\", "/")
    if (!relative || relative === ".." || relative.startsWith("../") || path.isAbsolute(relative))
      return yield* new Research.Error({ code: "binding_mismatch", message: "Historical path must address one file inside the bound worktree" })
    yield* assertExternalDirectoryEffect(ctx, selected)
    yield* ctx.ask({ permission: "read", patterns: [relative], always: [], metadata: { history: true } })
    yield* ToolSafety.beforeInvocation({ tool: "read", args: { filePath: selected }, sessionID: ctx.sessionID,
      callID: ctx.callID ?? "", directory: binding.directory, projectID: binding.projectID, projectDirectory: binding.worktree })
    const actual = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: root, maxOutputBytes: 8192, timeout: "10 seconds" })
    if (actual.exitCode !== 0 || actual.truncated || (yield* fs.realPath(actual.text().trim())) !== root)
      return yield* new Research.Error({ code: "binding_mismatch", message: "Git repository differs from native research worktree" })
    const head = yield* git.run(["rev-parse", "--verify", "--end-of-options", `${input.revision ?? "HEAD"}^{commit}`],
      { cwd: root, maxOutputBytes: 1024, timeout: "10 seconds" })
    if (head.exitCode !== 0 || head.truncated || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head.text().trim()))
      return yield* new Research.Error({ code: "source_unavailable", message: "Requested historical commit is unavailable" })
    const revision = head.text().trim()
    const shallow = yield* git.run(["rev-parse", "--is-shallow-repository"], { cwd: root, maxOutputBytes: 1024, timeout: "10 seconds" })
    if (shallow.exitCode !== 0 || shallow.truncated || !["true", "false"].includes(shallow.text().trim()))
      return yield* new Research.Error({ code: "publication_uncertain", message: "Historical repository coverage is unavailable" })
    const result = yield* git.run(input.operation === "log"
      ? ["-c", "log.showSignature=false", "--no-pager", "log", "--format=%H", `--max-count=${(input.limit ?? 20) + 1}`, revision, "--", `:(literal)${relative}`]
      : input.operation === "show" ? ["--no-pager", "show", "--no-ext-diff", "--no-textconv", `${revision}:${relative}`]
      : ["--no-pager", "diff", "--no-ext-diff", "--no-textconv", "--no-color", "--unified=3", input.base, revision, "--", `:(literal)${relative}`],
      { cwd: root, maxOutputBytes: Research.Limits.sourceBytes, timeout: "30 seconds" })
    if (result.exitCode !== 0)
      return yield* new Research.Error({ code: "source_unavailable", message: "Historical query failed; no empty successful source was admitted" })
    const capture = yield* ResearchSourceCapture.Current
    if (!capture) return yield* new Research.Error({ code: "binding_missing", message: "Historical acquisition requires its native source observer" })
    const origin = { kind: "tool-output", uri: `native:${ctx.sessionID}/${ctx.messageID}/${ctx.callID}/git-${input.operation}`, revision } as const
    const received = yield* capture({ origin, representation: "received", mediaType: "text/plain", content: result.stdout, complete: !result.truncated })
    const text = yield* Effect.try({ try: () => new TextDecoder("utf-8", { fatal: true }).decode(result.stdout),
      catch: () => new Research.Error({ code: "unsupported", message: "Historical output is not lossless UTF-8 text" }) })
    const commits = input.operation === "log" ? text.split(/\r?\n/).filter(Boolean) : []
    if (input.operation === "log" && commits.some((commit) => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)))
      return yield* new Research.Error({ code: "publication_uncertain", message: "Historical commit projection is malformed" })
    const complete = !result.truncated && (input.operation !== "log" || (shallow.text().trim() === "false" && commits.length <= (input.limit ?? 20)))
    const receipt = yield* capture({ origin, representation: "structured-json", mediaType: "application/json", content: JSON.stringify({
      operation: input.operation, path: relative, revision, ...(input.operation === "diff" ? { base: input.base } : {}),
      complete, ...(input.operation === "log" ? { commits: commits.slice(0, input.limit ?? 20), limit: input.limit ?? 20 } : { text }),
      scope: "committed-history-only", shallow: shallow.text().trim() === "true", dirtyWorkingTreeObserved: false,
    }), complete, derivedFrom: received.ref, transformation: "native-git-history-v1" })
    return { title: `Research history: ${input.operation}`, output: JSON.stringify(receipt), metadata: { researchSource: receipt, researchReceived: received } }
  }).pipe(Effect.orDie)
})
