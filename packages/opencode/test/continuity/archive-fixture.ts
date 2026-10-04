import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { Effect, Layer } from "effect"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Model } from "@opencode-ai/schema/model"
import { Provider } from "@opencode-ai/schema/provider"
import { Archive } from "@/continuity/archive"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { ArchiveChunk } from "@/continuity/memory-types"

export function user(sessionID: SessionID, suffix = "user", text = "captured observation"): SessionV1.WithParts {
  const id = MessageID.make(`msg_${suffix}`)
  return {
    info: { id, sessionID, role: "user", agent: "build", time: { created: 1 },
      model: { modelID: Model.ID.make("test"), providerID: Provider.ID.make("test") } },
    parts: [{ id: PartID.make(`prt_${suffix}`), messageID: id, sessionID, type: "text", text }],
  }
}

export function tool(sessionID: SessionID, output = "captured tool output", suffix = "tool"): SessionV1.WithParts {
  const id = MessageID.make(`msg_${suffix}`)
  return {
    info: { id, sessionID, role: "assistant", parentID: MessageID.make("msg_user"), agent: "build", mode: "build",
      time: { created: 1, completed: 2 }, modelID: Model.ID.make("test"), providerID: Provider.ID.make("test"),
      path: { cwd: "/project", root: "/project" }, cost: 0, finish: "stop",
      tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } },
    parts: [{ id: PartID.make(`prt_${suffix}`), messageID: id, sessionID, type: "tool", tool: "shell", callID: "call_one",
      state: { status: "completed", input: { command: "inspect --exact" }, output, title: "Inspect",
        metadata: { truncated: false, exit: 7, outputPath: "/original/output.log" }, time: { start: 1, end: 2 } } }],
  }
}

export const fixture = Effect.fnUntraced(function* () {
  const fs = yield* FSUtil.Service
  const sessionID = SessionID.create()
  const dir = path.join(yield* fs.realPath(Global.Path.data), "continuity", createHash("sha256").update(sessionID).digest("hex"))
  yield* Effect.addFinalizer(() => fs.remove(dir, { recursive: true, force: true }).pipe(Effect.orDie))
  const archive = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)))
  return { fs, sessionID, dir, archive, index: path.join(dir, "index.json"),
    file: (id: string) => path.join(dir, `${id}.md`) }
})

export function instrument(fs: FSUtil.Interface) {
  const calls = { scans: [] as string[], reads: [] as string[] }
  return {
    calls,
    reset: () => { calls.scans.length = 0; calls.reads.length = 0 },
    fs: FSUtil.Service.of({
      ...fs,
      readDirectoryEntries: (dir) => Effect.suspend(() => { calls.scans.push(dir); return fs.readDirectoryEntries(dir) }),
      readDirectory: (dir, options) => Effect.suspend(() => { calls.scans.push(dir); return fs.readDirectory(dir, options) }),
      readFile: (file) => Effect.suspend(() => { calls.reads.push(file); return fs.readFile(file) }),
      readFileString: (file, encoding) => Effect.suspend(() => { calls.reads.push(file); return fs.readFileString(file, encoding) }),
    }),
  }
}

// Independent frame reader: use the declared byte length, never the implementation's decoder.
export function payload(value: ArchiveChunk) {
  const bytes = Buffer.from(value.markdown)
  const header = /\nPayload bytes: ([0-9]+)\n\n(`{3,})markdown\n/.exec(value.markdown)
  expect(header).not.toBeNull()
  const start = Buffer.byteLength(value.markdown.slice(0, header!.index + header![0].length))
  const end = start + Number(header![1])
  expect(bytes.subarray(end).toString()).toBe(`\n${header![2]}\n`)
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start, end))
  expect(Buffer.byteLength(text)).toBe(Number(header![1]))
  expect(Number(header![1])).toBeLessThanOrEqual(32 * 1024)
  return text
}

export const failure = Effect.fnUntraced(function* <A>(effect: Effect.Effect<A, Archive.ArchiveError>, reason: string) {
  const result = yield* effect.pipe(Effect.match({
    onFailure: (error) => ({ failed: true, reason: error.reason, tag: error._tag }),
    onSuccess: () => ({ failed: false, reason: "unexpected success", tag: "" }),
  }))
  expect(result).toEqual({ failed: true, reason, tag: "ContinuityArchiveError" })
})
