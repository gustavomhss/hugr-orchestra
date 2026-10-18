import { describe, expect } from "bun:test"
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { ResearchRecords } from "@orchestra/core/research/records"
import { SessionProjector } from "@orchestra/core/session/projector"
import { MaestroArsenal } from "@orchestra/core/tool/maestro-arsenal"
import { Research } from "@orchestra/schema/research"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { Agent } from "@/agent/agent"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ClaudeHostPlugin } from "@/claude-code/host/plugin"
import { LogicalTask } from "@/maestro/logical-task"
import { Permission } from "@/permission"
import { ResearchExecution } from "@/research/allowance"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { ResearchRegistry } from "@/tool/research-registry"
import { ResearchRepoTools } from "@/tool/research-repo"
import { ToolRegistry } from "@/tool/registry"
import type { Tool } from "@/tool/tool"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ToolRegistry.node, Session.node, ResearchExecution.node, ResearchRecords.node,
  Agent.node, Permission.node, FSUtil.node, Database.node, SessionProjector.node,
])))
const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }
const REPO = ["repo_git_state", "repo_map", "repo_symbols"]
// Planning and orchestration Arsenal capabilities; none may reach the discovery seat under any name.
const PLANNING = ["decompose", "plan-", "wave-", "brief-", "stub-gen", "contract-freezer", "anchor-gen", "relay-arm",
  "conflict-map", "seam-checker", "governance", "context-packer", "enrich-plan", "profile", "sliceability", "symbol-flow"]

const setup = Effect.fn("RepoIntel.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "Research authority" })
  const child = yield* sessions.create({ agent: "jimmy", title: "Research execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: "jimmy", source: "host" })
  const agent = yield* agents.get("jimmy")
  const tools = yield* registry.tools({ agent, ...model })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: "jimmy", mode: "subagent", path: { cwd: instance.directory, root: instance.directory }, ...model, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const execution = yield* ResearchExecution.Service
  const context = (callID: string): Tool.Context => ({
    sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: "jimmy", permission: agent.permission,
    abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
    ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie),
  })
  const run = (name: string, args: unknown, callID: string = PartID.ascending()) => Effect.gen(function* () {
    const tool = tools.find((candidate) => candidate.id === name)
    if (!tool) throw new Error(`Missing native research tool: ${name}`)
    const part = { type: "tool" as const, id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running" as const, input: {}, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    return yield* execution.enter(child.id, "repo-dispatch", tool.execute(args, context(callID)))
  })
  return { sessions, child, authority, tools, run, directory: instance.directory }
})

const charges = Effect.fn("RepoIntel.charges")(function* (sessionID: string) {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return rows.filter((row) => row.type === EventV2.versionedType(ResearchEvent.AllowanceCharged.type, 1))
    .map((row) => Schema.decodeUnknownSync(ResearchEvent.AllowanceCharged.data)(row.data))
})

const failure = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "succeeded"

describe("discovery repository intelligence", () => {
  it.instance("the seat sees exactly the three repository tools on Orchestra's loop and in Claude mode; no other seat does", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const ids = fixture.tools.map((tool) => tool.id)
    expect(ResearchRegistry.REPO.toSorted()).toEqual(REPO)
    expect(ids.filter((id) => REPO.includes(id) || id.startsWith("maestro_arsenal")).toSorted()).toEqual(REPO)
    expect(ids.filter((id) => PLANNING.some((name) => id.includes(name.replaceAll("-", "_"))))).toEqual([])
    // Descriptions are written for discovery; no planning vocabulary leaks from the Arsenal.
    fixture.tools.filter((tool) => REPO.includes(tool.id)).forEach((tool) =>
      expect(tool.description).not.toMatch(/\b(WPs?|work package|wave|dispatch|decompos\w*|slic\w*|brief|plan\w*|Own authority)\b/i))

    // Claude mode: the plugin subagent allow-list and the MCP server carry the same grant.
    const allowed = ClaudeHostPlugin.tools("jimmy", ids)
    expect(allowed.filter((name) => /repo_|maestro_arsenal/.test(name))).toEqual(REPO.map((id) => `mcp__${ClaudeHostMcp.NAME}__${id}`))
    expect(ClaudeHostMcp.exposed(fixture.tools).map((tool) => tool.id).filter((id) => REPO.includes(id)).toSorted()).toEqual(REPO)

    // Positive control: the registry still offers the Arsenal to Maestro, and the repository tools to nobody else.
    const agents = yield* Agent.Service
    const registry = yield* ToolRegistry.Service
    yield* Effect.forEach(["maestro", "archie", "backend", "lucy"], (id) => Effect.gen(function* () {
      const offered = (yield* registry.tools({ agent: yield* agents.get(id), ...model })).map((tool) => tool.id)
      expect(offered.filter((tool) => REPO.includes(tool))).toEqual([])
      if (id === "maestro") expect(offered).toContain(MaestroArsenal.names.execute)
    }), { discard: true })
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("results are retained, citable evidence and every call is charged to the dispatch allowance", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const records = yield* ResearchRecords.Service
    yield* fs.makeDirectory(path.join(fixture.directory, "src"), { recursive: true })
    yield* fs.writeFileString(path.join(fixture.directory, "src", "main.ts"), 'import { helper } from "./helper"\nexport const main = () => helper()\n')
    yield* fs.writeFileString(path.join(fixture.directory, "src", "helper.ts"), "export function helper() {\n  return 1\n}\n")
    yield* fs.writeFileString(path.join(fixture.directory, ".env"), "UNRECOGNIZED_SECRET=private\n")

    const mapped = yield* fixture.run("repo_map", {}, "map-call")
    const map = JSON.parse(mapped.output.slice(0, mapped.output.indexOf("\n\nRetained output evidence")))
    expect(map.entries).toContainEqual({ path: "src/helper.ts", type: "file", bytes: expect.any(Number), loc: 4 })
    // The .env read is refused by the seat's floor and named as a gap, never counted.
    expect(map.entries.some((entry: { path: string }) => entry.path === ".env")).toBe(false)
    expect(map.coverage.issues).toContainEqual({ path: ".env", reason: "read-denied" })
    expect(mapped.output).not.toContain("UNRECOGNIZED_SECRET")

    const retained = Schema.decodeUnknownSync(Research.SourceReceipt)(mapped.metadata.researchSource)
    expect(retained.origin.kind).toBe("tool-output")
    expect(mapped.output).toContain(`Retained output evidence: ${JSON.stringify(retained.ref)}`)
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const page = yield* records.view(binding, { action: "source", ref: retained.ref })
    expect("text" in page && page.text).toContain('"src/helper.ts"')
    const evidence: Research.EvidenceRef = { source: retained.ref, locator: { kind: "lines", start: 1, end: 1 } }
    const document = yield* fixture.run("research_record", { action: "document", document: {
      genre: "map", title: "Layout", body: "helper lives in src [map](research:map).", findingRefs: [], citations: { map: evidence },
    } })
    expect(Schema.decodeUnknownSync(Schema.Struct({ document: Research.DocumentReceipt }))(document.metadata.research).document).toBeDefined()

    const symbols = yield* fixture.run("repo_symbols", { path: "src" }, "symbols-call")
    expect(Schema.decodeUnknownSync(Research.SourceReceipt)(symbols.metadata.researchSource).origin.kind).toBe("tool-output")
    const derived = JSON.parse(symbols.output.slice(0, symbols.output.indexOf("\n\nRetained output evidence")))
    expect(derived.scope).toBe("src")
    expect(derived.deps).toContain("main.ts imports helper from helper.ts")
    expect(derived).not.toHaveProperty("briefs")
    expect(derived).not.toHaveProperty("distillBrief")
    expect(derived).not.toHaveProperty("memoryPath")

    const ledger = yield* charges(fixture.child.id)
    for (const call of [["map-call", "repo_map"], ["symbols-call", "repo_symbols"]]) {
      expect(ledger).toContainEqual(expect.objectContaining({ kind: "tool", dispatchCallID: "repo-dispatch", amount: 1,
        operation: expect.stringContaining(`${call[0]}:${call[1]}`) }))
      expect(ledger.some((entry) => entry.kind === "bytes" && entry.operation.includes(call[0]) && entry.amount > 0)).toBe(true)
    }
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("Git state comes only from the fixed host invocations and is retained", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const result = yield* fixture.run("repo_git_state", {}, "git-call")
    const state = JSON.parse(result.output.slice(0, result.output.indexOf("\n\nRetained output evidence")))
    // Positive control: real git under the exact host allow-list acquires every git observation.
    expect(state.failures).toEqual([])
    expect(state.observations.map((item: { name: string }) => item.name).toSorted()).toEqual(
      ["clean-tree", "disk-sane", "no-build-artifacts", "no-conflict-markers", "no-orphan-branches", "worktrees-pruned"])
    expect(state.observations.every((item: { status: string }) => item.status !== "unknown")).toBe(true)
    expect(result.metadata.researchSource).toBeDefined()
    // The seat supplies no command, root or argument.
    expect(failure(yield* fixture.run("repo_git_state", { args: ["log"] }).pipe(Effect.exit))).toContain("unknown parameter")
    expect(failure(yield* fixture.run("repo_map", { path: "../" }).pipe(Effect.exit))).toContain("REPO_SCOPE_INVALID")
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })

  it.instance("persist and every other write are refused for the seat", () => Effect.gen(function* () {
    const fixture = yield* setup()
    expect(failure(yield* fixture.run("repo_symbols", { operation: "persist" }).pipe(Effect.exit))).toContain("unknown parameter")
    const state = yield* Effect.acquireRelease(Effect.promise(() => mkdtemp(path.join(os.tmpdir(), "repo-intel-state-"))),
      (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })))
    const module = yield* Effect.promise(() => MaestroArsenal.loadArsenal())
    const host = yield* Effect.promise(async () => ({ ...(await hostFor(module.Arsenal, fixture.directory)), stateDirectory: await realpath(state) }))
    const persisted = yield* Effect.promise(() => module.Arsenal.execute("move-in", { operation: "persist" }, ResearchRepoTools.context(module.Arsenal, host)))
    expect(persisted.isError).toBe(true)
    expect(persisted.content[0].text).toContain("REPO_WRITE_DENIED")
    expect(yield* Effect.promise(() => readdir(state))).toEqual([])
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})

describe("bounded repository processes", () => {
  it.instance("a process timeout, an unlisted command and a passed deadline are named failures, never empty successes", () => Effect.gen(function* () {
    const directory = (yield* TestInstance).directory
    const module = yield* Effect.promise(() => MaestroArsenal.loadArsenal())
    const arsenal = module.Arsenal
    const host = yield* Effect.promise(() => hostFor(arsenal, directory))
    const reason = (exit: Exit.Exit<unknown, unknown>) =>
      Exit.isFailure(exit) && exit.cause.reasons.flatMap((item) => Cause.isFailReason(item) ? [item.error] : [])
        .find((error) => error instanceof ResearchRepoTools.AcquisitionFailed)?.reason

    yield* Effect.acquireRelease(Effect.sync(() => arsenal.setProcessRunner(async () =>
      ({ stdout: new Uint8Array(), stderr: new Uint8Array(), exitCode: 1, timedOut: true, overflow: false }))),
    () => Effect.sync(() => arsenal.setProcessRunner(undefined)))
    expect(reason(yield* ResearchRepoTools.observe(arsenal, "repo-hygiene-check", {}, host).pipe(Effect.exit))).toBe("PROCESS_TIMEOUT")
    arsenal.setProcessRunner(undefined)

    expect(reason(yield* ResearchRepoTools.observe(arsenal, "repo-hygiene-check", {}, { ...host, commands: new Set() }).pipe(Effect.exit)))
      .toBe("REPO_COMMAND_DENIED")
    expect(reason(yield* ResearchRepoTools.observe(arsenal, "repo-mapper", {}, { ...host, deadline: Date.now() - 1 }).pipe(Effect.exit)))
      .toBe("REPO_DEADLINE")
  }), { git: true })
})

async function hostFor(arsenal: ResearchRepoTools.Arsenal, directory: string): Promise<ResearchRepoTools.Host> {
  const root = await realpath(directory)
  return {
    directory: root,
    stateDirectory: await realpath(os.tmpdir()),
    projectID: "repo-intel",
    commands: ResearchRepoTools.commands(root, arsenal.trustedAsset("parser-worker").entry),
    denied: () => false,
    deadline: Date.now() + ResearchRepoTools.DEADLINE_MS,
    signal: new AbortController().signal,
  }
}
