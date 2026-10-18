import { expect } from "bun:test"
import { Cause, Effect, Exit, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { FSUtil } from "@orchestra/core/fs-util"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { MessageID, SessionID } from "@/session/schema"
import { TestConfig } from "../fixture/config"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([Truncate.node, FSUtil.node, Agent.node]), [
  [Config.node, TestConfig.layer({ get: () => Effect.succeed({}), directories: () => Effect.succeed([]) })],
]))
const context = (): Tool.Context => ({
  sessionID: SessionID.descending(), messageID: MessageID.ascending(), agent: "maestro",
  abort: new AbortController().signal, messages: [], metadata: () => Effect.void, ask: () => Effect.void,
})

it.instance("raw Truncate output/write guards prevent secret retention; real safe overflow yields existing budget nudge", () =>
  Effect.gen(function* () {
    const truncate = yield* Truncate.Service
    const fs = yield* FSUtil.Service
    const allowed = yield* truncate.output("ordinary\n".repeat(50), { maxBytes: 100, maxLines: 10 })
    expect(allowed.truncated).toBe(true)
    if (!allowed.truncated) throw new Error("fixture did not exercise actual retention")
    yield* Effect.addFinalizer(() => fs.remove(allowed.outputPath).pipe(Effect.orDie))
    expect(yield* fs.readFileString(allowed.outputPath)).toBe("ordinary\n".repeat(50))
    expect(allowed.content).toContain("Context pressure:")
    const before = (yield* fs.readDirectory(Truncate.DIR)).sort()
    const secret = "gh" + "p_" + "x".repeat(40)
    const raw = "ordinary\n".repeat(10_000) + secret
    const rejected = yield* Effect.exit(truncate.output(raw))
    expect(Exit.isFailure(rejected)).toBe(true)
    if (Exit.isFailure(rejected)) expect(Cause.pretty(rejected.cause)).toContain("recognized-secret-output")
    expect(Exit.isFailure(yield* Effect.exit(truncate.write(raw)))).toBe(true)
    expect((yield* fs.readDirectory(Truncate.DIR)).sort()).toEqual(before)
  }),
)

it.instance("native Tool.define inspects full metadata/result before leaf truncation or truncated=true bypass", () =>
  Effect.gen(function* () {
    const truncate = yield* Truncate.Service
    const fs = yield* FSUtil.Service
    const positive = yield* truncate.output("ordinary".repeat(10_000))
    if (!positive.truncated) throw new Error("fixture did not engage real output store")
    yield* Effect.addFinalizer(() => fs.remove(positive.outputPath).pipe(Effect.orDie))
    const before = (yield* fs.readDirectory(Truncate.DIR)).sort()
    const secret = "gh" + "p_" + "x".repeat(40)
    const native = yield* Tool.define("fixture_native", Effect.succeed({
      description: "native fixture", parameters: Schema.Struct({ bypass: Schema.Boolean }),
      execute: (args: { bypass: boolean }) => Effect.succeed({ title: "fixture", output: "ordinary".repeat(10_000),
        metadata: { credential: secret, ...(args.bypass ? { truncated: true } : {}) },
      }),
    }))
    const tool = yield* Tool.init(native)
    expect(Exit.isFailure(yield* Effect.exit(tool.execute({ bypass: false }, context())))).toBe(true)
    expect(Exit.isFailure(yield* Effect.exit(tool.execute({ bypass: true }, context())))).toBe(true)
    expect((yield* fs.readDirectory(Truncate.DIR)).sort()).toEqual(before)
  }),
)
