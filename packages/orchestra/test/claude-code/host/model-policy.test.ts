import { expect, test } from "bun:test"
import { Context, Deferred, Effect, Fiber, Schema } from "effect"
import type { HookInput } from "@anthropic-ai/claude-agent-sdk"
import { eq, sql } from "drizzle-orm"
import { Catalog } from "@orchestra/core/catalog"
import { Database } from "@orchestra/core/database/database"
import { LocationServiceMap } from "@orchestra/core/location-services"
import { SessionTable } from "@orchestra/core/session/sql"
import { ModelV2 } from "@orchestra/core/model"
import { AbsolutePath } from "@orchestra/core/schema"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { ClaudeHostDelegation } from "@/claude-code/host/delegation"
import { ClaudeHost } from "@/claude-code/host/session"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostMcp } from "@/claude-code/host/mcp"
import { WriteRoots } from "@/maestro/write-roots"
import { ClaudeResearchFixture } from "./jimmy-fixture"
import { ClaudeEngineFixture } from "../engine-fixture"

const fast = ModelV2.Info.make({ ...ModelV2.Info.empty(ProviderV2.ID.anthropic, ModelV2.ID.make("fast-catalog")),
  api: { type: "native", id: ModelV2.ID.make("wire-fast"), settings: {} } })
const large = ModelV2.Info.make({ ...ModelV2.Info.empty(ProviderV2.ID.anthropic, ModelV2.ID.make("large-catalog")),
  api: { type: "native", id: ModelV2.ID.make("wire-large"), settings: {} } })
const sdkModels = [
  { value: "haiku", resolvedModel: "wire-fast", displayName: "Fast", description: "fixture SDK metadata" },
  { value: "opus", resolvedModel: "wire-large", displayName: "Large", description: "fixture SDK metadata" },
]
const sdkAgents = [
  { name: "Explore", description: "fixture SDK-defined agent", model: "wire-fast" },
  { name: "general-purpose", description: "fixture inheritance", model: "inherit" },
  { name: "orchestra:archie", description: "fixture registered seat", model: "wire-large" },
]
const definitions = { Explore: { model: "wire-fast" }, "orchestra:archie": { model: "wire-large" },
  "general-purpose": { model: "inherit" } }
const fastPolicy = SessionSubagentModels.Policy.make({ mode: "allowlist", models: [fast] })

test("only SDK-owned concrete model definitions prove catalog identity; contextual selectors remain unknown", () => {
  const resolve = (type: string, override?: unknown) =>
    ClaudeHost.selectModel(sdkAgents, sdkModels, [fast, large], type, override, definitions)
  expect(resolve("Explore")?.ref).toEqual(ModelV2.Ref.make({ providerID: ProviderV2.ID.anthropic, id: fast.id }))
  expect(resolve("orchestra:archie")?.ref.id).toBe(large.id)
  expect(resolve("Explore", "opus")).toBeUndefined()
  expect(resolve("Explore", "wire-fast")).toBeUndefined()
  expect(resolve("unknown", "haiku")).toBeUndefined()
  expect(resolve("Explore", null)).toBeUndefined()
  expect(resolve("Explore", "unknown-model")).toBeUndefined()
  expect(resolve("general-purpose")).toBeUndefined()
  expect(ClaudeHost.selectModel([{ name: "default", description: "no explicit SDK model" }], sdkModels,
    [fast], "default", undefined)).toBeUndefined()
  expect(ClaudeHost.selectModel(sdkAgents, [{ value: "haiku", displayName: "unresolved", description: "old SDK" }],
    [fast], "Explore", undefined, definitions)).toBeUndefined()
  expect(ClaudeHost.selectModel([...sdkAgents, sdkAgents[0]], sdkModels, [fast], "Explore", undefined, definitions)).toBeUndefined()
  expect(ClaudeHost.selectModel(sdkAgents, [...sdkModels, { ...sdkModels[0], resolvedModel: "wire-large" }],
    [fast, large], "Explore", undefined, definitions)?.ref.id).toBe(fast.id)
  expect(ClaudeHost.selectModel(sdkAgents, sdkModels, [fast, { ...fast, id: ModelV2.ID.make("same-wire-other-catalog") }],
    "Explore", undefined, definitions)).toBeUndefined()
  expect(ClaudeHost.selectModel(sdkAgents, sdkModels, [fast], "Explore", undefined)).toBeUndefined()
  expect(resolve("fork", "haiku")).toBeUndefined()
})

ClaudeEngineFixture.it.instance("real host captures canonical policy and resolves SDK metadata in its actual Location", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const f = yield* ClaudeEngineFixture.setup({ models: { patty: "anthropic/wire-fast" } })
  const locations = yield* LocationServiceMap.Service
  yield* Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    yield* catalog.transform((draft) => {
      for (const model of [fast, large]) draft.model.update(model.providerID, model.id, (entry) => Object.assign(entry, model))
    })
  }).pipe(Effect.provide(locations.get({ directory: AbsolutePath.make(f.chat.directory), workspaceID: undefined })))
  const database = yield* Database.Service
  yield* database.db.update(SessionTable).set({ subagent_models: Schema.encodeSync(Schema.fromJsonString(SessionSubagentModels.Policy))(fastPolicy) })
    .where(eq(SessionTable.id, f.chat.id))
  ClaudeEngineFixture.state.sdkAgents.push({ name: "orchestra:patty", model: "wire-fast", description: "actual SDK-owned seat" })
  ClaudeEngineFixture.state.sdkModels.push(...sdkModels)
  const decisions: unknown[] = []
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    const options = { signal: new AbortController().signal }
    yield { type: "system", subtype: "init", model: "wire-fast", ...ClaudeEngineFixture.frame }
    for (const model of ["opus", undefined]) decisions.push(await params.options!.hooks!.PreToolUse![0].hooks[0]({
      ...ClaudeResearchFixture.base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: `native-${model}`,
      tool_input: { subagent_type: "orchestra:patty", model, run_in_background: false, prompt: "Review policy" },
    }, undefined, options))
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(), message: {
      id: "policy-report", model: "wire-fast", content: [{ type: "text", text: "guard checked" }], usage: {} } }
    yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...ClaudeEngineFixture.frame }
    for await (const _ of input) {}
  })
  const admitted = yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("check ceiling"), noReply: true })
  if (admitted.info.role !== "user") throw new Error("Missing admitted user")
  const host = yield* ClaudeHost.Service
  const policies = yield* SessionSubagentModels.Service
  yield* host.turn({ sessionID: f.chat.id, user: admitted.info }).pipe(
    Effect.provideService(SessionSubagentModels.Service, { ...policies, assertChild: () => Effect.void }),
    Effect.provideService(ClaudeHost.Adapters, { hooks: () => ({ PreToolUse: [{ hooks: [async () => ({
      hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
    })] }] }) }))
  expect(decisions[0]).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("identity is unknown") } })
  expect(decisions[1]).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  expect(ClaudeEngineFixture.state.queries).toHaveLength(1)
  expect(ClaudeEngineFixture.state.apiCalls).toBe(0)
}), 30000)

ClaudeEngineFixture.it.instance("registered final denial retains spent grant and cleanup obligation across swallowed removal failure", () => Effect.gen(function* () {
  ClaudeEngineFixture.reset()
  const f = yield* ClaudeEngineFixture.setup({ models: { archie: "anthropic/wire-fast" } })
  const locations = yield* LocationServiceMap.Service
  const database = yield* Database.Service
  const policies = yield* SessionSubagentModels.Service
  yield* Effect.gen(function* () {
    const catalog = yield* Catalog.Service
    yield* catalog.transform((draft) => draft.model.update(fast.providerID, fast.id, (entry) => Object.assign(entry, fast)))
  }).pipe(Effect.provide(locations.get({ directory: AbsolutePath.make(f.chat.directory), workspaceID: undefined })))
  yield* policies.set(f.chat.id, fastPolicy)
  const rules = yield* WriteRoots.bind("archie", ["proposal.md"], [])
  const grantID = "grt_model_cleanup"
  ClaudeHostMcp.grants(f.chat.id).set(grantID, { grantID, sessionID: f.chat.id, seat: "archie", writePaths: ["proposal.md"],
    writeRoots: WriteRoots.read(rules) ?? [], purpose: "proposal", time: Date.now() })
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const metadata = { calls: 0 }
  const decisions: unknown[] = []
  ClaudeEngineFixture.state.sdkAgents.push({ name: "orchestra:archie", model: "wire-fast", description: "SDK-owned proposal" })
  ClaudeEngineFixture.state.sdkModels.push(...sdkModels)
  const context = yield* Effect.context<never>()
  ClaudeEngineFixture.state.initialize = () => Effect.runPromiseWith(context)(Effect.gen(function* () {
    metadata.calls++
    if (metadata.calls !== 3) return
    yield* Deferred.succeed(entered, undefined)
    yield* Deferred.await(release)
  }))
  const args = { subagent_type: "orchestra:archie", run_in_background: false, description: "proposal",
    prompt: `grantID: ${grantID}\nWrite proposal.md.` }
  ClaudeEngineFixture.state.scripts.push(async function* (input, params) {
    await input[Symbol.asyncIterator]().next()
    yield { type: "system", subtype: "init", model: "wire-fast", ...ClaudeEngineFixture.frame }
    yield { type: "assistant", ...ClaudeEngineFixture.frame, uuid: crypto.randomUUID(), message: {
      id: "registered-policy-call", model: "wire-fast", content: [{ type: "tool_use", id: "registered-policy", name: "Agent", input: args }], usage: {} } }
    const hook = { ...ClaudeResearchFixture.base, hook_event_name: "PreToolUse" as const, tool_name: "Agent",
      tool_use_id: "registered-policy", tool_input: args }
    const options = { signal: new AbortController().signal }
    decisions.push(await params.options!.hooks!.PreToolUse![0].hooks[0](hook, undefined, options))
    await Effect.runPromiseWith(context)(database.db.run(sql`DROP TRIGGER keep_model_child`))
    await Effect.runPromiseWith(context)(policies.set(f.chat.id, SessionSubagentModels.inherit))
    decisions.push(await params.options!.hooks!.PreToolUse![0].hooks[0](hook, undefined, options))
    yield { type: "result", subtype: "success", is_error: false, total_cost_usd: 0, ...ClaudeEngineFixture.frame }
    for await (const _ of input) {}
  })
  const admitted = yield* f.prompt.prompt({ sessionID: f.chat.id, ...ClaudeEngineFixture.say("bounded proposal"), noReply: true })
  if (admitted.info.role !== "user") throw new Error("Missing admitted user")
  const host = yield* ClaudeHost.Service
  const running = yield* host.turn({ sessionID: f.chat.id, user: admitted.info }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  const kids = yield* f.sessions.children(f.chat.id)
  expect(kids).toHaveLength(1)
  expect(ClaudeHostMcp.grants(f.chat.id).has(grantID)).toBe(false)
  yield* database.db.run(sql.raw(`CREATE TRIGGER keep_model_child BEFORE DELETE ON session WHEN OLD.id = '${kids[0].id}' BEGIN SELECT RAISE(IGNORE); END`))
  yield* policies.set(f.chat.id, { mode: "allowlist", models: [] })
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(running)
  expect(decisions[0]).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("cleanup is still pending") } })
  expect(decisions[1]).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("model policy denied") } })
  expect(yield* f.sessions.children(f.chat.id)).toHaveLength(0)
  expect(ClaudeHostMcp.grants(f.chat.id).has(grantID)).toBe(false)
}), 30000)

ClaudeResearchFixture.it.instance("native Agent and Task enforce actual durable ancestor ceilings before generic or seat dispatch", () => Effect.gen(function* () {
  const f = yield* setup()
  const policies = yield* SessionSubagentModels.Service
  yield* policies.set(f.parent.id, fastPolicy)
  for (const tool of ["Agent", "Task"] as const) {
    const denied = yield* f.fire({ tool, type: "Explore", model: "opus" })
    expect(denied).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("identity is unknown") } })
    expect(f.join.get(f.lastCall.value)).toBeUndefined()
    expect(yield* f.sessions.children(f.parent.id)).toHaveLength(0)
  }
  const held = yield* f.fire({ type: "orchestra:archie" })
  expect(held).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("Subagent model denied") } })
  expect(f.join.get(f.lastCall.value)).toBeUndefined()
  expect(yield* f.sessions.children(f.parent.id)).toHaveLength(0)
  expect(yield* policies.assert(f.parent.id, large).pipe(Effect.exit)).toMatchObject({ _tag: "Success" })
  const allowed = yield* f.fire({ type: "Explore" })
  expect(allowed).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  const outer = f.lastCall.value
  const child = yield* f.sessions.create({ parentID: f.parent.id, agent: "maestro", title: "real generic mirror placement" })
  f.join.dispatched(outer, { child: child.id })
  f.join.taskStarted({ toolUseID: outer, taskID: "joined-generic-agent" })
  yield* policies.set(child.id, SessionSubagentModels.inherit)
  const nested = yield* f.fire({ type: "Explore", model: "opus", agent: "joined-generic-agent" })
  expect(nested).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining(child.id) } })
  expect(f.join.get(f.lastCall.value)).toBeUndefined()
}), 30000)

ClaudeResearchFixture.it.instance("unknown SDK model identity fails closed only under actual restrictive ceilings", () => Effect.gen(function* () {
  const f = yield* setup()
  const policies = yield* SessionSubagentModels.Service
  expect(yield* f.fire({ type: "unknown" })).toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  yield* policies.set(f.parent.id, fastPolicy)
  expect(yield* f.fire({ type: "unknown" })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("identity is unknown") } })
  expect(f.join.get(f.lastCall.value)).toBeUndefined()
}), 30000)

ClaudeResearchFixture.it.instance("permission wait cannot retain a now-denied child model", () => Effect.gen(function* () {
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const f = yield* setup(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
  const policies = yield* SessionSubagentModels.Service
  const waiting = yield* f.fire({ type: "Explore", model: "opus" }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* policies.set(f.parent.id, fastPolicy)
  yield* Deferred.succeed(release, undefined)
  expect(yield* Fiber.join(waiting)).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("identity is unknown") } })
  expect(f.join.get(f.lastCall.value)).toBeUndefined()
}), 30000)

ClaudeResearchFixture.it.instance("cached inheritance and fork override never masquerade as concrete child identity", () => Effect.gen(function* () {
  const f = yield* setup()
  const policies = yield* SessionSubagentModels.Service
  yield* policies.set(f.parent.id, fastPolicy)
  expect(yield* f.fire({ type: "general-purpose" })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("identity is unknown") } })
  expect(yield* f.fire({ type: "fork", model: "haiku" })).toMatchObject({ hookSpecificOutput: { permissionDecision: "deny",
    permissionDecisionReason: expect.stringContaining("identity is unknown") } })
  expect(f.join.get(f.lastCall.value)).toBeUndefined()
}), 30000)

ClaudeResearchFixture.it.instance("final metadata wait denial is terminal even after the ceiling is relaxed", () => Effect.gen(function* () {
  const f = yield* ClaudeResearchFixture.setup({ research: false })
  const policies = yield* SessionSubagentModels.Service
  const calls = { value: 0 }
  const delegation = ClaudeHostDelegation.make({ sessionID: f.parent.id, agent: "maestro",
    path: { cwd: f.parent.directory, root: f.parent.directory }, join: f.join,
    models: () => Effect.gen(function* () {
      calls.value++
      if (calls.value === 2) yield* policies.set(f.parent.id, { mode: "allowlist", models: [] })
      return { model: "wire-fast", ref: ModelV2.Ref.make({ id: fast.id, providerID: fast.providerID }) }
    }),
  })
  const hook = { ...ClaudeResearchFixture.base, hook_event_name: "PreToolUse" as const, tool_name: "Agent",
    tool_use_id: "terminal-model-admission", tool_input: { subagent_type: "Explore" } }
  const actor = { sessionID: f.parent.id, seat: "maestro" }
  yield* policies.set(f.parent.id, fastPolicy)
  yield* delegation.dispatch(hook, actor)
  expect(yield* delegation.admit(hook, actor).pipe(Effect.exit)).toMatchObject({ _tag: "Failure" })
  expect(f.join.get(hook.tool_use_id)?.hold).toContain("model policy denied")
  yield* policies.set(f.parent.id, SessionSubagentModels.inherit)
  expect(yield* delegation.dispatch(hook, actor).pipe(Effect.exit)).toMatchObject({ _tag: "Failure" })
  expect(yield* delegation.admit(hook, actor).pipe(Effect.exit)).toMatchObject({ _tag: "Failure" })
}), 30000)

function setup(ask = Effect.void) {
  return Effect.gen(function* () {
    const f = yield* ClaudeResearchFixture.setup({ research: false })
    const context = yield* Effect.context<never>()
    const lastCall = { value: "" }
    const hooks = ClaudeHostHooks.create({ sessionID: f.parent.id, directory: f.parent.directory, worktree: f.parent.directory,
      agent: "maestro", abort: f.abort, join: f.join, granted: { maestro: ["task"] },
      run: <A, R>(effect: Effect.Effect<A, unknown, R>) => Effect.runPromiseWith(context)(effect as Effect.Effect<A, unknown>),
      models: (type, override) => Effect.sync(() => ClaudeHost.selectModel(sdkAgents, sdkModels, [fast, large], type, override, definitions)),
      policy: { granted: { maestro: ["task"] }, hold: () => Effect.void, safety: () => Effect.void, arsenal: () => Effect.void,
        ask: () => ask, confine: () => Effect.succeed(undefined), release: () => Effect.void, close: Effect.void },
    })
    const event = (input: HookInput) => Effect.promise(() => hooks[input.hook_event_name]![0].hooks[0](input, undefined, { signal: f.abort.signal }))
    const fire = (input: { tool?: "Agent" | "Task"; type: string; model?: string; agent?: string }) => {
      lastCall.value = crypto.randomUUID()
      return event({ ...ClaudeResearchFixture.base, hook_event_name: "PreToolUse", tool_name: input.tool ?? "Agent",
        tool_use_id: lastCall.value, agent_id: input.agent, tool_input: { subagent_type: input.type, model: input.model, run_in_background: false } })
    }
    return { ...f, lastCall, event, fire }
  })
}
