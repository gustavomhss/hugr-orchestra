import { expect } from "bun:test"
import { Cause, Effect, Exit, Schema } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { WriteRoots } from "@/maestro/write-roots"
import { InstanceState } from "@/effect/instance-state"
import type { TaskPromptOps } from "@/tool/task"
import { Tool } from "@/tool/tool"
import { MaestroRecordReviewTool } from "@/tool/maestro-validation"
import { ContextRecallTool } from "@/tool/context-recall"
import { MaestroWorkflowsTool } from "@/tool/maestro-workflows"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { AuthoringGraph } from "@orchestra/relay/authoring/graph"
import { AuthoringStore } from "@orchestra/relay/authoring/store"
import { ClaudeHostOptions } from "@orchestra/engine-claude-code/host/options"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { MessageID, PartID } from "@/session/schema"
import { pollWithTimeout, testEffect } from "../../lib/effect"
import { makeHttp } from "../../session/prompt.fixture"
import { BridgeFixture } from "./bridge-fixture"

const it = testEffect(makeHttp())
const Text = Schema.Struct({ content: Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.String })), isError: Schema.optional(Schema.Boolean) })
const allow = [{ permission: "context_recall", pattern: "*", action: "allow" }] as const
const recall = Effect.flatMap(ContextRecallTool, Tool.init)

it.instance("child calls resolve their own identity, history and permissions, including after the parent's turn", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const child = yield* f.child("lucy", [...allow, { permission: "bash", pattern: "*", action: "deny" }])
  const parentMessage = yield* f.sessions.updateMessage({ id: MessageID.ascending(), sessionID: f.parent.id, role: "user", agent: "maestro",
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") }, time: { created: Date.now() } })
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.parent.id, messageID: parentMessage.id, type: "text", text: "parent private history" })
  const args = { query: "brief" }
  yield* f.call({ id: "child_recall", tool: "context_recall", args, sessionID: child.id, seat: "lucy" })
  yield* f.mirrors.get(child.id)!.finish(0)
  yield* f.live.turn!.view.finish(0)
  f.live.turn = undefined
  const part = yield* f.bridge.claim("context_recall", f.arguments("child_recall"), new AbortController().signal)
  const context = yield* f.bridge.context(part)
  expect(context.agentID).toBe("lucy")
  expect(context.agent).toBe((yield* f.agents.get("lucy"))?.name)
  expect(context.sessionID).toBe(child.id)
  expect(context.messages.length).toBeGreaterThan(0)
  expect(context.messages.every((message) => message.info.sessionID === child.id)).toBe(true)
  expect(context.messages.some((message) => message.parts.some((part) => part.type === "text" && part.text === "parent private history"))).toBe(false)
  expect(Exit.isFailure(yield* context.ask({ permission: "bash", patterns: ["echo x"], always: ["*"], metadata: {} }).pipe(Effect.exit))).toBe(true)
  const result = yield* f.bridge.execute(yield* recall, args, context)
  expect(result.output).toContain("brief for lucy")
  expect(result.output).not.toContain("parent private history")
  f.bridge.settled(part.callID)
}), 60_000)

it.instance("execution binds the real runtime profile and native placement to the child grant", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const rules = yield* WriteRoots.bind("archie", ["docs/allowed"], [])
  const child = yield* f.child("archie", rules)
  const otherRules = yield* WriteRoots.bind("archie", ["docs/other"], [])
  const other = yield* f.child("archie", otherRules)
  // A test-local observation tool reads the real services installed at the execution boundary; none are replaced.
  const probe: Tool.Def = { id: "runtime_probe", description: "Observe runtime services", parameters: Schema.Struct({ label: Schema.String }),
    execute: () => Effect.gen(function* () {
      const loader = yield* ToolSafety.RuntimeProfileLoader
      const profile = loader ? yield* loader() : undefined
      const native = yield* ToolSafety.NativeContext
      const instance = yield* InstanceState.context
      return { title: "Runtime", output: JSON.stringify({ roots: profile?.writeRoots, required: profile?.requireSandbox,
        native, directory: instance.directory }), metadata: {} }
    }).pipe(Effect.orDie) }
  const client = yield* f.client([probe])
  const Runtime = Schema.fromJsonString(Schema.Struct({ roots: Schema.Array(Schema.String), required: Schema.Boolean,
    native: Schema.Struct({ directory: Schema.String, projectID: Schema.String }), directory: Schema.String }))
  for (const [session, bound, label] of [[child, rules, "one"], [other, otherRules, "two"]] as const) {
    yield* f.call({ id: label, tool: "runtime_probe", args: { label }, sessionID: session.id, seat: "archie" })
    const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "runtime_probe", arguments: f.arguments(label) })))
    expect(Schema.decodeUnknownSync(Runtime)(result.content[0].text)).toEqual({ roots: WriteRoots.read(bound) ?? [], required: true,
      native: { directory: session.directory, projectID: session.projectID }, directory: session.directory })
    f.bridge.release(label)
  }
  yield* WriteRoots.rebind(f.sessions, child, otherRules)
  yield* f.call({ id: "rebound", tool: "runtime_probe", args: { label: "one" }, sessionID: child.id, seat: "archie" })
  const rebound = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "runtime_probe", arguments: f.arguments("rebound") })))
  expect(Schema.decodeUnknownSync(Runtime)(rebound.content[0].text).roots).toEqual(WriteRoots.read(otherRules) ?? [])
}), 60_000)

it.instance("a native lucy MCP review passes the review tool's identity and child-session checks", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const child = yield* f.child("lucy")
  const reviewer = yield* f.agents.get("lucy")
  expect(reviewer).toMatchObject({ id: "lucy", native: true })
  expect(yield* f.sessions.get(child.id)).toMatchObject({ agent: reviewer.id, parentID: f.parent.id })
  const args = { validationRecordID: "missing-validation", workCard: "card", reviewMethodVersion: "1", verdict: "APPROVE",
    findings: [], artifact: { baseSHA: "base", headSHA: "head", worktree: f.ctx.directory, changedPaths: [], sha256: "hash" }, checks: [] }
  const part = yield* f.call({ id: "record_review", tool: "maestro_record_review", args, sessionID: child.id, seat: "lucy" })
  const author = (yield* f.sessions.messages({ sessionID: child.id })).find((message) => message.info.id === part.messageID)
  expect(author?.info).toMatchObject({ role: "assistant", agent: reviewer.id, sessionID: child.id })
  const review = yield* Effect.flatMap(MaestroRecordReviewTool, Tool.init)
  const observed = { called: false }
  const checked: typeof review = { ...review, execute: (args, context) => Effect.gen(function* () {
    expect(context).toMatchObject({ agentID: reviewer.id, agent: reviewer.name, sessionID: child.id, messageID: part.messageID, callID: part.callID })
    observed.called = true
    const exit = yield* Effect.exit(review.execute(args, context))
    if (Exit.isFailure(exit)) {
      expect(Cause.squash(exit.cause)).toMatchObject({ _tag: "MaestroReviewRejected", reason: "validation-not-found" })
      return yield* Effect.failCause(exit.cause)
    }
    return exit.value
  }) }
  const client = yield* f.client([checked])
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "maestro_record_review", arguments: f.arguments("record_review") })))
  expect(observed.called).toBe(true)
  // No validation was admitted. A governance refusal reaches the model with its cause, not as the owner's rejection.
  expect(result.isError).toBe(true)
  expect(result.content[0].text).toBe("MaestroReviewRejected: validation-not-found")
  expect(result.content[0].text).not.toContain("Review recording requires")
}), 60_000)

it.instance("reversed same-tool arrivals bind results to the exact child call and its accepted arguments", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const lucy = yield* f.child("lucy", [...allow])
  const archie = yield* f.child("archie", [...allow])
  yield* f.call({ id: "lucy_recall", tool: "context_recall", args: { query: "brief for lucy" }, sessionID: lucy.id, seat: "lucy" })
  yield* f.call({ id: "archie_recall", tool: "context_recall", args: { query: "brief for archie" }, sessionID: archie.id, seat: "archie" })
  const client = yield* f.client([yield* recall])
  const archieResult = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("archie_recall") })))
  const lucyResult = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("lucy_recall") })))
  expect(archieResult.isError).toBeUndefined()
  expect(lucyResult.isError).toBeUndefined()
  for (const [child, id, expected] of [[archie, "archie_recall", "brief for archie"], [lucy, "lucy_recall", "brief for lucy"]] as const) {
    const part = (yield* f.sessions.messages({ sessionID: child.id })).flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.callID === id)
    expect(part?.type === "tool" && part.state.status === "completed" && part.state.output).toContain(expected)
  }
}), 60_000)

it.instance("identical concurrent calls, unreserved calls and changed arguments fail closed", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const first = yield* f.child("lucy", [...allow])
  const second = yield* f.child("archie", [...allow])
  yield* f.call({ id: "same_first", tool: "context_recall", args: { query: "same" }, sessionID: first.id, seat: "lucy" })
  yield* f.call({ id: "same_second", tool: "context_recall", args: { query: "same" }, sessionID: second.id, seat: "archie" })
  const client = yield* f.client([yield* recall])
  for (const query of ["same", "unreserved"]) {
    const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: { query } })))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("ambiguous")
  }
  const part = yield* f.call({ id: "mismatch", tool: "context_recall", args: { query: "original" } })
  yield* f.bridge.complete({ ...part, state: { ...part.state, input: { query: "tampered" } } })
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("mismatch") })))
  expect(result.isError).toBe(true)
  expect(result.content[0].text).toContain("does not match its accepted dispatch")
  for (const [child, id] of [[first, "same_first"], [second, "same_second"]] as const) {
    expect((yield* f.sessions.messages({ sessionID: child.id })).flatMap((message) => message.parts)
      .some((part) => part.type === "tool" && part.state.status === "completed")).toBe(false)
    const accepted = yield* f.bridge.claim("context_recall", f.arguments(id), new AbortController().signal)
    expect((yield* f.bridge.context(accepted)).sessionID).toBe(child.id)
  }
}), 60_000)

it.instance("released receipts cannot steal identical later dispatches and accepted rewrites are validated", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  yield* f.sessions.setPermission({ sessionID: f.parent.id, permission: [...allow] })
  yield* f.call({ id: "old", tool: "context_recall", args: { query: "brief" } })
  const old = f.arguments("old")
  f.bridge.release("old")
  yield* f.call({ id: "new", tool: "context_recall", args: { query: "brief" } })
  const client = yield* f.client([yield* recall])
  const stale = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: old })))
  expect(stale.isError).toBe(true)
  expect(f.mirrors.get(f.parent.id)?.tool("new")?.state.status).toBe("running")
  const substituted = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: { ...f.arguments("new"), query: "changed" } })))
  expect(substituted.isError).toBe(true)
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("new") })))
  expect(result.isError).toBeUndefined()
  expect((yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("new") }))).isError).toBe(true)
  yield* f.call({ id: "rewritten", tool: "context_recall", args: { query: "original" }, accepted: { query: "brief" } })
  const rewritten = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("rewritten") })))
  expect(rewritten.isError).toBeUndefined()
  expect(rewritten.content[0].text).toContain("brief for maestro")
  const part = f.mirrors.get(f.parent.id)?.tool("rewritten")
  expect(part?.state.input).toEqual({ query: "brief" })
  expect(part?.state.input).not.toHaveProperty(ClaudeHostMcp.DISPATCH)
}), 60_000)

it.instance("a cancelled reservation cannot run or steal another child's same-tool call", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const signal = new AbortController()
  yield* f.call({ id: "cancelled", tool: "context_recall", args: { query: "cancelled" }, signal: signal.signal })
  yield* f.call({ id: "untouched", tool: "context_recall", args: { query: "untouched" } })
  signal.abort()
  expect(Exit.isFailure(yield* f.bridge.claim("context_recall", f.arguments("cancelled"), new AbortController().signal).pipe(Effect.exit))).toBe(true)
  expect((yield* f.bridge.claim("context_recall", f.arguments("untouched"), new AbortController().signal)).callID).toBe("untouched")
}), 60_000)

it.instance("turn interruption cancels a real MCP tool's permission wait and frees the request", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const child = yield* f.child("lucy", [{ permission: "context_recall", pattern: "*", action: "ask" }])
  yield* f.call({ id: "waiting", tool: "context_recall", args: { query: "brief" }, sessionID: child.id, seat: "lucy" })
  const client = yield* f.client([yield* recall])
  const response = client.callTool({ name: "context_recall", arguments: f.arguments("waiting") })
  const request = yield* pollWithTimeout(f.permission.list().pipe(Effect.map((requests) => requests.find((request) => request.sessionID === child.id))),
    "the real tool never asked permission", "5 seconds")
  expect(request.tool?.callID).toBe("waiting")
  f.bridge.interrupt()
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => response))
  expect(result.isError).toBe(true)
  expect(result.content[0].text).toContain("cancelled")
  expect((yield* f.permission.list()).some((request) => request.sessionID === child.id)).toBe(false)
  const part = f.mirrors.get(child.id)?.tool("waiting")
  expect(part?.state.status).toBe("error")
}), 60_000)

it.instance("child interruption cancels its permission wait while another child's call stays live", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const rules = [{ permission: "context_recall", pattern: "*", action: "ask" }] as const
  const first = yield* f.child("lucy", [...rules])
  const second = yield* f.child("archie", [...rules])
  const client = yield* f.client([yield* recall])
  yield* f.call({ id: "stop_child", tool: "context_recall", args: { query: "brief" }, sessionID: first.id, seat: "lucy" })
  yield* f.call({ id: "keep_child", tool: "context_recall", args: { query: "brief" }, sessionID: second.id, seat: "archie" })
  const stopped = client.callTool({ name: "context_recall", arguments: f.arguments("stop_child") })
  const kept = client.callTool({ name: "context_recall", arguments: f.arguments("keep_child") })
  yield* pollWithTimeout(f.permission.list().pipe(Effect.map((requests) => requests.length === 2 ? true : undefined)),
    "the child tools never reached their permission waits", "5 seconds")
  f.bridge.interrupt(first.id)
  expect(Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => stopped)).isError).toBe(true)
  const pending = yield* f.permission.list()
  expect(pending.map((request) => request.sessionID)).toEqual([second.id])
  expect(f.mirrors.get(second.id)?.tool("keep_child")?.state.status).toBe("running")
  yield* f.permission.reply({ requestID: pending[0].id, reply: "once" })
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => kept))
  expect(result.isError).toBeUndefined()
  expect(result.content[0].text).toContain("brief for archie")
}), 60_000)

it.instance("child Stop rejects late reservations even after the root resumes", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const stopped = yield* f.child("lucy", [...allow])
  const active = yield* f.child("archie", [...allow])
  f.bridge.interrupt(stopped.id)
  expect(Exit.isFailure(yield* f.call({ id: "late_child", tool: "context_recall", args: { query: "brief" },
    sessionID: stopped.id, seat: "lucy" }).pipe(Effect.exit))).toBe(true)
  f.bridge.interrupt()
  f.bridge.resume()
  expect(Exit.isFailure(yield* f.call({ id: "resumed_root_late_child", tool: "context_recall", args: { query: "brief" },
    sessionID: stopped.id, seat: "lucy" }).pipe(Effect.exit))).toBe(true)
  yield* f.call({ id: "active_child", tool: "context_recall", args: { query: "brief" }, sessionID: active.id, seat: "archie" })
  const client = yield* f.client([yield* recall])
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("active_child") })))
  expect(result.isError).toBeUndefined()
  expect(result.content[0].text).toContain("brief for archie")
}), 60_000)

it.instance("MCP request cancellation aborts only its execution and later calls remain usable", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const child = yield* f.child("lucy", [{ permission: "context_recall", pattern: "*", action: "ask" }])
  yield* f.call({ id: "sdk_cancel", tool: "context_recall", args: { query: "blocked" }, sessionID: child.id, seat: "lucy" })
  const client = yield* f.client([yield* recall])
  const controller = new AbortController()
  const response = client.callTool({ name: "context_recall", arguments: f.arguments("sdk_cancel") }, undefined, { signal: controller.signal })
    .then(() => false, () => true)
  yield* pollWithTimeout(f.permission.list().pipe(Effect.map((requests) => requests.find((request) => request.sessionID === child.id))),
    "the real tool never asked permission", "5 seconds")
  controller.abort()
  expect(yield* Effect.promise(() => response)).toBe(true)
  yield* pollWithTimeout(f.permission.list().pipe(Effect.map((requests) => requests.every((request) => request.sessionID !== child.id) ? true : undefined)),
    "SDK cancellation left permission work running", "5 seconds")
  expect(f.ctx.abort.signal.aborted).toBe(false)
  f.bridge.release("sdk_cancel")
  yield* f.call({ id: "after_cancel", tool: "context_recall", args: { query: "brief" } })
  yield* f.sessions.setPermission({ sessionID: f.parent.id, permission: [...allow] })
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: "context_recall", arguments: f.arguments("after_cancel") })))
  expect(result.isError).toBeUndefined()
}), 60_000)

// The governed review and the workflow Task start Orchestra child Sessions, so a served call carries the turn's executor.
it.instance("served tools run with the latest turn's prompt executor, which the review and workflow task need", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const ops: TaskPromptOps = { cancel: () => Effect.void, resolvePromptParts: () => Effect.succeed([]),
    prompt: () => Effect.die(new Error("the probe never prompts")) }
  const probe: Tool.Def = { id: "fixture_probe", description: "probe", parameters: Schema.Struct({}),
    execute: (_args, ctx) => Effect.succeed({ title: "probe", output: String(ctx.extra?.promptOps === ops), metadata: {} }) }
  const client = yield* f.client([probe])
  const run = Effect.fnUntraced(function* (id: string) {
    yield* f.call({ id, tool: probe.id, args: {} })
    return Schema.decodeUnknownSync(Text)(yield* Effect.promise(() => client.callTool({ name: probe.id, arguments: f.arguments(id) })))
      .content[0].text
  })
  expect(yield* run("before_turn")).toBe("false")
  Object.assign(f.live, { promptOps: () => Effect.succeed(ops) })
  expect(yield* run("after_turn")).toBe("true")
  expect(ClaudeHostMcp.servable("maestro_request_review")).toBe(true)
  expect(ClaudeHostMcp.servable(ClaudeHostMcp.WORKFLOW_TASK)).toBe(true)
  expect(ClaudeHostMcp.servable("bash")).toBe(false)
  const append = ClaudeHostOptions.append("maestro", {})
  expect(append).toContain("`mcp__orchestra__maestro_request_review`")
  expect(append).toContain("dispatched with `mcp__orchestra__task`, never `Agent`")
  expect(append).not.toContain("requires Orchestra's prompt executor")
}), 60_000)

// Claude mode reads the catalog through the NativeHost publication `withSession` provides, the same one native Maestro reads.
it.instance("maestro_workflows served over the bridge lists a Relay workflow published in the project", () => Effect.gen(function* () {
  const f = yield* BridgeFixture.make()
  const locations = yield* LocationServiceMap.Service
  const relay = yield* ArsenalCompletion.locationRelay((ref) => locations.get(ref))({ directory: f.ctx.directory })
  const published = yield* Effect.scoped(Effect.gen(function* () {
    const store = yield* AuthoringStore.open(relay.paths.root, f.parent.projectID)
    const saved = yield* store.save({ body: yield* AuthoringGraph.project("Bridged", { work_packages: [
      { id: "implement", instructions: "Implement.", checklist: [{ id: "implement-check", cmd: "true" }] },
    ] }) })
    yield* store.publish(saved.id, saved.versionId)
    return saved
  }))
  yield* f.call({ id: "list_workflows", tool: "maestro_workflows", args: {} })
  const client = yield* f.client([yield* Effect.flatMap(MaestroWorkflowsTool, Tool.init)])
  const result = Schema.decodeUnknownSync(Text)(yield* Effect.promise(() =>
    client.callTool({ name: "maestro_workflows", arguments: f.arguments("list_workflows") })))
  expect(result.isError).toBeUndefined()
  expect(JSON.parse(result.content[0].text).workflows).toEqual([
    { id: published.id, name: "Bridged", description: "", publishedVersionID: published.versionId },
  ])
}), { git: true }, 120_000)
