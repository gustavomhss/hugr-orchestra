import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Schema, Tracer } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { CapabilityInvocation } from "@orchestra/core/capability/invocation"
import { CapabilityJobTable } from "@orchestra/core/capability/sql"
import { CapabilityServiceSchema } from "@orchestra/core/capability/service/schema"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionV2 } from "@orchestra/core/session"
import { SessionMessage } from "@orchestra/core/session/message"
import { Tool } from "@orchestra/core/tool/tool"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { eq } from "drizzle-orm"
import { CapabilityServiceCallFixture } from "./fixture/capability-service-call"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityServiceCallFixture.layer)

it.live("canonical JSON/SSE service call binds selected account and persists acknowledged worker outcome", () =>
  Effect.gen(function* () {
    const f = yield* CapabilityServiceCallFixture.fixture()
    f.state.mode = "sse"
    const output = f.output(yield* f.call())
    expect(output.result.status).toBe("completed")
    expect(output.validation).toEqual({ input: "validated", output: "validated" })
    expect(f.state.calls).toHaveLength(1)
    expect(f.state.calls[0]?.body.params).toEqual({ name: "mutate", arguments: {
      account: "bound-account", zero: 0, flag: false, nil: null, value: "requested",
    } })
    expect(f.state.calls[0]?.headers.get("authorization")).toBe(`Bearer ${CapabilityServiceCallFixture.secret}`)
    expect((yield* f.rows())[0]).toMatchObject({ kind: "worker", state: "completed", provider_id: null, generation: 3,
      observation: { data: { remoteOutcome: "completed", materialization: "complete" } } })
  }), 60000,
)

const rejected = ["bound-conflict", "input-schema", "wrong-owner", "wrong-root", "wrong-provider", "expired-ref", "bad-hash",
  "bad-generation", "excluded", "generic-deny", "operation-deny", "native-floor", "replacement", "catalog-race", "expired-oauth"] as const
rejected.forEach((mode) => it.live(`preflight ${mode} denies before tools/call`, () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture(mode === "wrong-root" ? { rootName: "service_call" }
    : mode === "expired-oauth" ? { oauth: true } : {})
  if (mode === "wrong-owner") f.state.context = { ...f.context, sessionID: SessionV2.ID.create(), agent: AgentV2.ID.make("other") }
  if (mode === "wrong-provider") f.state.provider = "supabase"
  if (mode === "expired-ref") f.state.time += 60001
  if (mode === "excluded") f.state.excluded = true
  if (mode === "replacement") yield* f.registry.register({ platform_cloudflare: f.platform })
  if (mode === "expired-oauth") {
    if (f.selected.value.type !== "oauth") return yield* Effect.die("Missing OAuth fixture")
    yield* f.credentials.update(f.selected.id, { value: { ...f.selected.value, expires: 0 } })
  }
  if (mode === "catalog-race") f.state.beforeList = (number) => {
    if (number === 3) f.state.tools = [{ name: "mutate", description: "Selected mutation", title: "Changed metadata",
      inputSchema: CapabilityServiceCallFixture.inputSchema, outputSchema: CapabilityServiceCallFixture.outputSchema }]
  }
  if (mode === "generic-deny" || mode === "operation-deny") yield* CapabilityPolicyFixture.setRules([
    ...CapabilityServiceCallFixture.rules, { action: "service_call", resource: mode === "generic-deny" ? "service_call" : "cloudflare:mutate", effect: "deny" },
  ])
  const input: CapabilityServiceSchema.CallInput = mode === "bound-conflict" ? { ...f.input, input: { value: "requested", account: "wrong" } }
    : mode === "input-schema" ? { ...f.input, input: { value: 1 } }
    : mode === "bad-hash" ? { ...f.input, descriptor: { ...f.descriptor, schemaHash: "0".repeat(64) } }
    : mode === "bad-generation" ? { ...f.input, descriptor: { ...f.descriptor, catalogGeneration: f.descriptor.catalogGeneration + 1 } } : f.input
  const binding = mode === "native-floor" ? { ...f.binding,
    nativeDenyFloor: [{ action: "service_call", resource: "cloudflare:mutate", effect: "deny" as const }] } : f.binding
  expect((yield* f.call(input, binding)).result.type).toBe("error")
  expect(f.state.calls).toHaveLength(0)
  expect(yield* f.rows()).toEqual([])
  if (mode === "generic-deny") expect(f.state.lists).toBe(1)
}), 15000))

it.live("descriptor scope belongs to actual issuing Session; unknown target profile and caller accessors grant nothing", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  const other = yield* CapabilityPolicyFixture.fixture({ name: "platform_cloudflare" })
  yield* CapabilityPolicyFixture.setRules(CapabilityServiceCallFixture.rules)
  yield* f.connections.bind({ target: f.target, sessionID: other.context.sessionID, agentID: other.context.agent,
    actions: ["service_discover", "service_call"] })
  const page = yield* CapabilityInvocation.withContext({ ...other.binding, rootToolName: "platform_cloudflare",
    effectiveRules: CapabilityServiceCallFixture.rules }, f.discovery.find(other.context, { provider: "cloudflare", query: "",
      connectionID: f.connection.id, targetID: f.target.id }, f.materialization))
  const ref = page.operations[0]?.ref
  if (!ref) return yield* Effect.die("Missing peer descriptor")
  expect((yield* f.call({ ...f.input, descriptor: ref })).result.type).toBe("error")
  const calls = { value: 0 }
  const supplied: CapabilityServiceSchema.CallInput = { descriptor: f.descriptor, input: {} }
  Object.defineProperty(supplied.input, "value", { enumerable: true, get() { calls.value++; throw new Error("ACCESSOR_EXECUTED") } })
  f.state.supplied = supplied
  expect((yield* f.call()).result.type).toBe("error")
  expect(calls.value).toBe(0)
  expect(f.state.calls).toHaveLength(0)
  const unqualified = yield* CapabilityServiceCallFixture.fixture({ resource: { endpoint: "https://untrusted.invalid" } })
  expect((yield* unqualified.call()).result.type).toBe("error")
  expect(unqualified.state.calls).toHaveLength(0)
}), 15000)

it.live("actual canonical child uses original root proof, not an invented assistant tool part", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture({ rootName: "service_call" })
  const output = yield* f.run(Effect.gen(function* () {
    const dispatcher = yield* f.children.dispatcher(f.context, f.materialization)
    return f.output(yield* dispatcher.settle("platform_cloudflare", f.input))
  }))
  expect(output.result.status).toBe("completed")
  expect((yield* f.rows())[0]).toMatchObject({ invocation: { callID: CapabilityInvocation.childID(f.binding.invocation, 1) },
    observation: { rootToolName: "service_call", rootInvocation: f.binding.invocation, lineage: [{ toolName: "platform_cloudflare" }] } })
  expect(f.state.calls).toHaveLength(1)
}), 15000)

it.live("genuine other platform root cannot retarget a descriptor's provider and connection", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  const context = { ...f.context, assistantMessageID: SessionMessage.ID.create(), toolCallID: "supabase-call" }
  yield* f.events.publish(SessionEvent.Step.Started, { ...context, timestamp: CapabilityPolicyFixture.timestamp,
    model: { id: Model.ID.make("fixture"), providerID: Provider.ID.make("fixture") } })
  yield* f.events.publish(SessionEvent.Tool.Input.Started, { sessionID: context.sessionID, assistantMessageID: context.assistantMessageID,
    callID: context.toolCallID, name: "platform_supabase", timestamp: CapabilityPolicyFixture.timestamp })
  yield* f.registry.register({ platform_supabase: Tool.make({ description: "Actual other platform", input: CapabilityServiceSchema.CallInput,
    output: CapabilityServiceSchema.CallOutput, execute: (input, context) => f.execute("supabase", input, context).pipe(
      Effect.mapError((error) => new Tool.Failure({ message: "Denied", error }))),
  }) })
  const materialization = yield* f.registry.materialize()
  const binding = { ...f.binding, rootToolName: "platform_supabase", invocation: { ...f.binding.invocation,
    assistantMessageID: context.assistantMessageID, callID: context.toolCallID } }
  const settlement = yield* CapabilityInvocation.withContext(binding, materialization.settle({ sessionID: context.sessionID,
    assistantMessageID: context.assistantMessageID, agent: context.agent,
    call: { type: "tool-call", id: context.toolCallID, name: "platform_supabase", input: f.input } }))
  expect(settlement.result.type).toBe("error")
  expect(f.state.calls).toHaveLength(0)
  expect(yield* f.rows()).toEqual([])
}), 15000)

it.live("empty profile is explicit endpoint scope, not a claim of unbound argument confinement", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture({ resource: {} })
  expect(f.output(yield* f.call({ ...f.input, input: {
    value: "requested", account: "caller-account", zero: 0, flag: false, nil: null,
  } })).result.status).toBe("completed")
  expect(f.state.calls[0]?.body.params).toMatchObject({ arguments: { account: "caller-account" } })
}), 15000)

;["unvalidated", "missing", "mismatch", "reported-error", "boolean-extension"].forEach((mode) => it.live(`raw output ${mode} keeps honest ACK facts`, () =>
  Effect.gen(function* () {
    const f = yield* CapabilityServiceCallFixture.fixture({ tool: mode === "unvalidated" ? {
      name: "mutate", description: "No output schema", inputSchema: CapabilityServiceCallFixture.inputSchema,
    } : mode === "boolean-extension" ? { name: "mutate", inputSchema: true, outputSchema: false } : undefined })
    if (mode === "missing") f.state.result = { content: [{ type: "text", text: "ACK without declared structure" }] }
    if (mode === "mismatch") f.state.result = { content: [], structuredContent: { changed: "not boolean" } }
    if (mode === "reported-error") f.state.result = { content: [], structuredContent: { changed: false }, isError: true }
    const output = f.output(yield* f.call())
    expect(output.result.status).toBe(mode === "unvalidated" ? "completed" : "partial")
    expect(output.validation.output).toBe(mode === "unvalidated" ? "unvalidated" : mode === "reported-error" ? "validated" : "failed")
    expect(f.state.calls).toHaveLength(1)
    const row = (yield* f.rows())[0]
    expect(row).toMatchObject({ kind: "worker", provider_id: null, state: mode === "reported-error" ? "failed" : "completed" })
    if (mode === "reported-error" && output.result.status === "partial") expect(output.result.completedEffects).toEqual([])
    if (["missing", "mismatch", "boolean-extension"].includes(mode)) expect(row?.observation)
      .toMatchObject({ data: { remoteOutcome: "completed", materialization: "failed" } })
  }), 15000))

;["revoke", "retarget", "rotate", "root", "replace"].forEach((mode) => it.live(`approval ${mode} rechecks selection and operation before RPC`, () =>
  Effect.gen(function* () {
    const f = yield* CapabilityServiceCallFixture.fixture()
    yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
      { action: "effect", resource: "capability:job:service_call", effect: "ask" }])
    const asked = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const fiber = yield* f.call().pipe(Effect.forkChild)
    const request = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("BYPASSED_JOB_APPROVAL"))))
    expect(f.state.calls).toHaveLength(0)
    if (mode === "retarget") yield* f.connections.retargetTarget(f.target, { environment: "changed", resource: { arguments: { account: "other" } } })
    if (mode === "rotate") yield* f.credentials.update(f.selected.id, { value: { type: "key", key: "rotated-secret" } })
    if (mode === "root") yield* endRoot(f)
    if (mode === "replace") yield* f.registry.register({ platform_cloudflare: f.platform })
    yield* CapabilityPolicyFixture.setRules(mode === "revoke" ? [...CapabilityServiceCallFixture.rules,
      { action: "service_call", resource: "cloudflare:mutate", effect: "deny" } ] : CapabilityServiceCallFixture.rules)
    yield* f.permissions.reply({ requestID: request.id, reply: "once" })
    expect((yield* Fiber.join(fiber)).result.type).toBe("error")
    expect(f.state.calls).toHaveLength(0)
    expect((yield* f.rows()).every((row) => row.state !== "completed")).toBe(true)
  }).pipe(Effect.timeout("10 seconds")), 15000))

;["loss", "timeout", "interruption"].forEach((mode) => it.live(`${mode} after charged RPC never retries or invents completion`, () =>
  Effect.gen(function* () {
    const f = yield* CapabilityServiceCallFixture.fixture({ timeout: 1000 })
    f.state.response = mode === "loss" ? "loss" : "hold"
    const fiber = yield* f.call().pipe(Effect.forkChild)
    yield* Deferred.await(f.state.called)
    if (mode === "interruption") {
      yield* Fiber.interrupt(fiber)
      const exit = yield* Fiber.await(fiber)
      expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
    }
    if (mode !== "interruption") expect(f.output(yield* Fiber.join(fiber)).result.status).toBe("unknown")
    expect(f.state.calls).toHaveLength(1)
    expect((yield* f.rows())[0]).toMatchObject({ state: "unknown", provider_id: null })
    expect(yield* f.artifactRows()).toEqual([])
  }).pipe(Effect.timeout("10 seconds")), 15000))

it.live("concurrent/replayed primary intent makes one charged RPC; different complete payload conflicts", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  f.state.response = "hold"
  const first = yield* f.call().pipe(Effect.forkChild)
  yield* Deferred.await(f.state.called)
  expect(f.output(yield* f.call()).result.status).toBe("unknown")
  expect(f.state.calls).toHaveLength(1)
  f.state.release?.()
  expect(f.output(yield* Fiber.join(first)).result.status).toBe("completed")
  expect(f.output(yield* f.call()).result.status).toBe("partial")
  expect((yield* f.call({ ...f.input, input: { value: "changed payload" } })).result.type).toBe("error")
  expect(f.state.errors.at(-1)).toMatchObject({ code: "outcome_unknown" })
  expect(f.state.calls).toHaveLength(1)
  expect(yield* f.rows()).toHaveLength(1)
}).pipe(Effect.timeout("15 seconds")), 20000)

it.live("known RPC ACK survives interruption while SQLite writer is held", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  f.state.response = "hold"
  const ack = yield* Deferred.make<void>()
  const tracer = Tracer.make({ span: (options) => {
    if (options.name === "CapabilityJobs.observeHost") Deferred.doneUnsafe(ack, Effect.void)
    return new Tracer.NativeSpan(options)
  } })
  const call = yield* f.call().pipe(Effect.withTracer(tracer), Effect.forkChild)
  yield* Deferred.await(f.state.called)
  const locked = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const writer = yield* f.database.db.transaction(() => Effect.gen(function* () {
    yield* Deferred.succeed(locked, undefined)
    yield* Deferred.await(release)
  }), { behavior: "immediate" }).pipe(Effect.forkChild)
  yield* Deferred.await(locked)
  f.state.release?.()
  yield* Deferred.await(ack)
  // Immediate beta83 runtime signal: request interruption before releasing the actual SQLite writer.
  yield* Effect.sync(() => call.interruptUnsafe())
  yield* Deferred.succeed(release, undefined)
  yield* Fiber.join(writer)
  const exit = yield* Fiber.await(call)
  expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
  expect((yield* f.rows())[0]).toMatchObject({ state: "completed", observation: { data: {
    remoteOutcome: "completed", materialization: "pending",
  } } })
  expect(f.state.calls).toHaveLength(1)
}).pipe(Effect.timeout("10 seconds")), 15000)

;["publish", "deny", "operation-after-approval"].forEach((mode) => it.live(`large redacted response ${mode} preserves acquired ACK`, () =>
  Effect.gen(function* () {
    const f = yield* CapabilityServiceCallFixture.fixture({ oauth: true })
    f.state.result = { content: [{ type: "text", text: "x".repeat(9000) + CapabilityServiceCallFixture.secret + "selected-refresh-secret" }],
      structuredContent: { changed: true, [CapabilityServiceCallFixture.secret]: "selected-refresh-secret", headers: { authorization: CapabilityServiceCallFixture.secret },
        endpoint: "https://mcp.cloudflare.com/mcp?codemode=false", sessionID: "private-session-value" } }
    if (mode === "deny") yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
      { action: "artifact.write", resource: "*", effect: "deny" }])
    if (mode === "operation-after-approval") yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
      { action: "artifact.write", resource: "*", effect: "ask" }])
    const asked = yield* CapabilityPolicyFixture.observeAsked(f.context)
    const fiber = yield* f.call().pipe(Effect.forkChild)
    if (mode === "operation-after-approval") {
      const request = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("BYPASSED_ARTIFACT_APPROVAL"))))
      expect(request.action).toBe("artifact.write")
      expect((yield* f.rows())[0]?.state).toBe("completed")
      yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
        { action: "service_call", resource: "cloudflare:mutate", effect: "deny" }])
      yield* f.permissions.reply({ requestID: request.id, reply: "once" })
    }
    const output = f.output(yield* Fiber.join(fiber))
    expect(output.result.status).toBe(mode === "publish" ? "completed" : "partial")
    expect(output.redacted).toBe(true)
    expect(output.data).toBeUndefined()
    expect(f.state.calls).toHaveLength(1)
    const artifacts = yield* f.artifactRows()
    expect(artifacts).toHaveLength(mode === "publish" ? 1 : 0)
    expect(yield* f.fs.exists(f.artifactRoot)).toBe(mode === "publish")
    if (mode === "publish") {
      const record = artifacts[0]
      if (!record) return yield* Effect.die("Missing actual service artifact")
      const bytes = yield* f.run(f.artifacts.read(f.context, { id: record.id, revision: record.revision }))
      const text = new TextDecoder().decode(bytes.data)
      expect(record.mime).toBe("application/json")
      expect(text).toContain("[REDACTED]")
      ;[CapabilityServiceCallFixture.secret, "selected-refresh-secret", "private-session-value", "mcp.cloudflare.com"].forEach((secret) => expect(text).not.toContain(secret))
    }
    expect((yield* f.rows())[0]?.observation).toMatchObject({ data: { remoteOutcome: "completed",
      materialization: mode === "publish" ? "complete" : "failed" } })
  }).pipe(Effect.timeout("15 seconds")), 20000))

it.live("raw validation precedes redaction; binary/URI data never triggers automatic acquisition", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture({ tool: { name: "mutate", inputSchema: CapabilityServiceCallFixture.inputSchema,
    outputSchema: { type: "object", properties: { echo: { const: CapabilityServiceCallFixture.secret } }, required: ["echo"] } } })
  f.state.result = { content: [{ type: "image", mimeType: "image/png", data: "inline-base64" },
    { type: "resource_link", name: "untrusted", uri: "https://untrusted.invalid/resource" }], structuredContent: { echo: CapabilityServiceCallFixture.secret } }
  const output = f.output(yield* f.call())
  expect(output.validation.output).toBe("validated")
  expect(output.redacted).toBe(true)
  const text = JSON.stringify(output)
  expect(text).toContain("[REDACTED]")
  expect(text).not.toContain(CapabilityServiceCallFixture.secret)
  expect(text).not.toContain("inline-base64")
  expect(f.state.requests.every((request) => request.method === "POST" || request.method === "DELETE")).toBe(true)
  expect(f.state.calls).toHaveLength(1)
}), 15000)

it.live("actual corrupt job provenance stays defect; acquired response is never falsely reported durable", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  f.state.response = "hold"
  const fiber = yield* f.call().pipe(Effect.forkChild)
  yield* Deferred.await(f.state.called)
  const row = (yield* f.rows())[0]
  if (!row) return yield* Effect.die("Missing admitted job")
  yield* f.database.db.update(CapabilityJobTable).set({ observation: "corrupt" }).where(eq(CapabilityJobTable.id, row.id)).run()
  f.state.release?.()
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
  expect(f.state.calls).toHaveLength(1)
  expect(yield* f.artifactRows()).toEqual([])
}), 15000)

;["deny", "retarget", "rotate", "disconnect", "root", "replace"].forEach((mode) => it.live(`post-ACK inline ${mode} withholds private response`, () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  f.state.response = "hold"
  f.state.result = { content: [], structuredContent: { changed: true, value: "PRIVATE-TARGET-DATA" } }
  const fiber = yield* f.call().pipe(Effect.forkChild)
  yield* Deferred.await(f.state.called)
  if (mode === "deny") yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
    { action: "service_call", resource: "cloudflare:mutate", effect: "deny" }])
  if (mode === "retarget") yield* f.connections.retargetTarget(f.target, { environment: "other", resource: {} })
  if (mode === "rotate") yield* f.credentials.update(f.selected.id, { value: { type: "key", key: "rotated" } })
  if (mode === "disconnect") yield* f.connections.disconnect(f.connection)
  if (mode === "root") yield* endRoot(f)
  if (mode === "replace") yield* f.registry.register({ platform_cloudflare: f.platform })
  f.state.release?.()
  const output = f.output(yield* Fiber.join(fiber))
  expect(output.result.status).toBe("partial")
  expect(output.data).toBeUndefined()
  expect(JSON.stringify(output)).not.toContain("PRIVATE-TARGET-DATA")
  expect((yield* f.rows())[0]).toMatchObject({ state: "completed", observation: { data: { remoteOutcome: "completed", materialization: "failed" } } })
  expect(f.state.calls).toHaveLength(1)
}), 60000))

it.live("final inline selection fence follows materialization persistence and last disclosure approval", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  f.state.response = "hold"
  const asked = yield* CapabilityPolicyFixture.observeAsked(f.context)
  const fiber = yield* f.call().pipe(Effect.forkChild)
  yield* Deferred.await(f.state.called)
  yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
    { action: "service_call", resource: "cloudflare:mutate", effect: "ask" }])
  f.state.release?.()
  const first = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("SKIPPED_POST_ACK_GATE"))))
  yield* f.permissions.reply({ requestID: first.id, reply: "once" })
  yield* Effect.raceFirst(Deferred.await(asked.repeated), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("SKIPPED_FINAL_DISCLOSURE_GATE"))))
  expect((yield* f.rows())[0]).toMatchObject({ generation: 3, observation: { data: { materialization: "complete" } } })
  const pending = (yield* f.permissions.list())[0]
  if (!pending) return yield* Effect.die("Missing final disclosure approval")
  yield* f.connections.retargetTarget(f.target, { environment: "other", resource: {} })
  yield* CapabilityPolicyFixture.setRules(CapabilityServiceCallFixture.rules)
  yield* f.permissions.reply({ requestID: pending.id, reply: "once" })
  const output = f.output(yield* Fiber.join(fiber))
  expect(output.result.status).toBe("partial")
  expect(output.data).toBeUndefined()
  expect(f.state.calls).toHaveLength(1)
}).pipe(Effect.timeout("45 seconds")), 60000)

it.live("final catalog refresh uses execution session after last service approval", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  const reached = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  f.state.beforeList = (number) => number === 4 ? Effect.runPromise(Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))) : undefined
  const asked = yield* CapabilityPolicyFixture.observeAsked(f.context)
  const fiber = yield* f.call().pipe(Effect.forkChild)
  yield* Deferred.await(reached)
  yield* CapabilityPolicyFixture.setRules([...CapabilityServiceCallFixture.rules,
    { action: "service_call", resource: "cloudflare:mutate", effect: "ask" }])
  yield* Deferred.succeed(release, undefined)
  const request = yield* Effect.raceFirst(Deferred.await(asked.first), Fiber.join(fiber).pipe(Effect.andThen(Effect.die("SKIPPED_FINAL_APPROVAL"))))
  f.state.tools = [{ name: "mutate", description: "Selected mutation", inputSchema: { type: "object", properties: { other: { type: "string" } } } }]
  yield* CapabilityPolicyFixture.setRules(CapabilityServiceCallFixture.rules)
  yield* f.permissions.reply({ requestID: request.id, reply: "once" })
  expect((yield* Fiber.join(fiber)).result.type).toBe("error")
  expect(f.state.calls).toHaveLength(0)
  const lists = f.state.requests.filter((request) => request.body.method === "tools/list")
  expect(lists).toHaveLength(5)
  expect(lists[4]?.headers.get("mcp-session-id")).toBe(lists[2]?.headers.get("mcp-session-id") ?? "missing")
}).pipe(Effect.timeout("45 seconds")), 60000)

function endRoot(f: Effect.Success<ReturnType<typeof CapabilityServiceCallFixture.fixture>>) {
  return f.events.publish(SessionEvent.Tool.Success, { sessionID: f.context.sessionID, assistantMessageID: f.context.assistantMessageID,
    callID: f.context.toolCallID, timestamp: CapabilityPolicyFixture.timestamp, structured: {}, content: [], provider: { executed: false } })
}

it.live("snapshot preserves nested quota failures and inert serializer data without executing hidden hooks", () => Effect.gen(function* () {
  const f = yield* CapabilityServiceCallFixture.fixture()
  f.state.supplied = { descriptor: f.descriptor, input: { value: "x".repeat(262145) } }
  expect((yield* f.call()).result.type).toBe("error")
  expect(f.state.errors.at(-1)).toMatchObject({ code: "quota_exceeded" })
  expect(f.state.calls).toHaveLength(0)
  const input = { value: "requested" }
  Object.defineProperty(input, "toJSON", { value: "inert", enumerable: false })
  f.state.supplied = { descriptor: f.descriptor, input }
  expect(f.output(yield* f.call()).result.status).toBe("completed")
  expect(f.state.calls).toHaveLength(1)
}), 60000)

;(["retarget", "rotate", "disconnect"] as const).forEach((mode) => it.live(`artifact approval ${mode} rejects selected publication before blobs`, () =>
  CapabilityServiceCallFixture.publicationRace(mode).pipe(Effect.timeout("45 seconds")), 60000))

;(["defect", "interrupt"] as const).forEach((mode) => it.live(`mixed artifact SQL Fail plus ${mode} preserves complete fatal Cause`, () =>
  CapabilityServiceCallFixture.mixedPublication(mode).pipe(Effect.timeout("45 seconds")), 60000))

;(["approval", "HTTP", "artifact"] as const).forEach((phase) => it.live(`late generic deny at ${phase} closes all service gates`, () =>
  CapabilityServiceCallFixture.genericDeny(phase).pipe(Effect.timeout("45 seconds")), 60000))

it.live("mixed malformed RPC Fail and corrupt ACK Die survives canonical settlement", () =>
  CapabilityServiceCallFixture.mixedRpcAck().pipe(Effect.timeout("45 seconds")), 60000)

;(["defect", "interrupt"] as const).forEach((mode) => [false, true].forEach((reverse) => it.live(`SQL Die with ${mode}, reverse=${reverse} redacts SQL only`, () =>
  CapabilityServiceCallFixture.sqlDiePublication(mode, reverse).pipe(Effect.timeout("45 seconds")), 60000)))

it.live("actual allocator TTL expiring during final service approval prevents RPC after unchanged fresh catalog", () =>
  CapabilityServiceCallFixture.expiredAfterFinalApproval().pipe(Effect.timeout("45 seconds")), 60000)
