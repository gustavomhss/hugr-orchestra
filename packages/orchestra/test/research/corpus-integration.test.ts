import { describe, expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { SessionProjector } from "@orchestra/core/session/projector"
import { FSUtil } from "@orchestra/core/fs-util"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ResearchRecords } from "@orchestra/core/research/records"
import { ResearchArtifacts } from "@orchestra/core/research/artifacts"
import { ResearchBinding } from "@orchestra/core/research/binding"
import { Research } from "@orchestra/schema/research"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Agent } from "@/agent/agent"
import { Git } from "@/git"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Permission } from "@/permission"
import { LogicalTask } from "@/maestro/logical-task"
import { DiscoveryResult } from "@/maestro/discovery-result"
import { ResearchExecution } from "@/research/allowance"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { Tool } from "@/tool/tool"
import { ToolRegistry } from "@/tool/registry"
import { HttpApiApp } from "@/server/routes/instance/httpapi/server"
import { TestAppNodeBuilder } from "../fixture/app-node-builder"
import { TestInstance } from "../fixture/fixture"
import { testEffect, testEffectShared } from "../lib/effect"

const layer = TestAppNodeBuilder.build(LayerNode.group([
  ToolRegistry.node, Session.node, ResearchExecution.node, ResearchRecords.node, ResearchArtifacts.node,
  Agent.node, Permission.node, FSUtil.node, Database.node, SessionProjector.node,
  EventV2Bridge.node,
  Git.node,
]))
const it = testEffect(layer)
const http = testEffectShared(layer)

const setup = Effect.fn("ResearchIntegration.setup")(function* () {
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
  const tools = yield* registry.tools({ agent, providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") })
  const user = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID: child.id, role: "user", agent: "jimmy",
    model: { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test") }, time: { created: Date.now() } })
  const assistant = { id: MessageID.ascending(), sessionID: child.id, role: "assistant" as const, parentID: user.id,
    agent: "jimmy", mode: "subagent", path: { cwd: instance.directory, root: instance.directory },
    providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-test"), cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: Date.now() } }
  yield* sessions.updateMessage(assistant)
  const execution = yield* ResearchExecution.Service
  const context = (callID: string): Tool.Context => ({
    sessionID: child.id, messageID: assistant.id, callID, agent: agent.name, agentID: "jimmy", permission: agent.permission,
    abort: AbortSignal.any([]), messages: [], metadata: () => Effect.void,
    ask: (request) => permission.ask({ ...request, sessionID: child.id, tool: { messageID: assistant.id, callID }, ruleset: agent.permission }).pipe(Effect.orDie),
  })
  const parts = new Map<string, PartID>()
  const run = (name: string, args: unknown, callID: string = PartID.ascending(), dispatch = "integration-dispatch") => Effect.gen(function* () {
    const tool = tools.find((candidate) => candidate.id === name)
    if (!tool) throw new Error(`Missing native research tool: ${name}`)
    const id = parts.get(callID) ?? PartID.ascending()
    parts.set(callID, id)
    const part = { type: "tool" as const, id, sessionID: child.id, messageID: assistant.id, callID, tool: name,
      state: { status: "running" as const, input: {}, time: { start: Date.now() } } }
    yield* sessions.updatePart(part)
    const result = yield* execution.enter(child.id, dispatch, tool.execute(args, context(callID)))
    yield* sessions.updatePart({ ...part, state: { status: "completed", input: {}, title: result.title, output: result.output,
      metadata: result.metadata, time: { start: part.state.time.start, end: Date.now() } } })
    return result
  })
  return { sessions, child, authority, assistant, tools, run, context, execution, directory: instance.directory }
})

function source(result: Tool.ExecuteResult) {
  return Schema.decodeUnknownSync(Research.SourceReceipt)(result.metadata.researchSource)
}

const Opened = Schema.Struct({ question: Research.RecordRef, subquestions: Schema.Array(Research.RecordRef) })

describe("native research vertical slice", () => {
  http.instance("ordinary read retains actual bytes and original range; publication, decoder and HTTP reopen same document", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const records = yield* ResearchRecords.Service
    yield* fs.writeFileString(path.join(fixture.directory, "observed.txt"), "before\r\nonly version 1\r\nafter\r\n")
    const result = yield* fixture.run("read", { filePath: "observed.txt", offset: 2, limit: 1 })
    const retained = source(result)
    expect(retained.observed).toMatchObject({ lineStart: 2, lineEnd: 2 })
    expect(retained.complete).toBe(false)
    expect(retained.derivedFrom).toBeDefined()
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const page = yield* records.view(binding, { action: "source", ref: retained.ref })
    expect("text" in page && page.text).toBe("only version 1")
    if (!retained.derivedFrom) throw new Error("Expected received-byte provenance")
    const original = yield* records.view(binding, { action: "source", ref: retained.derivedFrom })
    expect("text" in original && original.text).toBe("before\r\nonly version 1\r\nafter\r\n")
    const evidence: Research.EvidenceRef = { source: retained.ref, locator: { kind: "lines", start: 1, end: 1 } }
    const document = yield* fixture.run("research_record", { action: "document", document: {
      genre: "answer", title: "Qualified answer", body: "Works only in version 1 [source](research:observed).",
      findingRefs: [], citations: { observed: evidence },
    } })
    const mutation = Schema.decodeUnknownSync(Schema.Struct({ document: Research.DocumentReceipt }))(document.metadata.research)
    const message = { info: { ...fixture.assistant, finish: "stop", time: { ...fixture.assistant.time, completed: Date.now() } },
      parts: [{ id: PartID.ascending(), sessionID: fixture.child.id, messageID: fixture.assistant.id, type: "text" as const, text: "Inquiry closed." }] }
    // Before inquiry close no card exists, whatever the worker writes: a fenced v1 card in its text is never parsed.
    const fenced = `\u0060\u0060\u0060jimmy-result\n${JSON.stringify({ answer: "Version 1.", profile: "understand", depth: "quick", sufficiency: "answered",
      findingRefs: [], evidenceRefs: [evidence], documentRefs: [mutation.document.ref], coverage: { examined: [], excluded: [], failures: [] },
      limitations: [], nextActions: [] })}\n\u0060\u0060\u0060`
    yield* Effect.forEach(["Missing final card", fenced, `${fenced}\n${fenced}`, fenced.replace("jimmy-result", "backend-result")], (text) => Effect.gen(function* () {
      const rejected = yield* DiscoveryResult.assemble({ ...message, parts: [{ ...message.parts[0], text }] }, [])
      expect(rejected.card.parsed).toBe(false)
      expect(rejected.referencesChecked).toBe(false)
      expect(rejected.discovery).toBeUndefined()
      expect(rejected.outcome).toBeUndefined()
      expect(rejected.risks[0]).toStartWith("Inquiry not closed")
      expect(rejected.corpus?.documents).toEqual([mutation.document])
      expect(rejected.terminal.reason).toBe("ended")
    }), { discard: true })
    const opened = Schema.decodeUnknownSync(Opened)((yield* fixture.run("inquiry", { action: "open", question: "Which version applies?",
      subquestions: ["Which version does observed.txt name"], profile: "understand" })).metadata.inquiry)
    // The retained range holds original line 2 only.
    yield* fixture.run("inquiry", { action: "claim", subquestion: opened.subquestions[0], proposition: "observed.txt names version 1",
      nature: "extraction", evidence: [{ source: retained.ref, lines: { start: 2, end: 2 } }] })
    expect((yield* fixture.run("inquiry", { action: "check" })).output).toContain("\"verdict\":\"pass\"")
    yield* fixture.run("inquiry", { action: "close", sufficiency: "answered", answer: "Version 1 applies.", limitations: ["No runtime observation"] })
    const envelope = yield* DiscoveryResult.assemble(message, [])
    expect(envelope).toMatchObject({ outcome: "done", card: { parsed: true }, referencesChecked: true, terminal: { reason: "ended" },
      discovery: { schema: "jimmy-card-v2", sufficiency: "answered", answer: "Version 1 applies.", limitations: ["No runtime observation"],
        check: { verdict: "pass" }, documentRefs: [mutation.document.ref],
        claims: [{ evidence: [{ source: retained.ref, locator: { kind: "lines", start: 2, end: 2 } }] }] } })
    expect(envelope.documents).toEqual([mutation.document])
    expect(envelope.corpus?.documents).toEqual([mutation.document])
    // A later dispatch of the same Task closes its own inquiry; its blocked card is the one the parent reads.
    yield* fixture.run("inquiry", { action: "open", question: "Does it run?", subquestions: ["Does observed.txt run"], profile: "understand" }, undefined, "integration-blocked")
    yield* fixture.run("inquiry", { action: "check" }, undefined, "integration-blocked")
    yield* fixture.run("inquiry", { action: "close", sufficiency: "blocked", answer: "No runtime is available." }, undefined, "integration-blocked")
    expect(yield* DiscoveryResult.assemble(message, [])).toMatchObject({ outcome: "blocked", card: { parsed: true },
      discovery: { sufficiency: "blocked" }, terminal: { reason: "ended" } })
    const foreign = yield* fixture.sessions.create({ agent: "jimmy", parentID: fixture.authority.id })
    yield* LogicalTask.ensure({ executionSessionID: foreign.id, authoritySessionID: fixture.authority.id,
      projectID: foreign.projectID, memberID: "jimmy", source: "host" })
    const request = (sessionID: string) => HttpApiApp.webHandler().handler(new Request(
      `http://localhost/api/session/${sessionID}/research/${mutation.document.artifact.id}?revision=1`,
      { headers: { "x-orchestra-directory": fixture.directory } },
    ), HttpApiApp.context)
    const response = yield* Effect.promise(() => request(fixture.child.id))
    const responseBody = yield* Effect.promise(() => response.json())
    expect({ status: response.status, body: responseBody }).toMatchObject({ status: 200 })
    const fetched = Schema.decodeUnknownSync(Research.ArtifactPage)(responseBody)
    expect(fetched.text).toBe("Works only in version 1 [source](research:observed).")
    expect(fetched.receipt).toEqual(mutation.document)
    expect((yield* Effect.promise(() => request(fixture.authority.id))).status).toBe(404)
    expect((yield* Effect.promise(() => request(foreign.id))).status).toBe(404)
    const artifacts = yield* ResearchArtifacts.Service
    yield* artifacts.remove(binding)
    expect((yield* Effect.promise(() => request(fixture.child.id))).status).toBe(503)
    expect((yield* Effect.promise(() => request(foreign.id))).status).toBe(404)
    yield* fixture.sessions.remove(fixture.authority.id)
    expect((yield* records.view(binding, { action: "source", ref: retained.ref }).pipe(Effect.flip)).code).toBe("not_found")
  }))

  it.instance("capture reuses native read safety, refuses secrets and .env aliases; failures are durable attempts", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    yield* fs.writeFileString(path.join(fixture.directory, "public.txt"), "permitted evidence")
    expect(source(yield* fixture.run("research_capture", { kind: "file", path: "public.txt" })).bytes).toBeGreaterThan(0)
    yield* fs.writeFileString(path.join(fixture.directory, "never.txt"), "protected")
    const denied = yield* fixture.run("research_capture", { kind: "file", path: "never.txt" }).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { neverTouch: ["never.txt"] }), Effect.exit,
    )
    expect(Exit.isFailure(denied) && Cause.pretty(denied.cause)).toContain("project-never-touch")
    yield* fs.writeFileString(path.join(fixture.directory, "secret.txt"), "gh" + "p_" + "Q".repeat(40))
    const secret = yield* fixture.run("research_capture", { kind: "file", path: "secret.txt" }).pipe(Effect.exit)
    expect(Exit.isFailure(secret) && Cause.pretty(secret.cause)).toContain("recognized-secret-output")
    yield* fs.writeFileString(path.join(fixture.directory, ".env"), "UNRECOGNIZED_SECRET=private")
    yield* fs.symlink(path.join(fixture.directory, ".env"), path.join(fixture.directory, "alias.txt"))
    expect(Exit.isFailure(yield* fixture.run("research_capture", { kind: "file", path: "alias.txt" }).pipe(Effect.exit))).toBe(true)
    const attempts = yield* fixture.run("research_view", { action: "attempts" })
    const decoded = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Struct({ attempts: Schema.Array(Research.AttemptReceipt) })))(attempts.output)
    expect(decoded.attempts.some((attempt) => attempt.outcome === "captured")).toBe(true)
    expect(decoded.attempts.filter((attempt) => attempt.outcome === "unavailable")).toHaveLength(3)
    expect(fixture.tools.some((tool) => ["bash", "edit", "task", "arsenal_execute"].includes(tool.id))).toBe(false)
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("URL capture retains received HTML before conversion and records failed acquisition", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ port: 0, fetch: (request) =>
      new URL(request.url).pathname === "/missing" ? new Response("Missing", { status: 404 })
        : new Response("<h1>Only version 1</h1><script>untrusted()</script>", { headers: { "content-type": "text/html" } }),
    })), (server) => Effect.sync(() => server.stop(true)))
    const dedicated = source(yield* fixture.run("research_capture", { kind: "url", url: server.url.href, format: "text" }))
    expect(dedicated.transformation).toBe("webfetch-text-v1")
    expect(dedicated.derivedFrom).toBeDefined()
    expect(Exit.isFailure(yield* fixture.run("research_capture", { kind: "url", url: new URL("/missing", server.url).href, format: "text" }).pipe(Effect.exit))).toBe(true)
    const attempts = yield* fixture.run("research_view", { action: "attempts" })
    expect(attempts.output).toContain('"outcome":"unavailable"')
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("exact native file/URL retry returns historical evidence without reacquisition; conflicting and failed retries stop", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const records = yield* ResearchRecords.Service
    const file = path.join(fixture.directory, "retry.txt")
    yield* fs.writeFileString(file, "historical file bytes")
    const first = source(yield* fixture.run("read", { filePath: "retry.txt" }, "exact-read"))
    yield* fs.remove(file)
    const replay = yield* fixture.run("read", { filePath: "retry.txt" }, "exact-read")
    expect(source(replay)).toEqual(first)
    expect(replay.metadata.researchReplay).toBe(true)
    expect(replay.output).toContain("historical file bytes")
    expect(Exit.isFailure(yield* fixture.run("read", { filePath: "different.txt" }, "exact-read").pipe(Effect.exit))).toBe(true)
    const state = { calls: 0 }
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ port: 0, fetch: () => {
      state.calls++
      return state.calls === 1 ? new Response("historical response", { headers: { "content-type": "text/plain" } }) : new Response("Missing", { status: 404 })
    } })), (server) => Effect.sync(() => server.stop(true)))
    const fetched = source(yield* fixture.run("research_capture", { kind: "url", url: server.url.href, format: "text" }, "exact-fetch"))
    const cached = yield* fixture.run("research_capture", { kind: "url", url: server.url.href, format: "text" }, "exact-fetch")
    expect(source(cached)).toEqual(fetched)
    expect(state.calls).toBe(1)
    expect(Exit.isFailure(yield* fixture.run("research_capture", { kind: "url", url: server.url.href, format: "text" }, "failed-fetch").pipe(Effect.exit))).toBe(true)
    expect(Exit.isFailure(yield* fixture.run("research_capture", { kind: "url", url: server.url.href, format: "text" }, "failed-fetch").pipe(Effect.exit))).toBe(true)
    expect(state.calls).toBe(2)
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const corpus = yield* records.view(binding, { action: "corpus" })
    expect("sources" in corpus && corpus.sources.length).toBe(4)
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("over-cap observed prefix cannot authenticate a later selected line", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const records = yield* ResearchRecords.Service
    yield* fs.writeFileString(path.join(fixture.directory, "late-line.txt"), "before\n" + "x".repeat(Research.Limits.sourceBytes) + "\nqualifier beyond retained prefix\n")
    const result = yield* fixture.run("read", { filePath: "late-line.txt", offset: 3, limit: 1 }).pipe(Effect.exit)
    expect(Exit.isFailure(result) && Cause.pretty(result.cause)).toContain("Observed file bytes exceed retained source limit")
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const corpus = yield* records.view(binding, { action: "corpus" })
    if (!("sources" in corpus)) throw new Error("Expected actual corpus inventory")
    expect(corpus.sources).toHaveLength(1)
    expect(corpus.sources[0]).toMatchObject({ bytes: Research.Limits.sourceBytes, complete: false, ref: { representation: "received" } })
    const attempts = yield* records.view(binding, { action: "attempts" })
    expect("attempts" in attempts && attempts.attempts).toMatchObject([{ outcome: "partial", returned: false, reason: "over_cap" }])
    yield* fixture.sessions.remove(fixture.authority.id)
  }))

  it.instance("finite native Git history keeps exact commit identity, bounded log and read-only permissions", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const records = yield* ResearchRecords.Service
    const file = path.join(fixture.directory, "history.txt")
    yield* fs.writeFileString(file, "first line\n")
    expect((yield* git.run(["add", "--", "history.txt"], { cwd: fixture.directory })).exitCode).toBe(0)
    expect((yield* git.run(["commit", "-m", "fixture: first history"], { cwd: fixture.directory })).exitCode).toBe(0)
    const base = (yield* git.run(["rev-parse", "HEAD"], { cwd: fixture.directory })).text().trim()
    yield* fs.writeFileString(file, "changed line\n")
    expect((yield* git.run(["add", "--", "history.txt"], { cwd: fixture.directory })).exitCode).toBe(0)
    expect((yield* git.run(["commit", "-m", "fixture: change history"], { cwd: fixture.directory })).exitCode).toBe(0)
    const before = yield* git.status(fixture.directory)
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const shown = source(yield* fixture.run("research_capture", { kind: "history", operation: "show", path: "history.txt", revision: base }))
    expect(shown.origin.revision).toBe(base)
    const page = yield* records.view(binding, { action: "source", ref: shown.ref })
    expect("text" in page && page.text).toContain('"text":"first line\\n"')
    const log = source(yield* fixture.run("research_capture", { kind: "history", operation: "log", path: "history.txt", limit: 1 }))
    expect(log.complete).toBe(false)
    const diff = source(yield* fixture.run("research_capture", { kind: "history", operation: "diff", path: "history.txt", base }))
    const patch = yield* records.view(binding, { action: "source", ref: diff.ref })
    expect("text" in patch && patch.text).toContain("+changed line")
    expect(yield* git.status(fixture.directory)).toEqual(before)
    for (const input of [
      { kind: "history", operation: "show", path: ".env", revision: base },
      { kind: "history", operation: "show", path: "../outside.txt", revision: base },
      { kind: "history", operation: "show", path: "history.txt", revision: "--help" },
      { kind: "history", operation: "show", path: "missing.txt", revision: base },
    ]) expect(Exit.isFailure(yield* fixture.run("research_capture", input).pipe(Effect.exit))).toBe(true)
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })

  it.instance("Git blame, range compare and commit search stay finite, full-hash and read-gated", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const records = yield* ResearchRecords.Service
    const commit = (message: string, files: Record<string, string>) => Effect.gen(function* () {
      yield* Effect.forEach(Object.entries(files), ([name, body]) => Effect.gen(function* () {
        yield* fs.ensureDir(path.dirname(path.join(fixture.directory, name)))
        yield* fs.writeFileString(path.join(fixture.directory, name), body)
      }), { discard: true })
      expect((yield* git.run(["add", "--", ...Object.keys(files)], { cwd: fixture.directory })).exitCode).toBe(0)
      expect((yield* git.run(["commit", "-m", message], { cwd: fixture.directory })).exitCode).toBe(0)
      return (yield* git.run(["rev-parse", "HEAD"], { cwd: fixture.directory })).text().trim()
    })
    const first = yield* commit("fixture: add parser", { "src/parser.ts": "one\ntwo\n", "src/lexer.ts": "lex\n" })
    const second = yield* commit("Fix: Parser regression", { "src/parser.ts": "one\nTWO\nthree\n", "docs/notes.md": "notes\n" })
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const structured = (receipt: Research.SourceReceipt) => records.view(binding, { action: "source", ref: receipt.ref }).pipe(
      Effect.map((page) => JSON.parse("text" in page ? page.text : "{}")))
    const before = yield* git.status(fixture.directory)

    const blame = source(yield* fixture.run("research_capture", { kind: "history", operation: "blame", path: "src/parser.ts", start: 2, end: 3 }))
    expect(blame).toMatchObject({ complete: true, origin: { revision: second } })
    expect((yield* structured(blame)).lines).toMatchObject([
      { line: 2, commit: second, summary: "Fix: Parser regression", content: "TWO" },
      { line: 3, commit: second, content: "three" },
    ])
    const older = yield* structured(source(yield* fixture.run("research_capture",
      { kind: "history", operation: "blame", path: "src/parser.ts", revision: first })))
    expect(older.lines.map((line: { commit: string }) => line.commit)).toEqual([first, first])
    expect(typeof older.lines[0].authorTime).toBe("number")

    const patch = source(yield* fixture.run("research_capture", { kind: "history", operation: "compare", base: first, paths: ["src", "docs"] }))
    const compared = yield* structured(patch)
    expect(compared).toMatchObject({ complete: true, base: first, revision: second, files: ["docs/notes.md", "src/parser.ts"] })
    expect(compared.text).toContain("+three")
    expect(compared.text).not.toContain("lexer")
    const stat = yield* structured(source(yield* fixture.run("research_capture",
      { kind: "history", operation: "compare", base: first, paths: ["src/parser.ts"], stat: true })))
    expect(stat.files).toEqual([{ path: "src/parser.ts", added: 2, deleted: 1 }])

    const found = source(yield* fixture.run("research_capture", { kind: "history", operation: "search", message: "parser" }))
    expect((yield* structured(found)).commits.map((entry: { commit: string }) => entry.commit)).toEqual([second, first])
    const bounded = source(yield* fixture.run("research_capture", { kind: "history", operation: "search", message: "parser", limit: 1 }))
    expect(bounded.complete).toBe(false)
    expect((yield* structured(bounded)).commits).toMatchObject([{ commit: second, summary: "Fix: Parser regression" }])
    const byPath = yield* structured(source(yield* fixture.run("research_capture", { kind: "history", operation: "search", path: "src/lexer.ts" })))
    expect(byPath.commits.map((entry: { commit: string }) => entry.commit)).toEqual([first])
    expect(yield* git.status(fixture.directory)).toEqual(before)

    const secret = yield* commit("fixture: config", { "cfg/app.txt": "app\n", "cfg/.env": "TOKEN=x\n" })
    yield* commit("fixture: many files", Object.fromEntries(Array.from({ length: 101 }, (_, index) => [`bulk/${index}.txt`, `${index}\n`])))
    for (const input of [
      { kind: "history", operation: "blame", path: "src/parser.ts", revision: second.slice(0, 12) },
      { kind: "history", operation: "blame", path: "src/parser.ts", start: 3, end: 2 },
      { kind: "history", operation: "blame", path: "../outside.txt" },
      { kind: "history", operation: "compare", base: first.slice(0, 7), paths: ["src"] },
      { kind: "history", operation: "compare", base: first, paths: ["../outside"] },
      { kind: "history", operation: "compare", base: first, paths: [] },
      { kind: "history", operation: "compare", base: first, paths: Array.from({ length: 17 }, (_, index) => `src/${index}.ts`) },
      { kind: "history", operation: "compare", base: second, revision: secret, paths: ["cfg"] },
      { kind: "history", operation: "compare", base: secret, paths: ["bulk"] },
      { kind: "history", operation: "search" },
      { kind: "history", operation: "search", message: "parser", limit: 51 },
      { kind: "history", operation: "search", message: "parser", revision: "HEAD" },
      { kind: "history", operation: "search", path: "../outside" },
    ]) expect(Exit.isFailure(yield* fixture.run("research_capture", input).pipe(Effect.exit))).toBe(true)
    yield* fixture.sessions.remove(fixture.authority.id)
  }), { git: true })

  it.instance("partial received UTF-8 scalar preserves a valid projection; unpersisted view invocation is refused", () => Effect.gen(function* () {
    const fixture = yield* setup()
    const fs = yield* FSUtil.Service
    const records = yield* ResearchRecords.Service
    yield* fs.writeFileString(path.join(fixture.directory, "unicode.txt"), "x\n".repeat(32767) + "a😀\n")
    const retained = source(yield* fixture.run("read", { filePath: "unicode.txt", offset: 1, limit: 1 }))
    const binding = yield* ResearchBinding.resolve(fixture.child.id, fixture.child.projectID)
    const page = yield* records.view(binding, { action: "source", ref: retained.ref })
    expect("text" in page && page.text).toBe("x")
    expect(retained.derivedFrom).toBeDefined()
    const view = fixture.tools.find((tool) => tool.id === "research_view")
    if (!view) throw new Error("Expected actual native retained-read tool")
    const forged = yield* fixture.execution.enter(fixture.child.id, "integration-dispatch", view.execute({ action: "source", ref: retained.ref },
      fixture.context("forged-unpersisted-call"))).pipe(Effect.exit)
    expect(Exit.isFailure(forged) && Cause.pretty(forged.cause)).toContain("Native assistant/tool part does not match")
    expect((yield* fixture.run("research_view", { action: "source", ref: retained.ref })).output).toContain('"text":"x"')
    yield* fs.writeFile(path.join(fixture.directory, "bad.txt"), new Uint8Array([0x78, 0xff, 0x0a]))
    const malformed = yield* fixture.run("read", { filePath: "bad.txt" }).pipe(Effect.exit)
    expect(Exit.isFailure(malformed) && Cause.pretty(malformed.cause)).toContain("Observed file bytes are not supported UTF-8 text")
    const corpus = yield* records.view(binding, { action: "corpus" })
    if (!("sources" in corpus)) throw new Error("Expected admitted sources")
    expect(corpus.sources.filter((value) => value.ref.representation === "text")).toHaveLength(1)
    yield* fixture.sessions.remove(fixture.authority.id)
  }))
})
