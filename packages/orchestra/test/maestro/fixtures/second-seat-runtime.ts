import { afterEach, expect } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Cause, Effect, Exit } from "effect"
import { Database } from "@orchestra/core/database/database"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { Ripgrep } from "@orchestra/core/ripgrep"
import { SessionProjector } from "@orchestra/core/session/projector"
import { ModelV2 } from "@orchestra/core/model"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { InstanceState } from "@/effect/instance-state"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { BackendResult } from "@/maestro/backend-result"
import { Seats } from "@/maestro/seats"
import { SeatSkillRoot } from "@/maestro/seat-skill-root"
import { WriteRoots } from "@/maestro/write-roots"
import { Permission } from "@/permission"
import { Session } from "@/session/session"
import { MessageID, PartID } from "@/session/schema"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { Skill } from "@/skill"
import { TaskTool, type TaskPromptOps } from "@/tool/task"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { TestAppNodeBuilder } from "../../fixture/app-node-builder"
import { disposeAllInstances, TestInstance } from "../../fixture/fixture"
import { testEffect } from "../../lib/effect"

afterEach(disposeAllInstances)
const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  filesystem, Agent.node, BackgroundJob.node, Config.node, CrossSpawnSpawner.node, Database.node,
  EventV2Bridge.node, Git.node, Ripgrep.node, RuntimeFlags.node, Session.node, SessionProjector.node,
  SessionRunState.node, SessionStatus.node, Skill.node, ToolRegistry.node, Truncate.node, Permission.node,
])))
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const card = { outcome: "done", changes: [{ path: "src/owned.ts", change: "modified" }], checks: [], blockers: [], risks: [], nextActions: [] }

it.instance("second seat dispatch binds its own capabilities and return card", () => Effect.gen(function* () {
  const agents = yield* Agent.Service
  const skills = yield* Skill.Service
  const sessions = yield* Session.Service
  const registry = yield* ToolRegistry.Service
  const permission = yield* Permission.Service
  const instance = yield* TestInstance
  expect(Seats.find("sample-seat"), "source-snapshot registry adopted").toMatchObject({ id: "sample-seat", writeRoots: true, strictResume: true })
  const seat = yield* agents.get("sample-seat")
  expect(seat).toMatchObject({ id: "sample-seat", name: "Environment Seat", native: true, mode: "subagent" })
  expect(seat.prompt).toStartWith("You are Environment Seat, synthetic packet execution specialist")
  expect(seat.description).toContain("Edits only dispatch writePaths; read-only without them.")
  expect(Permission.evaluate("task", "general", seat.permission).action).toBe("deny")
  expect(Permission.evaluate("edit", "src/owned.ts", seat.permission).action).toBe("allow")
  expect(Permission.evaluate("skill", "sample-seat-work", seat.permission).action).toBe("allow")
  expect(Permission.evaluate("skill", "backend-implement", seat.permission).action).toBe("deny")
  expect(AtlasMemory.supports(seat)).toBe(false)
  const offered = yield* registry.tools({ ...model, agent: seat })
  expect(offered.map((tool) => tool.id)).not.toContain("atlas_memory_recall")
  expect(offered.map((tool) => tool.id)).not.toContain("atlas_memory_emit")
  expect((yield* skills.available(seat)).map((skill) => skill.name), "second-seat compiled skill binding").toEqual(["sample-seat-work"])
  expect((yield* skills.all()).map((skill) => skill.name)).not.toContain("sample-seat-work")
  expect((yield* skills.require("sample-seat-work", seat.id)).content).toContain("Work packet")
  const root = SeatSkillRoot.roots["sample-seat"]
  expect(root).toBeDefined()
  const placement = yield* InstanceState.context
  expect(Permission.evaluate("edit", path.relative(placement.worktree, path.join(root, "sample-seat-work/SKILL.md")), seat.permission).action).toBe("deny")
  expect(root === Seats.skillSource("sample-seat")).toBe(process.env.ORCHESTRA_SEAT_COMPILED !== "1")
  const expectedSkill = process.env.ORCHESTRA_SEAT_SKILL_BYTES
  if (!expectedSkill) throw new Error("Second-seat exact skill bytes missing")
  expect(yield* Effect.promise(() => Bun.file(path.join(root, "sample-seat-work/SKILL.md")).text()), "second-seat exact skill bytes").toBe(expectedSkill)
  if (process.env.ORCHESTRA_SEAT_COMPILED === "1") {
    expect(yield* Effect.promise(() => Bun.file(path.join(Seats.skillSource("sample-seat"), "sample-seat-work/SKILL.md")).exists())).toBe(false)
  }
  const backend = yield* agents.get("backend")
  expect((yield* skills.available(backend)).map((skill) => skill.name).toSorted()).toEqual(Seats.all.backend.skills.toSorted())
  expect(Permission.evaluate("skill", "sample-seat-work", backend.permission).action).toBe("deny")
  const maestro = yield* agents.get("maestro")
  const maestroTools = yield* registry.tools({ ...model, agent: maestro })
  expect(maestroTools.find((tool) => tool.id === "task")?.description).toContain("- sample-seat: synthetic")

  const parent = yield* sessions.create({})
  const assistant = yield* sessions.updateMessage({
    id: MessageID.ascending(), sessionID: parent.id, parentID: MessageID.ascending(), role: "assistant",
    agent: "maestro", mode: "maestro", ...model, cost: 0, path: { cwd: instance.directory, root: instance.directory },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() },
  })
  const ops: TaskPromptOps = {
    cancel: () => Effect.void,
    resolvePromptParts: (text) => Effect.succeed([{ type: "text", text }]),
    prompt: (input) => Effect.gen(function* () {
      const info = yield* sessions.updateMessage({
        ...assistant, id: MessageID.ascending(), sessionID: input.sessionID,
        parentID: input.messageID ?? MessageID.ascending(), agent: input.agent ?? "", mode: input.agent ?? "", finish: "stop",
      })
      const part = yield* sessions.updatePart({
        id: PartID.ascending(), messageID: info.id, sessionID: input.sessionID, type: "text",
        text: "```sample-seat-result\n" + JSON.stringify(card) + "\n```",
      })
      return { info, parts: [part] }
    }),
  }
  const task = yield* TaskTool
  const def = yield* task.init()
  const streamed: unknown[] = []
  const context = (sessionID: Tool.Context["sessionID"], messageID: Tool.Context["messageID"], actor: Agent.Info): Tool.Context => ({
    sessionID, messageID, agent: actor.name, agentID: actor.id,
    abort: new AbortController().signal, messages: [], extra: { promptOps: ops },
    metadata: (input) => Effect.sync(() => streamed.push(input.metadata?.workResult)).pipe(Effect.asVoid),
    ask: (request) => Effect.gen(function* () {
      const current = yield* sessions.get(sessionID)
      yield* permission.ask({ ...request, sessionID, ruleset: Permission.merge(actor.permission, current.permission ?? []) })
    }).pipe(Effect.orDie),
  })
  const ctx = context(parent.id, assistant.id, maestro)
  const first = yield* def.execute({ description: "synthetic work", prompt: "packet", subagent_type: "sample-seat", writePaths: ["src"] }, ctx)
  // This named assertion is the mutation oracle: a backend-only Task lookup loses the second seat's result contract.
  expect(first.metadata, "second-seat result binding").toHaveProperty("workResult")
  const result = "workResult" in first.metadata ? first.metadata.workResult : undefined
  expect(result).toMatchObject({ schema: "sample-seat-work-result-v1", card: { parsed: true }, ...card, writeRoots: ["src"], memory: { reads: [], writes: [] } })
  if (typeof result !== "object" || result === null || !("taskId" in result) || typeof result.taskId !== "string")
    throw new Error("second-seat logical task binding missing")
  expect(result.taskId).toMatch(/^tsk_/)
  expect(first.output).toContain(`<task id="${result.taskId}" state="completed">`)
  expect(streamed).toContainEqual(result)
  const child = yield* sessions.get(first.metadata.sessionId)
  expect(child.agent).toBe("sample-seat")
  expect(WriteRoots.read(child.permission)).toEqual([path.join(yield* Effect.promise(() => fs.realpath(instance.directory)), "src")])
  const history = yield* sessions.messages({ sessionID: child.id })
  const last = history.find((message) => message.info.role === "assistant")
  if (!last) throw new Error("missing second-seat assistant message")
  expect(BackendResult.assemble(last).card.parsed).toBe(false)
  const write = offered.find((tool) => tool.id === "write")
  if (!write) throw new Error("second-seat write tool missing")
  const childCtx = context(child.id, last.info.id, seat)
  const delegate = yield* def.execute({ description: "forbidden delegation", prompt: "packet", subagent_type: "general" }, childCtx).pipe(Effect.exit)
  expectPermissionDenied(delegate, "task", { permission: "*", pattern: "*", action: "deny" })
  const skill = offered.find((tool) => tool.id === "skill")
  if (!skill) throw new Error("second-seat skill tool missing")
  expect((yield* skill.execute({ name: "sample-seat-work" }, childCtx)).output).toContain("Work packet")
  const foreign = yield* skill.execute({ name: "backend-implement" }, childCtx).pipe(Effect.exit)
  expect(Exit.isFailure(foreign)).toBe(true)
  if (Exit.isFailure(foreign)) {
    const visible = (yield* skills.all()).map((item) => item.name).concat("sample-seat-work").toSorted()
    expect(Cause.squash(foreign.cause)).toMatchObject({ message: new Skill.NotFoundError({ name: "backend-implement", available: visible }).message })
  }
  // Also execute the host permission boundary: skill isolation must not be the only control.
  expectPermissionDenied(yield* childCtx.ask({ permission: "skill", patterns: ["backend-implement"], always: [], metadata: {} }).pipe(Effect.exit), "skill")
  yield* write.execute({ filePath: path.join(instance.directory, "src/owned.txt"), content: "owned" }, { ...childCtx, callID: "write_owned" })
  expect(yield* Effect.promise(() => Bun.file(path.join(instance.directory, "src/owned.txt")).text())).toBe("owned")
  const deniedPath = path.join(instance.directory, "src/denied.txt")
  const denyRule = { permission: "edit", pattern: path.relative(placement.worktree, deniedPath), action: "deny" as const }
  yield* sessions.setPermission({ sessionID: child.id, permission: [...child.permission ?? [], denyRule] })
  const denied = yield* write.execute({ filePath: deniedPath, content: "forbidden" }, { ...childCtx, callID: "write_denied" }).pipe(Effect.exit)
  expectPermissionDenied(denied, "edit", denyRule)
  expect(yield* Effect.promise(() => Bun.file(deniedPath).exists())).toBe(false)
  const outside = yield* write.execute({ filePath: path.join(instance.directory, "outside.txt"), content: "escape" }, { ...childCtx, callID: "write_outside" }).pipe(Effect.exit)
  expectWriteRootHold(outside)
  expect(yield* Effect.promise(() => Bun.file(path.join(instance.directory, "outside.txt")).exists())).toBe(false)
  const resumed = yield* def.execute({ description: "resume", prompt: "packet", subagent_type: "sample-seat", task_id: result.taskId }, ctx)
  expect(resumed.metadata.sessionId).toBe(child.id)
  expect("workResult" in resumed.metadata ? resumed.metadata.workResult : undefined).toMatchObject({ taskId: result.taskId, writeRoots: [] })
  expect(WriteRoots.read((yield* sessions.get(child.id)).permission)).toEqual([])
  const readOnly = yield* write.execute({ filePath: path.join(instance.directory, "src/owned.txt"), content: "changed" }, { ...childCtx, callID: "write_readonly" }).pipe(Effect.exit)
  expectWriteRootHold(readOnly)
  expect(yield* Effect.promise(() => Bun.file(path.join(instance.directory, "src/owned.txt")).text())).toBe("owned")
  const unknown = yield* def.execute({ description: "bad resume", prompt: "packet", subagent_type: "sample-seat", task_id: "tsk_unknown" }, ctx).pipe(Effect.exit)
  expect(Exit.isFailure(unknown)).toBe(true)
  if (Exit.isFailure(unknown)) expect(Cause.pretty(unknown.cause)).toContain("Task resume denied: unknown-task")
  console.log(JSON.stringify({ secondSeat: { mode: process.env.ORCHESTRA_SEAT_COMPILED === "1" ? "compiled" : "source", schema: "sample-seat-work-result-v1", taskId: result.taskId, parsed: true, resumedReadOnly: true, realPermission: true, delegateDenied: true, foreignSkillDenied: true, inRootEditDenied: true, exactSkillBytes: true } }))
}), {
  config: { agent: { "sample-seat": { name: "Config Seat", disable: true, mode: "primary", permission: { task: "allow" } } } },
})

function expectPermissionDenied(exit: Exit.Exit<unknown, unknown>, permission: string, rule?: PermissionV1.Rule) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error(`Expected PermissionDeniedError for ${permission}`)
  const error = Cause.squash(exit.cause)
  expect(error).toBeInstanceOf(PermissionV1.DeniedError)
  if (!(error instanceof PermissionV1.DeniedError)) throw new Error(`Wrong denial for ${permission}`)
  expect(error.ruleset).toContainEqual(rule ?? { permission, pattern: "*", action: "deny" })
}

function expectWriteRootHold(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Expected write-root ToolSafety HOLD")
  expect(Cause.squash(exit.cause)).toBeInstanceOf(ToolSafety.Denied)
  expect(Cause.squash(exit.cause)).toMatchObject({ reason: "write-outside-physical-roots" })
}
