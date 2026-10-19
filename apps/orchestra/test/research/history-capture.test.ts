import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionProjector } from "@orchestra/core/session/projector"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { Research } from "@orchestra/schema/research"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { Git } from "@/git"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { LogicalTask } from "@/maestro/logical-task"
import { ResearchExecution } from "@/research/allowance"
import { ResearchHistory } from "@/research/history"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(TestAppNodeBuilder.build(LayerNode.group([
  ToolRegistry.node, Session.node, ResearchExecution.node, ResearchRecords.node, ResearchArtifacts.node,
  Agent.node, Permission.node, FSUtil.node, Database.node, SessionProjector.node, EventV2Bridge.node, Git.node,
])))

// One jimmy execution Session under a Maestro authority; each call runs as a completed tool part the next call can see.
const setup = Effect.fn("HistoryCapture.setup")(function* () {
  const sessions = yield* Session.Service
  const agents = yield* Agent.Service
  const permission = yield* Permission.Service
  const registry = yield* ToolRegistry.Service
  const execution = yield* ResearchExecution.Service
  const instance = yield* TestInstance
  const authority = yield* sessions.create({ agent: "maestro", title: "History authority" })
  const child = yield* sessions.create({ agent: "jimmy", title: "History execution", parentID: authority.id })
  yield* LogicalTask.ensure({ executionSessionID: child.id, authoritySessionID: authority.id,
    projectID: child.projectID, memberID: "jimmy", source: "host" })
  const agent = yield* agents.get("jimmy")
  const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }
  const tools = yield* registry.tools({ agent, ...model })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: "jimmy", mode: "subagent", path: { cwd: instance.directory, root: instance.directory }, ...model, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const run = (name: string, args: unknown) => Effect.gen(function* () {
    const tool = tools.find((candidate) => candidate.id === name)
    if (!tool) throw new Error(`Missing native research tool: ${name}`)
    const callID = PartID.ascending()
    const part = { type: "tool" as const, id: PartID.ascending(), sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running" as const, input: args as Record<string, unknown>, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    const ctx: Tool.Context = {
      sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: "jimmy", permission: agent.permission,
      abort: AbortSignal.any([]), messages: yield* sessions.messages({ sessionID: child.id }), metadata: () => Effect.void,
      ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie),
    }
    const result = yield* execution.enter(child.id, "history-dispatch", tool.execute(args, ctx))
    yield* sessions.updatePart({ ...part, state: { status: "completed", input: part.state.input, title: result.title, output: result.output,
      metadata: result.metadata, time: { start: part.state.time.start, end: Date.now() } } })
    return result
  })
  return { authority, run, directory: instance.directory, sessions }
})

const source = (result: Tool.ExecuteResult) => Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource)

describe("research history environment and operations", () => {
  it.instance("history works under a redirected caller Git environment and resolves refs and working-tree status", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const records = yield* ResearchRecords.Service
    const commit = (message: string, body: string) => Effect.gen(function* () {
      yield* fs.writeFileString(path.join(fixture.directory, "tracked.txt"), body)
      expect((yield* git.run(["add", "--", "tracked.txt"], { cwd: fixture.directory })).exitCode).toBe(0)
      expect((yield* git.run(["commit", "-m", message], { cwd: fixture.directory })).exitCode).toBe(0)
      return (yield* git.run(["rev-parse", "HEAD"], { cwd: fixture.directory })).text().trim()
    })
    const first = yield* commit("fixture: first", "one\n")
    const second = yield* commit("fixture: second", "two\n")
    yield* fs.writeFileString(path.join(fixture.directory, "tracked.txt"), "dirty\n")
    yield* fs.writeFileString(path.join(fixture.directory, "new file.txt"), "untracked\n")
    const structured = (receipt: Research.SourceReceipt) => Effect.gen(function* () {
      const binding = receipt.binding
      const page = yield* records.view(binding, { action: "source", ref: receipt.ref })
      return JSON.parse("text" in page ? page.text : "{}")
    })
    // What a VS Code terminal or a Git hook leaves in the environment: before J2.14 this refused every history call.
    const redirected = { GIT_DIR: path.join(fixture.directory, "missing.git"), GIT_ASKPASS: "/nonexistent/askpass",
      GIT_INDEX_FILE: path.join(fixture.directory, "missing.index"), GIT_CONFIG_PARAMETERS: "'core.bare=true'" }
    const saved = Object.fromEntries(Object.keys(redirected).map((key) => [key, process.env[key]]))
    yield* Effect.acquireRelease(Effect.sync(() => Object.assign(process.env, redirected)), () => Effect.sync(() =>
      Object.entries(saved).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value)))

    const log = yield* structured(source(yield* fixture.run("research_capture", { kind: "history", operation: "log", path: "tracked.txt" })))
    expect(log.commits).toEqual([second, first])
    const resolved = yield* structured(source(yield* fixture.run("research_capture", { kind: "history", operation: "resolve", ref: "HEAD~1" })))
    expect(resolved).toMatchObject({ operation: "resolve", ref: "HEAD~1", commit: first, revision: first })
    const status = yield* structured(source(yield* fixture.run("research_capture", { kind: "history", operation: "status" })))
    expect(status).toMatchObject({ operation: "status", head: second, scope: "working-tree-status", dirtyWorkingTreeObserved: true })
    expect(typeof status.branch).toBe("string")
    expect(status.dirty).toEqual(expect.arrayContaining([{ path: "tracked.txt", status: ".M" }, { path: "new file.txt", status: "??" }]))
    for (const ref of ["--output=x", "HEAD;rm", "a b"])
      expect(Exit.isFailure(yield* fixture.run("research_capture", { kind: "history", operation: "resolve", ref }).pipe(Effect.exit))).toBe(true)
    expect(Exit.isFailure(yield* fixture.run("research_capture", { kind: "history", operation: "resolve", ref: "no-such-branch" })
      .pipe(Effect.exit))).toBe(true)
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })

  test("the sanitized environment drops GIT_*, NODE_OPTIONS and NODE_PATH and pins config, prompt and locks", () => {
    expect(ResearchHistory.environment({ PATH: "/bin", GIT_DIR: "/x", git_askpass: "/y", NODE_OPTIONS: "--inspect", NODE_PATH: "/n", HOME: "/h" }))
      .toEqual({ PATH: "/bin", HOME: "/h", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" })
  })
})

describe("research read dedup and original coordinates", () => {
  it.instance("an unchanged recapture returns its ref in under 200 tokens; a changed span says so; view gives original lines", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const file = path.join(fixture.directory, "span.ts")
    yield* fs.writeFileString(file, Array.from({ length: 40 }, (_, index) => index === 11 ? "const needle = 1" : `line ${index + 1}`).join("\n"))
    const span = { kind: "file", path: "span.ts", start: 10, end: 14 }
    const first = yield* fixture.run("research_capture", span)
    const captured = JSON.parse(first.output.split("\n")[0])
    expect(captured.lines).toEqual({ basis: "original", start: 10, end: 14 })

    const again = yield* fixture.run("research_capture", span)
    const repeated = JSON.parse(again.output)
    expect(repeated).toMatchObject({ unchanged: true, ref: captured.ref })
    expect(Object.keys(repeated).sort()).toEqual(["ref", "summary", "unchanged"])
    // JE-AC-EFF1's bound, at the conservative four characters per token.
    expect(again.output.length / 4).toBeLessThan(200)

    yield* fs.writeFileString(file, Array.from({ length: 40 }, (_, index) => index === 11 ? "const needle = 2" : `line ${index + 1}`).join("\n"))
    const changed = JSON.parse((yield* fixture.run("research_capture", span)).output.split("\n")[0])
    expect(changed).toMatchObject({ changed: true, previous: captured.ref, lines: { basis: "original", start: 10, end: 14 } })
    expect(changed.ref.digest).not.toBe(captured.ref.digest)

    const found = JSON.parse((yield* fixture.run("research_view", { action: "find", ref: captured.ref, query: "needle" })).output)
    expect(found).toMatchObject({ lineBasis: "original", matches: [{ line: 12 }] })
    const opened = yield* fixture.run("research_view", { action: "source", ref: captured.ref })
    expect(JSON.parse(opened.output).lines).toEqual({ basis: "original", start: 10 })
    const reopened = yield* fixture.run("research_view", { action: "source", ref: captured.ref })
    expect(JSON.parse(reopened.output)).toMatchObject({ ref: captured.ref, unchanged: true })
    expect(reopened.output).not.toContain("needle")
    expect(reopened.output.length / 4).toBeLessThan(200)
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })
})
