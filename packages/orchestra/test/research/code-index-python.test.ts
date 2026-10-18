import { describe, expect } from "bun:test"
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
import { ResearchSeatTools } from "@/research/seat-tools"
import { Instruction } from "@/session/instruction"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Skill } from "@/skill"
import { ToolRegistry } from "@/tool/registry"
import type { Tool } from "@/tool/tool"
import { Truncate } from "@/tool/truncate"
import { expectSpawn } from "../../../core/test/fixture/omni-expect"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// JE-AC-X9: for a Python function used across modules, the wired index finds its definition and its references. The
// research toolkit acquires the scip-python pack, the indexer runs confined through omni, and code_query reads the
// shard as the seat's own tool.

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node, Permission.node, FSUtil.node,
  Skill.node, Truncate.node, filesystem, httpClient, Instruction.node, AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchRecords.node,
  AppProcess.node, RipgrepBinary.node, ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))

const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }

// The shape of the index-repo fixture's py/ program: `double_it` is defined in one module and called in the other.
const REPO: Record<string, string> = {
  "pyproject.toml": "[project]\nname = \"index-python\"\nversion = \"0\"\n",
  "helpers.py": "def double_it(value: int) -> int:\n    return value * 2\n",
  "runner.py": "from helpers import double_it\n\n\ndef run() -> int:\n    return double_it(21)\n",
}

const repo = (directory: string) => Effect.promise(async () => {
  await Promise.all(Object.entries(REPO).map((entry) => Bun.write(path.join(directory, entry[0]), entry[1])))
  await $`git add -A`.cwd(directory).quiet()
  await $`git commit -m fixture`.cwd(directory).quiet()
})

const setup = Effect.fn("CodeIndexPythonTest.setup")(function* () {
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
    return yield* execution.enter(child.id, `code-index-python-${callID}`, tool.execute(input as never, context(callID))).pipe(Effect.exit)
  })
  return { call, ids: tools.map((tool) => tool.id), cleanup: sessions.remove(authority.id) }
})

const failure = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ""

describe("the wired Python code index", () => {
  it.instance("code_query finds a function's definition and its references across modules from the real build", () =>
    Effect.gen(function* () {
      expectSpawn(import.meta.path)
      const fixture = yield* setup()
      const definition = { op: "definition", name: "double_it" } satisfies CodeIndex.CodeQuery

      if (process.platform !== "darwin" && process.platform !== "linux") {
        // The indexer only runs confined; this platform has no confinement for it, so the index is a named gap.
        expect(failure(yield* fixture.call("code_query", definition))).toContain("sandbox-platform-unsupported")
        return yield* fixture.cleanup
      }

      // The first query starts the build in the background and fails index_building ("Index is building") until the
      // shard lands.
      const answered = yield* fixture.call("code_query", definition).pipe(
        Effect.repeat({ while: (exit) => failure(exit).includes("Index is building"), schedule: Schedule.spaced("3 seconds"), times: 40 }))
      if (Exit.isFailure(answered)) throw new Error(Cause.pretty(answered.cause))
      expect(answered.value.output).toContain("definition: double_it function exported helpers.py:1-2")
      expect(answered.value.output).toContain("shards py:.")

      const references = yield* fixture.call("code_query", { op: "references", name: "double_it" } satisfies CodeIndex.CodeQuery)
      if (Exit.isFailure(references)) throw new Error(Cause.pretty(references.cause))
      // The call site on runner.py:5, which only the scip-python layer can attribute to the symbol defined in helpers.py.
      expect(references.value.output).toContain("runner.py:5")
      expect(references.value.output).toContain("runner.py:1")

      const callers = yield* fixture.call("code_query", { op: "callers", name: "double_it" } satisfies CodeIndex.CodeQuery)
      if (Exit.isFailure(callers)) throw new Error(Cause.pretty(callers.cause))
      expect(callers.value.output).toContain("runner.py:4-5 call in run lines 5")
      yield* fixture.cleanup
    }), { git: true, init: repo }, 600_000)
})
