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
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
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
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// X6, Go: for a Go function used across packages, the wired index finds its definition and its references. The research
// toolkit acquires the scip-go pack (built from source on the private Go runtime), the indexer drives the host's `go`
// confined through omni, and code_query reads the shard as the seat's own tool. Non-ASCII text before the call site
// checks that scip-go's byte columns reach the index as UTF-16 units.

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  Agent.node, Config.node, Git.node, Session.node, SessionProjector.node, Database.node, Permission.node, FSUtil.node,
  Skill.node, Truncate.node, filesystem, httpClient, Instruction.node, AtlasKnowledge.node,
  EventV2Bridge.node, ResearchExecution.node, ResearchRecords.node,
  AppProcess.node, RipgrepBinary.node, ToolRegistry.node,
]), [[RuntimeFlags.node, RuntimeFlags.layer({ pure: true, disableDefaultPlugins: true, disableExternalSkills: true })]]))

const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }

// `DoubleIt` is defined in one package and called from another, after a non-ASCII string on the same line.
const REPO: Record<string, string> = {
  "go.mod": "module example.com/indexgo\n\ngo 1.21\n",
  "helpers/helpers.go": "package helpers\n\nfunc DoubleIt(value int) int {\n\treturn value * 2\n}\n",
  "main.go": "package main\n\nimport \"example.com/indexgo/helpers\"\n\nfunc run() int {\n\tlabel := \"ünï→✓\"; return helpers.DoubleIt(len(label))\n}\n\nfunc main() { run() }\n",
}

const repo = (directory: string) => Effect.promise(async () => {
  await Promise.all(Object.entries(REPO).map((entry) => Bun.write(path.join(directory, entry[0]), entry[1])))
  await $`git add -A`.cwd(directory).quiet()
  await $`git commit -m fixture`.cwd(directory).quiet()
})

const setup = Effect.fn("CodeIndexGoTest.setup")(function* () {
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
    return yield* execution.enter(child.id, `code-index-go-${callID}`, tool.execute(input as never, context(callID))).pipe(Effect.exit)
  })
  return { call, ids: tools.map((tool) => tool.id), cleanup: sessions.remove(authority.id) }
})

const failure = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : ""

// Building the scip-go pack fills a Go module cache under the toolkit root, and Go writes that cache read-only; the
// suite's data directory could then not be removed after the run.
const writableModuleCache = Effect.gen(function* () {
  const root = yield* ResearchToolkit.Root
  yield* Effect.promise(() => $`chmod -R u+w ${path.join(root, "cache", "go")}`.nothrow().quiet())
})

describe("the wired Go code index", () => {
  it.instance("code_query finds a function's definition and its references across packages from the real build", () =>
    Effect.gen(function* () {
      const fixture = yield* setup()
      const definition = { op: "definition", name: "DoubleIt" } satisfies CodeIndex.CodeQuery

      if (process.platform !== "darwin" && process.platform !== "linux") {
        // The indexer only runs confined; this platform has no confinement for it, so the index is a named gap.
        expect(failure(yield* fixture.call("code_query", definition))).toContain("sandbox-platform-unsupported")
        return yield* fixture.cleanup
      }

      // The first query starts the build in the background and fails index_building ("Index is building") until the
      // shard lands.
      const answered = yield* fixture.call("code_query", definition).pipe(
        Effect.repeat({ while: (exit) => failure(exit).includes("Index is building"), schedule: Schedule.spaced("3 seconds"), times: 280 }))
      if (Exit.isFailure(answered)) throw new Error(Cause.pretty(answered.cause))
      expect(answered.value.output).toContain("definition: DoubleIt function exported helpers/helpers.go:3-5")
      // GitHub's runners have go: the precise indexer must have built the shard, not the tree-sitter fallback.
      expect(answered.value.output).toContain("shards go:.@scip-go")

      const references = yield* fixture.call("code_query", { op: "references", name: "DoubleIt" } satisfies CodeIndex.CodeQuery)
      if (Exit.isFailure(references)) throw new Error(Cause.pretty(references.cause))
      // The call site on main.go:6, which only the scip-go layer can attribute to the function defined in helpers.
      expect(references.value.output).toContain("main.go:6")

      // `DoubleIt` starts at UTF-16 column 35 of main.go:6; in UTF-8 bytes it would start at 41, past this column.
      // Mutation control: skip the column conversion in Scip.readScip and this resolves to `run` instead.
      const at = yield* fixture.call("code_query", { op: "definition", at: { path: "main.go", line: 6, column: 35 } } satisfies CodeIndex.CodeQuery)
      if (Exit.isFailure(at)) throw new Error(Cause.pretty(at.cause))
      expect(at.value.output).toContain("definition: DoubleIt function exported helpers/helpers.go:3-5")

      const callers = yield* fixture.call("code_query", { op: "callers", name: "DoubleIt" } satisfies CodeIndex.CodeQuery)
      if (Exit.isFailure(callers)) throw new Error(Cause.pretty(callers.cause))
      expect(callers.value.output).toContain("call in run")
      yield* fixture.cleanup
    }).pipe(Effect.ensuring(writableModuleCache)), { git: true, init: repo }, 900_000)
})
