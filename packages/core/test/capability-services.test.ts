import { expect, test } from "bun:test"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityDiscovery } from "@orchestra/core/capability/catalog/discovery"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityServiceProviders } from "@orchestra/core/capability/service/providers"
import { CapabilityServiceSchema } from "@orchestra/core/capability/service/schema"
import { CapabilityArtifacts } from "@orchestra/core/capability/artifact/index"
import { FSUtil } from "@orchestra/core/fs-util"
import { Global } from "@orchestra/core/global"
import { PermissionV2 } from "@orchestra/core/permission"
import { RelayHookInstall } from "@orchestra/core/relay-hook-install"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionStore } from "@orchestra/core/session/store"
import { Tool } from "@orchestra/core/tool/tool"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolOutputStore } from "@orchestra/core/tool-output-store"
import { Capability } from "@orchestra/schema/capability"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Option, Ref, Schema } from "effect"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { CapabilityServicesFixture } from "./fixture/capability-services"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityServicesFixture.layer)
const expectedNames = ["cloudflare", "supabase", "vercel", "neon", "railway", "sentry", "grafana", "globalping", "linear", "stripe", "netlify", "prisma_postgres"] as const
const request = CapabilityServicesFixture.request
const output = CapabilityServicesFixture.output
const ref = CapabilityServicesFixture.ref

test("closed provider presets filter real upstream patterns without changing schemas or full catalog provenance", () => {
  expect(CapabilityServiceProviders.names).toEqual(expectedNames)
  expect(CapabilityServiceProviders.platformNames).toEqual(expectedNames.map((name) => `platform_${name}`))
  const cases = [
    ["cloudflare", ["docs", "get_radar_dns", "get_accounts_devices", "get_zones_secondary_dns_records"], "list_accounts"],
    ["neon", ["search", "fetch", "query_logs", "provision_neon_auth", "get_neon_auth_config"], "list_projects"],
    ["railway", ["railway-agent"], "list_projects"],
    ["grafana", ["ask_assistant", "agento11y_query"], "list_dashboards"],
    ["globalping", ["help", "compareLocations", "limits"], "ping"],
    ["prisma_postgres", ["search_prisma_documentation"], "list_databases"],
  ] as const
  cases.forEach(([provider, excluded, retained]) => {
    const tool = { name: retained, summary: "Keep", inputSchema: { type: "object" }, outputSchema: { type: "string" } }
    const catalog: CapabilityDiscovery.VendorList = { tools: [tool, ...excluded.map((name) => ({ ...tool, name }))],
      catalogGeneration: 37, coverage: "partial", byteLength: 9876 }
    const filtered = CapabilityServiceProviders.filterCatalog(provider, catalog)
    expect(filtered).toEqual({ ...catalog, tools: [tool] })
    expect(filtered.tools[0]).toBe(tool)
    expect(catalog.tools).toHaveLength(excluded.length + 1)
  })
  const catalog: CapabilityDiscovery.VendorList = { tools: CapabilityServicesFixture.tools, catalogGeneration: 9, coverage: "complete", byteLength: 512 }
  ;["supabase", "vercel", "sentry", "linear", "stripe", "netlify"].forEach((provider) =>
    expect(CapabilityServiceProviders.filterCatalog(provider, catalog)).toEqual(catalog))
  ;["unknown", "constructor", "__proto__", "Supabase", "prisma-postgres"].forEach((provider) =>
    expect(CapabilityServiceProviders.filterCatalog(provider, catalog)).toEqual({ ...catalog, tools: [] }))
})

test("frozen input schemas accept exact selector fields and reject model authority or unsupported variants", () => {
  expect(Schema.decodeUnknownSync(CapabilityServiceSchema.FindInput)(request)).toEqual(request)
  ;[{ ...request, owner: {} }, { ...request, effectiveRules: [] }, { ...request, limit: 0 },
    { ...request, cursor: "" }, { ...request, query: 1 }, { provider: "", query: "" }].forEach((value) =>
    expect(Option.isNone(Schema.decodeUnknownOption(CapabilityServiceSchema.FindInput)(value))).toBe(true))
  const descriptor = { id: Capability.DescriptorID.create(), connectionID: Capability.ConnectionID.create(),
    targetID: Capability.TargetID.create(), catalogGeneration: 1, schemaHash: "a".repeat(64) }
  expect(Schema.decodeUnknownSync(CapabilityServiceSchema.DescribeInput)({ descriptor })).toEqual({ descriptor })
  expect(Schema.decodeUnknownSync(CapabilityServiceSchema.CallInput)({ descriptor, input: {} })).toEqual({ descriptor, input: {} })
  ;[{ descriptor, ref: descriptor }, { descriptor, owner: {} }].forEach((value) =>
    expect(Option.isNone(Schema.decodeUnknownOption(CapabilityServiceSchema.DescribeInput)(value))).toBe(true))
  ;[{ descriptor, input: {}, ordinal: 2 }, { descriptor, input: {}, effectiveRules: [] }, { descriptor, input: undefined }].forEach((value) =>
    expect(Option.isNone(Schema.decodeUnknownOption(CapabilityServiceSchema.CallInput)(value))).toBe(true))
})

it.live("factory stays lazy; fifteen canonical names stable; hidden platform retained in captured registry", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  expect(yield* Ref.get(f.calls)).toEqual([])
  expect(Object.keys(f.services.tools)).toEqual(["service_find", "service_describe", "service_call", ...expectedNames.map((name) => `platform_${name}`)])
  expect(f.materialization.definitions.map((item) => item.name)).toEqual(["service_find", "service_describe", "service_call"])
  expect(f.materialization.definition("platform_supabase")?.name).toBe("platform_supabase")
  expect(f.materialization.definition("platform_supabase")?.inputSchema).toEqual(f.materialization.definition("service_call")?.inputSchema)
  expect((yield* f.find()).operations.map((item) => item.readiness)).toEqual(["ready", "ready", "unsupported"])
  expect(yield* Ref.get(f.calls)).toHaveLength(1)
}))

it.live("service_find and service_describe use issuing capture, preserve exact schemas and unsupported readiness", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture({ name: "service_find" })
  const first = yield* f.settle("service_find", request)
  const page = Schema.decodeUnknownSync(CapabilityServiceSchema.Page)(first.output?.structured)
  expect(page.operations[2]).toEqual({ name: "unsupported", summary: "External schema", readiness: "unsupported",
    coverage: { input: "unsupported", output: "unsupported" } })
  const described = yield* f.settle("service_describe", { descriptor: ref(page) })
  const description = Schema.decodeUnknownSync(CapabilityServiceSchema.Description)(described.output?.structured)
  expect(description.inputSchema).toEqual(CapabilityServicesFixture.tools[0]?.inputSchema)
  expect(description.outputSchema).toEqual(CapabilityServicesFixture.tools[0]?.outputSchema)
  expect(JSON.stringify([page, description])).not.toContain(CapabilityServicesFixture.secret)
  expect(described.output?.content).toEqual([{ type: "text", text: JSON.stringify(description) }])
  yield* f.registry.register({ platform_supabase: Tool.make({ description: "Replacement", input: Schema.Json, output: Schema.Json,
    execute: (input) => Effect.succeed(input) }) })
  expect((yield* f.settle("service_find", request)).result).toEqual({ type: "error", value: "Capability discovery unavailable" })
  expect(yield* Ref.get(f.calls)).toHaveLength(2)
}))

it.live("service_call admits one SQL child, executes actual hidden canonical leaf/context/hooks and returns decoded CallOutput", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  const global = yield* Global.Service
  const fs = yield* FSUtil.Service
  yield* fs.ensureDir(global.data)
  const snapshot = { schema: "relay.hook.v1", name: "Service audit", binding: "host-required", installed: false,
    nodes: [{ id: "event", name: "Tool", type: RelayHook.NodeType.trigger, position: [0, 0], parameters: { operation: "tool", timing: "before" } },
      { id: "record", name: "Record", type: RelayHook.NodeType.record, position: [0, 0], parameters: { message: "Service observed" } }],
    connections: [{ from: "event", port: 0, to: "record" }] }
  const installed = yield* RelayHookInstall.install({ data: global.data, projectID: f.binding.owner.projectID,
    document: "service-audit", version: "v1", snapshot, principal: "user:test",
    sha256: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") })
  const decisions: string[] = []
  const unsubscribe = yield* f.events.listen((event) => Effect.sync(() => {
    if (event.type !== RelayHook.Decided.type) return
    const data = Schema.decodeUnknownSync(Schema.toType(RelayHook.Decided.data))(event.data)
    if (data.callID) decisions.push(data.callID)
  }))
  yield* Effect.addFinalizer(() => unsubscribe)
  const settled = yield* f.settle("service_call", { descriptor, input: {} }).pipe(
    Effect.provideService(ToolSafety.RuntimeProfileLoader, () => Effect.succeed(ToolSafety.withHooks(undefined, [installed.install]))))
  expect(Schema.decodeUnknownSync(CapabilityServiceSchema.CallOutput)(settled.output?.structured)).toEqual(output)
  const text = settled.output?.content[0]
  expect(text?.type).toBe("text")
  if (!text || text.type !== "text") return yield* Effect.die("SERVICE_JSON_TEXT_MISSING")
  expect(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(text.text)).toEqual(output)
  const childID = CapabilityInvocation.childID(f.binding.invocation, 1)
  expect(yield* f.rows()).toMatchObject([{ id: childID, ordinal: 1, depth: 1, parent_call_id: f.context.toolCallID,
    root_tool_name: "service_call", tool_name: "platform_supabase", state: "completed" }])
  expect(yield* Ref.get(f.effects)).toBe(1)
  const seen = yield* Ref.get(f.seen)
  expect(seen).toHaveLength(1)
  expect(seen[0]?.context).toEqual({ ...f.context, toolCallID: childID })
  expect(seen[0]?.hook).toBe(childID)
  expect(seen[0]?.captured).toBe(f.materialization)
  expect(seen[0]?.binding.rootInvocation).toEqual(f.binding.invocation)
  expect(seen[0]?.binding.lineage).toHaveLength(1)
  expect(decisions).toEqual([f.context.toolCallID, childID])
  expect(yield* Ref.get(f.calls)).toHaveLength(2)
  const sessions = yield* SessionStore.Service
  const stored = yield* sessions.message(f.context.assistantMessageID)
  if (!stored || stored.message.type !== "assistant") return yield* Effect.die("SERVICE_ROOT_MISSING")
  expect(stored.message.content.filter((part) => part.type === "tool").map((part) => part.id)).toEqual([f.context.toolCallID])
  expect((yield* f.settle("service_call", { descriptor, input: {} })).result)
    .toEqual({ type: "error", value: "Capability child settlement failed" })
  expect(yield* f.rows()).toHaveLength(1)
  expect(yield* Ref.get(f.effects)).toBe(1)
}))

it.live("locator returns frozen metadata only without catalog IO; guessed, altered, foreign, expired and replaced refs fail", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  const metadata = yield* f.locate(descriptor)
  expect(metadata).toEqual({ provider: "supabase", canonicalName: "platform_supabase", name: "list_projects" })
  expect(Object.isFrozen(metadata)).toBe(true)
  expect(yield* Ref.get(f.calls)).toHaveLength(1)
  yield* Effect.forEach([{ ...descriptor, id: Capability.DescriptorID.create() }, { ...descriptor, schemaHash: "b".repeat(64) },
    { ...descriptor, connectionID: Capability.ConnectionID.create() }, { ...descriptor, targetID: Capability.TargetID.create() },
    { ...descriptor, catalogGeneration: 2 }], (value) => expectCode(f.locate(value), "stale_descriptor"))
  const foreign = yield* CapabilityPolicyFixture.fixture()
  yield* CapabilityPolicyFixture.setRules(CapabilityServicesFixture.allow)
  yield* expectCode(CapabilityInvocation.withContext({ ...foreign.binding, effectiveRules: CapabilityServicesFixture.allow },
    f.discovery.locate(foreign.context, descriptor, f.materialization)), "stale_descriptor")
  const actor = AgentV2.ID.make("other")
  yield* CapabilityPolicyFixture.setRules(CapabilityServicesFixture.allow, actor)
  const context = { ...f.context, agent: actor, assistantMessageID: SessionMessage.ID.create() }
  yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
    model: { id: Model.ID.make("model"), providerID: Provider.ID.make("provider") } })
  yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
    callID: context.toolCallID, name: "service_call", timestamp: CapabilityPolicyFixture.timestamp })
  yield* expectCode(CapabilityInvocation.withContext({ ...f.binding, owner: { ...f.binding.owner, agentID: actor },
    invocation: { ...f.binding.invocation, agentID: actor, assistantMessageID: context.assistantMessageID } },
    f.discovery.locate(context, descriptor, f.materialization)), "stale_descriptor")
  f.clock.time = 1100
  yield* expectCode(f.locate(descriptor), "stale_descriptor")
  f.clock.time = 1000
  yield* f.registry.register({ platform_supabase: Tool.make({ description: "Replacement", input: Schema.Json, output: Schema.Json,
    execute: (input) => Effect.succeed(input) }) })
  yield* expectCode(f.locate(descriptor), "stale_descriptor")
  yield* expectCode(f.locate(descriptor, yield* f.registry.materialize()), "stale_descriptor")
  expect(yield* Ref.get(f.calls)).toHaveLength(1)
}))

it.live("private binding and persisted root precede ref decoding/lookup; generic discovery deny prevents metadata oracle", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  const reads = { count: 0 }
  const poisoned = { ...descriptor }
  Object.defineProperty(poisoned, "id", { get: () => { reads.count++; throw new Error("REF_READ_TOO_EARLY") } })
  yield* expectCode(f.discovery.locate(f.context, poisoned, f.materialization), "invocation_binding_missing")
  const missing = yield* CapabilityPolicyFixture.fixture({ part: false })
  yield* CapabilityPolicyFixture.setRules(CapabilityServicesFixture.allow)
  yield* expectCode(CapabilityInvocation.withContext({ ...missing.binding, effectiveRules: CapabilityServicesFixture.allow },
    f.discovery.locate(missing.context, poisoned, f.materialization)), "invocation_binding_mismatch")
  yield* CapabilityPolicyFixture.setRules([{ action: "service_discover", resource: "*", effect: "deny" }])
  yield* expectCode(f.locate(poisoned), "target_denied")
  expect(reads.count).toBe(0)
  expect(yield* Ref.get(f.calls)).toHaveLength(1)
}))

it.live("locator authorizes provider, selected IDs and operation, including captured deny floor", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  yield* Effect.forEach(["supabase", descriptor.connectionID, descriptor.targetID, "supabase:list_projects"], (resource) => Effect.gen(function* () {
    yield* CapabilityPolicyFixture.setRules([...CapabilityServicesFixture.allow, { action: "service_discover", resource, effect: "deny" }])
    yield* expectCode(f.locate(descriptor), "target_denied")
  }))
  yield* CapabilityPolicyFixture.setRules(CapabilityServicesFixture.allow)
  yield* expectCode(f.run(f.discovery.locate(f.context, descriptor, f.materialization), { ...f.binding,
    nativeDenyFloor: [{ action: "service_discover", resource: "supabase:list_projects", effect: "deny" }, ...CapabilityServicesFixture.allow] }), "target_denied")
  expect(yield* Ref.get(f.calls)).toHaveLength(1)
}))

it.live("missing canonical capture/frame, foreign descriptor and stale replacement cannot dispatch service_call", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  yield* Effect.forEach(["service_find", "service_describe", "service_call"], (name) => Effect.gen(function* () {
    const tool = Object.entries(f.services.tools).find(([key]) => key === name)?.[1]
    if (!tool) return yield* Effect.die("MISSING_SERVICE_TOOL")
    const input = name === "service_find" ? request : name === "service_describe" ? { descriptor } : { descriptor, input: {} }
    const failure = yield* f.run(Tool.settle(tool, { type: "tool-call", id: f.context.toolCallID, name, input }, f.context)).pipe(Effect.flip)
    expect(failure).toMatchObject({ message: "Capability invocation binding is missing" })
  }))
  const absent = yield* f.materialization.settle({ sessionID: f.context.sessionID, agent: f.context.agent,
    assistantMessageID: f.context.assistantMessageID, call: { type: "tool-call", id: f.context.toolCallID, name: "service_call", input: { descriptor, input: {} } } })
  expect(absent.result).toEqual({ type: "error", value: "Capability invocation binding is missing" })
  const foreign = yield* Effect.scoped(Effect.gen(function* () {
    const other = yield* CapabilityServicesFixture.fixture()
    return ref(yield* other.find())
  }))
  expect((yield* f.settle("service_call", { descriptor: foreign, input: {} })).result)
    .toEqual({ type: "error", value: "Capability discovery unavailable" })
  yield* f.registry.register({ platform_supabase: Tool.make({ description: "Replacement", input: Schema.Json, output: Schema.Json,
    execute: () => Ref.update(f.effects, (n) => n + 1).pipe(Effect.as({ replaced: true })) }) })
  expect((yield* f.settle("service_call", { descriptor, input: {} })).result).toEqual({ type: "error", value: "Capability discovery unavailable" })
  expect(yield* f.rows()).toEqual([])
  expect(yield* Ref.get(f.effects)).toBe(0)
}))

it.live("locator approval rechecks persisted root, current revoke, TTL and registration before publishing metadata", () => Effect.gen(function* () {
  yield* Effect.forEach(["root", "revoke", "expiry", "replacement"] as const, (change) => Effect.gen(function* () {
    const f = yield* CapabilityServicesFixture.fixture()
    const descriptor = ref(yield* f.find())
    yield* CapabilityPolicyFixture.setRules([...CapabilityServicesFixture.allow,
      { action: "service_discover", resource: "supabase:list_projects", effect: "ask" }])
    const observation = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const fiber = yield* f.locate(descriptor).pipe(Effect.result, Effect.forkChild)
    const asked = yield* Effect.raceFirst(Deferred.await(observation.first), Fiber.join(fiber).pipe(
      Effect.andThen(Effect.die("LOCATOR_BYPASSED_APPROVAL"))))
    if (change === "root") yield* f.events.publish(SessionEvent.Tool.Success, { sessionID: f.context.sessionID,
      assistantMessageID: f.context.assistantMessageID, callID: f.context.toolCallID, structured: {}, content: [],
      timestamp: CapabilityPolicyFixture.timestamp, provider: { executed: false } })
    if (change === "revoke") yield* CapabilityPolicyFixture.setRules([...CapabilityServicesFixture.allow,
      { action: "service_discover", resource: "supabase:list_projects", effect: "deny" }])
    if (change === "expiry") f.clock.time = 1100
    if (change === "replacement") yield* f.registry.register({ platform_supabase: Tool.make({
      description: "Replacement", input: Schema.Json, output: Schema.Json, execute: (input) => Effect.succeed(input) }) })
    yield* f.permissions.reply({ requestID: asked.id, reply: "once" })
    const result = yield* Fiber.join(fiber)
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe(change === "root" ? "invocation_binding_mismatch"
      : change === "revoke" ? "target_denied" : "stale_descriptor")
    expect(yield* Ref.get(f.calls)).toHaveLength(1)
    expect(yield* f.rows()).toEqual([])
  }))
}).pipe(Effect.timeout("10 seconds")))

it.live("current service_call deny and native leaf deny floor cannot inherit routing allow", () => Effect.gen(function* () {
  yield* Effect.forEach(["current", "floor"] as const, (mode) => Effect.gen(function* () {
    const f = yield* CapabilityServicesFixture.fixture()
    const descriptor = ref(yield* f.find())
    const deny: PermissionV2.Ruleset = [{ action: "service_call", resource: "*", effect: "deny" }]
    if (mode === "current") yield* CapabilityPolicyFixture.setRules([...CapabilityServicesFixture.allow, ...deny])
    const settled = yield* f.settle("service_call", { descriptor, input: {} }, { ...f.binding,
      nativeDenyFloor: mode === "floor" ? [...deny, ...CapabilityServicesFixture.allow] : [] })
    expect(settled.result).toEqual({ type: "error", value: "Capability action is not authorized" })
    expect(yield* Ref.get(f.effects)).toBe(0)
    expect((yield* f.rows()).map((row) => row.state)).toEqual(["failed"])
  }))
}))

it.live("canonical child failures and ToolSafety HOLD survive service_call unchanged", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  yield* Ref.set(f.behavior, Effect.fail(new Capability.Failure({ code: "unsupported_operation", message: "Fixture operation rejected" })))
  expect((yield* f.settle("service_call", { descriptor, input: {} })).result).toEqual({ type: "error", value: "Fixture operation rejected" })
  const held = yield* CapabilityServicesFixture.fixture()
  const selected = ref(yield* held.find())
  const denied = new ToolSafety.Denied({ reason: "ask-before-native-binding-missing" })
  expect((yield* held.settle("service_call", { descriptor: selected, input: {} }).pipe(
    Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: ["platform_supabase"] }))).result)
    .toEqual({ type: "error", value: denied.message })
  expect(yield* Ref.get(held.effects)).toBe(0)
  expect((yield* held.rows()).map((row) => row.state)).toEqual(["failed"])
  const secret = yield* CapabilityServicesFixture.fixture()
  const selectedSecret = ref(yield* secret.find())
  const token = "gh" + "p_" + "Q".repeat(40)
  yield* Ref.set(secret.response, { ...output, data: token })
  const settled = yield* secret.settle("service_call", { descriptor: selectedSecret, input: {} })
  expect(settled.result).toEqual({ type: "error", value: new ToolSafety.Denied({ reason: "recognized-secret-output" }).message })
  expect(settled.output).toBeUndefined()
  expect(JSON.stringify(settled)).not.toContain(token)
}))

it.live("service_call decodes child structured output instead of casting executor/raw success", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  yield* f.registry.register({ platform_supabase: Tool.make({ description: "Invalid contract test leaf", input: CapabilityServiceSchema.CallInput,
    output: Schema.Json, execute: () => Effect.succeed({ raw: "not CallOutput" }) }) })
  const captured = yield* f.registry.materialize()
  const descriptor = ref(yield* f.find(captured))
  expect((yield* f.settle("service_call", { descriptor, input: {} }, f.binding, captured)).result)
    .toEqual({ type: "error", value: "Service child returned invalid output" })
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["completed"])
}))

it.live("platform boundary catches Artifact failures only as typed ToolFailure; defects/interruption retain child SQL outcomes", () => Effect.gen(function* () {
  const artifact = yield* CapabilityServicesFixture.fixture()
  const selectedArtifact = ref(yield* artifact.find())
  const failure = new CapabilityArtifacts.Failure({ code: "artifact_io_failed", message: "Fixture artifact unavailable" })
  yield* Ref.set(artifact.behavior, Effect.fail(failure))
  expect((yield* artifact.settle("service_call", { descriptor: selectedArtifact, input: {} })).result)
    .toEqual({ type: "error", value: failure.message })
  expect((yield* artifact.rows()).map((row) => row.state)).toEqual(["failed"])
  expect(yield* Ref.get(artifact.effects)).toBe(0)
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  yield* Ref.set(f.behavior, Effect.die("service-leaf-defect"))
  const defect = yield* f.settle("service_call", { descriptor, input: {} }).pipe(Effect.exit)
  expect(Exit.isFailure(defect)).toBe(true)
  if (Exit.isFailure(defect)) expect(defect.cause.reasons.some((reason) =>
    reason._tag === "Die" && reason.defect === "service-leaf-defect")).toBe(true)
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["failed"])
  const waiting = yield* CapabilityServicesFixture.fixture()
  const selected = ref(yield* waiting.find())
  const entered = yield* Deferred.make<void>()
  yield* Ref.set(waiting.behavior, Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never)))
  const fiber = yield* waiting.settle("service_call", { descriptor: selected, input: {} }).pipe(Effect.forkChild)
  yield* Deferred.await(entered)
  yield* Fiber.interrupt(fiber)
  const interrupted = yield* Fiber.await(fiber)
  expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
  expect((yield* waiting.rows()).map((row) => row.state)).toEqual(["interrupted"])
}).pipe(Effect.timeout("10 seconds")))

it.live("real service_call large canonical child failure uses current registry limits and one retained file, without a leaf budget", () => Effect.gen(function* () {
  const limits = yield* CapabilityServicesFixture.OutputLimits
  const store = yield* ToolOutputStore.Service
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  const directory = join(global.data, ToolOutputStore.MANAGED_DIRECTORY)
  yield* fs.ensureDir(directory)
  const message = "🙂 canonical child failure\n".repeat(2000)
  yield* Effect.forEach([{ max_bytes: 512, max_lines: 3 }, { max_bytes: 1024, max_lines: 7 }], (configured) => Effect.gen(function* () {
    const f = yield* CapabilityServicesFixture.fixture()
    const descriptor = ref(yield* f.find())
    // Reconfigure after factory/materialization capture: limits are read dynamically by the real registry.
    yield* Ref.set(limits, configured)
    expect(yield* store.limits()).toEqual({ maxBytes: configured.max_bytes, maxLines: configured.max_lines })
    yield* Ref.set(f.behavior, Effect.fail(new Capability.Failure({ code: "unsupported_operation", message })))
    const before = yield* fs.readDirectory(directory)
    const root = yield* f.settle("service_call", { descriptor, input: {} })
    expect(root.result.type).toBe("error")
    expect(Buffer.byteLength(String(root.result.value))).toBeLessThanOrEqual(configured.max_bytes)
    expect(String(root.result.value).split("\n").length).toBeLessThanOrEqual(configured.max_lines)
    expect(String(root.result.value)).not.toContain("�")
    const retained = (yield* fs.readDirectory(directory)).filter((name) => !before.includes(name))
    expect(retained).toHaveLength(1)
    const name = retained[0]
    if (!name) return yield* Effect.die("SERVICE_FAILURE_EVIDENCE_MISSING")
    expect(yield* fs.readFileString(join(directory, name))).toBe(message)
    expect(String(root.result.value)).toContain(join(directory, name))
    expect(root.output).toBeUndefined()
    expect(root.outputPaths).toBeUndefined()
    expect((yield* f.rows()).map((row) => row.state)).toEqual(["failed"])
    expect(yield* Ref.get(f.effects)).toBe(0)
  }))
}))

it.live("service_call preserves real managed-output storage failure as a defect and records failed child", () => Effect.gen(function* () {
  const f = yield* CapabilityServicesFixture.fixture()
  const descriptor = ref(yield* f.find())
  const limits = yield* CapabilityServicesFixture.OutputLimits
  yield* Ref.set(limits, { max_bytes: 512, max_lines: 3 })
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  yield* fs.ensureDir(global.data)
  const directory = join(global.data, ToolOutputStore.MANAGED_DIRECTORY)
  // A real file where retention requires a directory forces the actual FS/storage error path.
  yield* fs.writeFileString(directory, "retention directory blocked")
  yield* Ref.set(f.behavior, Effect.fail(new Capability.Failure({ code: "unsupported_operation", message: "failure\n".repeat(1000) })))
  const exit = yield* f.settle("service_call", { descriptor, input: {} }).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(exit.cause.reasons.some((reason) =>
    reason._tag === "Die" && reason.defect instanceof ToolOutputStore.StorageError && reason.defect.operation === "write")).toBe(true)
  expect((yield* f.rows()).map((row) => row.state)).toEqual(["failed"])
  expect(yield* Ref.get(f.effects)).toBe(0)
  expect(yield* fs.readFileString(directory)).toBe("retention directory blocked")
}))

it.live("mixed Capability/Artifact failures preserve exact defects, interruptors and annotations through canonical platform and service_call", () => Effect.gen(function* () {
  const sentinel = new Error("service mixed fault sentinel")
  const marker = Context.Service<never, Error>("service-cause-fixture")
  const cases = [
    { failure: new Capability.Failure({ code: "unsupported_operation", message: "Expected service rejection" }), fault: Cause.die(sentinel), state: "failed" },
    { failure: new CapabilityArtifacts.Failure({ code: "artifact_io_failed", message: "Expected artifact rejection" }), fault: Cause.interrupt(123), state: "interrupted" },
  ] as const
  yield* Effect.forEach(cases, (item) => Effect.forEach([false, true], (reversed) => Effect.forEach(["platform_supabase", "service_call"], (name) => Effect.gen(function* () {
    const f = yield* CapabilityServicesFixture.fixture()
    const descriptor = ref(yield* f.find())
    const cause = Cause.annotate(reversed ? Cause.combine(item.fault, Cause.fail(item.failure))
      : Cause.combine(Cause.fail(item.failure), item.fault), Context.make(marker, sentinel))
    yield* Ref.set(f.behavior, Effect.failCause(cause))
    const exit = yield* f.settle(name, { descriptor, input: {} }).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit)) return yield* Effect.die("SERVICE_MIXED_CAUSE_PROJECTED_AS_RESULT")
    expect(exit.cause.reasons).toHaveLength(cause.reasons.length)
    cause.reasons.forEach((original, index) => {
      const actual = exit.cause.reasons[index]
      if (!actual) throw new Error("SERVICE_CAUSE_REASON_MISSING")
      original.annotations.forEach((value, key) => expect(actual.annotations.get(key)).toBe(value))
      if (original._tag === "Die") {
        expect(actual._tag).toBe("Die")
        if (actual._tag === "Die") expect(actual.defect).toBe(sentinel)
        return
      }
      if (original._tag === "Interrupt") {
        expect(actual._tag).toBe("Interrupt")
        if (actual._tag === "Interrupt") expect(actual.fiberId).toBe(original.fiberId)
        return
      }
      // Registry promotes mixed ToolFailure reasons to defects while preserving the domain error object.
      expect(actual._tag).toBe("Die")
      if (actual._tag !== "Die" || !(actual.defect instanceof Tool.Failure)) throw new Error("SERVICE_FAILURE_TRANSLATION_LOST")
      expect(actual.defect.error).toBe(item.failure)
      expect(actual.defect.message).toBe(item.failure.message)
    })
    expect((yield* f.rows()).map((row) => row.state)).toEqual(name === "service_call" ? [item.state] : [])
    expect(yield* Ref.get(f.effects)).toBe(0)
  }))))
}).pipe(Effect.timeout("20 seconds")))

function expectCode<A, R>(effect: Effect.Effect<A, Capability.Failure, R>, code: Capability.ErrorCode) {
  return effect.pipe(Effect.flip, Effect.map((error) => {
    expect(error).toBeInstanceOf(Capability.Failure)
    expect(error.code).toBe(code)
    expect(JSON.stringify(error)).not.toContain(CapabilityServicesFixture.secret)
  }))
}
