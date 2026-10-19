import { describe, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { $ } from "bun"
import { Cause, Effect, Exit, Schedule } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem, httpClient } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import type { CodeIndex } from "@orchestra/core/research-toolkit/code-index/types"
import { ResearchRecords } from "@orchestra/core/research/records"
import { RipgrepBinary } from "@orchestra/core/ripgrep/binary"
import { SessionProjector } from "@orchestra/core/session/projector"
import { Agent } from "@/agent/agent"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { ResearchSeatTools } from "@orchestra/core/research/seat-tools"
import { Instruction } from "@/session/instruction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ToolRegistry } from "@/tool/registry"
import type { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { expectSpawn } from "../../../../packages/core/test/fixture/omni-expect"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// The wired code index, end to end through the registry the loop and Claude mode share: the research toolkit
// acquires the scip-typescript pack, the indexer runs confined through omni, X1 and X2 extract, X3 stores and answers,
// and code_query and code_locate read it as the seat's own tools.

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node, Permission.node, FSUtil.node,
  Skill.node, Truncate.node, filesystem, httpClient, Instruction.node, AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchRecords.node,
  AppProcess.node, RipgrepBinary.node, ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))

const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }

// The shape of the index-repo fixture's core package: `viaExports` is called inside `relayed`, which `main` calls.
const REPO: Record<string, string> = {
  "package.json": JSON.stringify({ name: "index-wiring", private: true }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, noEmit: true, skipLibCheck: true },
    include: ["src"],
  }),
  "src/x.ts": "export function viaExports(value: number) {\n  return value + 1\n}\n",
  "src/y.ts": "import { viaExports } from \"./x\"\n\nexport function relayed(value: number) {\n  return viaExports(value) * 2\n}\n",
  "src/main.ts": "import { relayed } from \"./y\"\n\nexport function main() {\n  return relayed(2)\n}\n",
}

const repo = (directory: string) => Effect.promise(async () => {
  await Promise.all(Object.entries(REPO).map(async ([file, text]) => {
    await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true })
    await Bun.write(path.join(directory, file), text)
  }))
  await $`git add -A`.cwd(directory).quiet()
  await $`git commit -m fixture`.cwd(directory).quiet()
})

const setup = Effect.fn("CodeIndexWiringTest.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Research authority" })
  const child = yield* sessions.create({ agent: ResearchSeatTools.SEAT, title: "Research execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: ResearchSeatTools.SEAT, source: "host" })
  const agent = yield* agents.get(ResearchSeatTools.SEAT)
  const tools = yield* registry.tools({ ...model, agent })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user",
    agent: ResearchSeatTools.SEAT, model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: ResearchSeatTools.SEAT, mode: "subagent", path: { cwd: instance.directory, root: instance.directory },
    ...model, cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const context = (callID: string): Tool.Context => ({
    sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: ResearchSeatTools.SEAT,
    permission: agent.permission, abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
    ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie),
  })
  // Every call gets its persisted tool part and its own dispatch, so polling a building index spends no one dispatch's
  // tool calls or deadline.
  const call = (name: string, input: unknown) => Effect.gen(function* () {
    const tool = tools.find((candidate) => candidate.id === name)
    if (!tool) throw new Error(`Missing native research tool: ${name}`)
    const callID = PartID.ascending()
    yield* sessions.updatePart({ type: "tool", id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running", input: {}, time: { start: Date.now() } } })
    return yield* execution.enter(child.id, `code-index-wiring-${callID}`, tool.execute(input as never, context(callID))).pipe(Effect.exit)
  })
  return { call, ids: tools.map((tool) => tool.id), cleanup: sessions.remove(authority.id) }
})

const failure = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ""
// The registry appends the retained-evidence line to the tool's own JSON.
const located = (output: string) => JSON.parse(output.split("\n\nRetained source evidence:")[0]) as CodeIndex.LocateResult

describe("the wired code index", () => {
  it.instance("code_query answers real callers and code_locate a ranked range from the real build", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* setup()
      expect(fixture.ids).toEqual(expect.arrayContaining(["code_query", "code_search", "code_locate"]))
      const callers = { op: "callers", name: "viaExports" } satisfies CodeIndex.CodeQuery

      if (process.platform !== "darwin" && process.platform !== "linux") {
        // The indexer only runs confined; this platform has no confinement for it, so the index is a named gap.
        expect(failure(yield* fixture.call("code_query", callers))).toContain("sandbox-platform-unsupported")
        const answer = yield* fixture.call("code_locate", { question: "which function doubles the relayed value?" })
        if (Exit.isFailure(answer)) throw new Error(Cause.pretty(answer.cause))
        const lexical = located(answer.value.output)
        expect(lexical.ranges.some((range) => range.path === "src/y.ts")).toBe(true)
        expect(lexical.basis.coverage.languagesMissing).toContain("ts")
        return yield* fixture.cleanup
      }

      // The first query starts the build in the background and fails index_building ("Index is building") until the
      // shard lands.
      const answered = yield* fixture.call("code_query", callers).pipe(
        Effect.repeat({ while: (exit) => failure(exit).includes("Index is building"), schedule: Schedule.spaced("3 seconds"), times: 180 }))
      if (Exit.isFailure(answered)) throw new Error(Cause.pretty(answered.cause))
      const output = answered.value.output
      expect(output).toContain("callers: viaExports function exported src/x.ts:1-3")
      expect(output).toContain("src/y.ts:3-5 call in relayed lines 4")
      // The import of viaExports on y.ts:1 names it without calling it.
      expect(output).not.toContain("src/y.ts:1 ")
      expect(output).toContain("shards ts:.")

      const answer = yield* fixture.call("code_locate", { question: "which function doubles the relayed value?" })
      if (Exit.isFailure(answer)) throw new Error(Cause.pretty(answer.cause))
      const result = located(answer.value.output)
      expect(result.basis.basis.shards.map((shard) => shard.indexer)).toEqual(["scip-typescript"])
      // Without the index the hit would be a bare ±3-line window; the enclosing definition comes from the index.
      expect(result.ranges.slice(0, 3)).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: "src/y.ts", startLine: 3, endLine: 5, symbol: "relayed" })]))
      expect(result.searches.some((search) => search.kind === "neighbors")).toBe(true)

      // code_search lines carry the index symbol that encloses them.
      const searched = yield* fixture.call("code_search", { pattern: "viaExports(value)" })
      if (Exit.isFailure(searched)) throw new Error(Cause.pretty(searched.cause))
      expect(searched.value.output).toContain("src/y.ts:4: [relayed]")
      yield* fixture.cleanup
    }), { git: true, init: repo }, 600_000)
})
