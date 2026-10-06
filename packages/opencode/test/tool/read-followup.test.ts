import { afterEach, expect } from "bun:test"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Effect, Layer } from "effect"
import path from "path"
import { Agent } from "@/agent/agent"
import { Instruction } from "@/session/instruction"
import { MessageID, SessionID } from "@/session/schema"
import { ReadTool } from "@/tool/read"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { disposeAllInstances, testInstanceStoreLayer, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(
      LayerNode.group([Agent.node, FSUtil.node, CrossSpawnSpawner.node, Instruction.node, Ripgrep.node, Truncate.node]),
    ),
    testInstanceStoreLayer,
  ),
)

const read = Effect.fn("ReadFollowupTest.read")(function* (args: Tool.InferParameters<typeof ReadTool>) {
  const info = yield* ReadTool
  const tool = yield* info.init()
  // Every read shares one assistant message, as parallel calls in one model turn do.
  return yield* tool.execute(args, {
    sessionID: SessionID.make("ses_test"),
    messageID: MessageID.make("msg_test"),
    agent: "build",
    abort: AbortSignal.any([]),
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  })
})

const put = Effect.fn("ReadFollowupTest.put")(function* (file: string, content: string | Uint8Array) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(file, content)
})

it.instance("a media read leaves nested rules for the next text read", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const rules = path.join(test.directory, "docs", "AGENTS.md")
    yield* put(rules, "# Docs rule")
    yield* put(path.join(test.directory, "docs", "chart.pdf"), Buffer.from("%PDF-1.4"))
    yield* put(path.join(test.directory, "docs", "notes.txt"), "notes")

    const media = yield* read({ filePath: path.join(test.directory, "docs", "chart.pdf") })
    expect(media.output).toBe("PDF read successfully")
    expect(media.metadata.loaded).toEqual([])

    const text = yield* read({ filePath: path.join(test.directory, "docs", "notes.txt") })
    expect(text.output).toContain(`<system-reminder>\nInstructions from: ${rules}\n# Docs rule`)
    expect(text.metadata.loaded).toEqual([rules])
  }),
)

it.instance("following every partial footer reads the whole file", () =>
  Effect.gen(function* () {
    const test = yield* TestInstance
    const file = path.join(test.directory, "mixed.txt")
    // Short lines end the first page at 2000 lines; the 2000 lines after it are far over 50 KB.
    yield* put(file, Array.from({ length: 3000 }, (_, index) => (index < 2100 ? "short" : "x".repeat(400))).join("\n"))

    const seen: number[] = []
    let next: { offset?: number; limit?: number } = {}
    while (true) {
      const output = (yield* read({ filePath: file, ...next })).output
      expect(Buffer.byteLength(output, "utf-8")).toBeLessThanOrEqual(50 * 1024)
      seen.push(...Array.from(output.matchAll(/^(\d+): /gm), (match) => Number(match[1])))
      const footer = output.match(/Use offset=(\d+)(?: limit=(\d+))? to continue/)
      if (!footer) break
      next = { offset: Number(footer[1]), limit: footer[2] ? Number(footer[2]) : undefined }
    }
    expect(seen).toEqual(Array.from({ length: 3000 }, (_, index) => index + 1))
  }),
)
