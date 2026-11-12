import { registerSubmitHarnessLifecycle } from "@/components/prompt-input/submit-harness"
import { expect, test } from "bun:test"
import { createRoot } from "solid-js"
import { Schema } from "effect"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { state } from "@/components/prompt-input/submit-harness"
import { composer, decision, draftSelection, json, liveSDK, model, ref, selection, send, transport, wait } from "./model-execution-consumer.fixture"

registerSubmitHarnessLifecycle()

// Controlled canonical outcomes test consumption, never the backend eligibility algorithm.
function refused(variant?: string) {
  return ModelExecution.Response.make({ ...decision("unavailable", variant),
    models: [{ model, status: "unavailable", reason: "variant-unavailable", engine: "orchestra" }] })
}
function emit(calls: ReturnType<typeof transport>, event: Record<string, unknown>) {
  const stream = calls.streams.at(-1)
  if (!stream) throw new Error("Real SDK SSE transport has not subscribed")
  stream.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
}
function metadata(source: ReturnType<typeof selection>, change: "provider connection" | "provider options" | "agent engine") {
  if (change === "provider connection") return source.setView("catalog", "connected", [])
  if (change === "agent engine") return source.setMetadata("agent", 0, "engine", "claude-code")
  source.setView("catalog", "all", (all) => {
    const provider = all.get(ref.providerID)!
    return new Map(all).set(ref.providerID, { ...provider, options: { ...provider.options, fixtureEndpoint: "changed" } })
  })
}
async function refreshed(calls: ReturnType<typeof transport>, source: ReturnType<typeof selection>, current: ReturnType<typeof selection>["local"]["model"], change: Parameters<typeof metadata>[1]) {
  current.set({ providerID: ref.providerID, modelID: ref.id })
  await wait(() => current.execution.ready(), "real initial canonical selection ready")
  const before = calls.queries().length
  const input = calls.queries().at(-1)?.body
  const context = current.execution.context()
  const intent = current.intent()
  calls.control.reply = () => json({ location: { directory: calls.directory }, data: refused() })
  metadata(source, change)
  await wait(() => calls.queries().length > before && current.execution.read().status === "ready", "metadata-only change obtains another canonical response")
  expect(current.execution.context()).not.toBe(context)
  expect(calls.queries().at(-1)?.body).toEqual(input)
  expect(current.intent()).toEqual(intent)
  expect(current.execution.ready()).toBe(false)
  expect(calls.admissions()).toEqual([])
}

test.each(["provider connection", "provider options", "agent engine"] as const)("E6 App Local refreshes the same canonical ref after %s", async (change) => {
  const calls = transport()
  const owner = selection(calls, "session-1")
  try { await refreshed(calls, owner, owner.local.model, change) }
  finally { owner.dispose() }
})

test.each(["provider connection", "provider options", "agent engine"] as const)("E6 App draft selector refreshes the same canonical ref after %s", async (change) => {
  const calls = transport()
  const owner = draftSelection(calls)
  try { await refreshed(calls, owner.source, owner.model, change) }
  finally { owner.dispose() }
})

test("E6 App metadata context excludes raw choice, local policy and reconnect generations", async () => {
  const calls = transport()
  const actual = liveSDK(calls)
  const owner = selection(calls, "session-1", actual)
  try {
    await wait(() => actual.greetings.length === 1 && owner.local.model.execution.ready(), "actual SDK and Local ready control")
    const context = owner.local.model.execution.context()
    owner.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
    await wait(() => owner.local.model.intent().model?.modelID === "blocked", "actual raw model changed")
    owner.local.model.variant.set("high")
    await wait(() => owner.local.model.intent().variant === "high", "actual raw variant changed")
    expect(owner.local.model.execution.context()).toBe(context)
    await actual.sdk.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
    expect(actual.sdk.sessionManagement.subagentModelsWriteVersion("session-1")).toBe(1)
    expect(owner.local.model.execution.context()).toBe(context)
    emit(calls, { id: "context-only-reconnect", type: "server.connected", data: {} })
    await wait(() => actual.greetings.length === 2, "actual second greeting parsed")
    expect(owner.local.model.execution.context()).toBe(context)
    expect(calls.admissions()).toEqual([])
  } finally { owner.dispose(); actual.dispose() }
})

test("E6 App metadata A to B to A cannot publish the initial held ready response", async () => {
  const release = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<void>()
  const witness: { signal?: AbortSignal } = {}
  const calls = transport({ reply: async (request) => {
    witness.signal = request.signal
    await release.promise
    returned.resolve()
    return json({ location: { directory: calls.directory }, data: decision() })
  } })
  const owner = selection(calls, "session-1")
  try {
    await wait(() => witness.signal !== undefined, "actual initial canonical request entered")
    expect(calls.queries()).toHaveLength(1)
    const initial = owner.local.model.execution.context()
    calls.control.reply = () => json({ location: { directory: calls.directory }, data: decision() })
    owner.setMetadata("agent", 0, "engine", "claude-code")
    await wait(() => owner.local.model.execution.ready(), "B response applied while A is held")
    expect(witness.signal?.aborted).toBe(true)
    const beforeA = calls.queries().length
    calls.control.reply = () => json({ location: { directory: calls.directory }, data: refused() })
    owner.setMetadata("agent", 0, "engine", "orchestra")
    await wait(() => calls.queries().length > beforeA && owner.local.model.execution.read().status === "ready", "fresh A refusal applied")
    expect(owner.local.model.execution.context()).toBe(initial)
    expect(owner.local.model.execution.ready()).toBe(false)
    release.resolve()
    await returned.promise
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(owner.local.model.execution.ready()).toBe(false)
    expect(calls.admissions()).toEqual([])
  } finally { release.resolve(); owner.dispose() }
})

test.each(["catalog.updated", "integration.connection.updated"] as const)("E6 App actual SDK scopes semantic %s refresh without a reconnect or metadata delta", async (type) => {
  const calls = transport()
  const actual = liveSDK(calls)
  const owner = selection(calls, "session-1", actual)
  const seen = new Set<string>()
  const unsubscribe = actual.sdk.event.listen((event) => seen.add(event.details.id))
  try {
    await wait(() => actual.greetings.length === 1 && owner.local.model.execution.ready(), "actual SSE greeting and initial canonical response")
    owner.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await wait(() => owner.local.model.intent().model?.providerID === ref.providerID && owner.local.model.intent().model?.modelID === ref.id, "explicit raw intent committed before scope counters")
    await wait(() => owner.local.model.execution.ready(), "explicit same ref ready")
    const reconnect = actual.sdk.connectionEpoch?.()
    const input = calls.queries().at(-1)?.body
    for (const scope of ["other directory", "explicit workspace", "global", "matching directory"] as const) {
      const id = `${type}-${scope}`
      const before = calls.queries().length
      const context = owner.local.model.execution.context()
      const accepted = scope === "global" || scope === "matching directory"
      calls.control.reply = () => json({ location: { directory: calls.directory }, data: scope === "global" ? refused() : decision() })
      emit(calls, { id, type, data: type === "catalog.updated" ? {} : { integrationID: "integration-1" },
        ...(scope === "global" ? {} : { location: { directory: scope === "other directory" ? "/other/directory" : calls.directory,
          ...(scope === "explicit workspace" ? { workspaceID: "worktree-1" } : {}) } }) })
      await wait(() => seen.has(id), "actual native event consumed before scope assertions")
      if (!accepted) {
        expect(calls.queries()).toHaveLength(before)
        expect(owner.local.model.execution.context()).toBe(context)
      }
      if (accepted) {
        await wait(() => calls.queries().length > before && owner.local.model.execution.read().status === "ready", "accepted semantic event produces a fresh response")
        expect(owner.local.model.execution.context()).not.toBe(context)
        expect(calls.queries().at(-1)?.body).toEqual(input)
        expect(owner.local.model.execution.ready()).toBe(scope !== "global")
      }
      expect(actual.sdk.connectionEpoch?.()).toBe(reconnect)
    }
  } finally { unsubscribe(); owner.dispose(); actual.dispose() }
})

test("E6 App semantic change aborts a held actual admission query before release and cannot POST", async () => {
  const calls = transport()
  const actual = liveSDK(calls)
  const selected = selection(calls, "session-1", actual)
  const owner = composer("held semantic query", { model: selected.local.model })
  const release = Promise.withResolvers<void>()
  const witness: { signal?: AbortSignal } = {}
  const tasks: Promise<unknown>[] = []
  try {
    selected.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await wait(() => actual.greetings.length === 1 && selected.local.model.execution.ready(), "real consumer and SDK ready before fault")
    calls.control.reply = async (request) => {
      witness.signal ??= request.signal
      await release.promise
      return json({ location: { directory: calls.directory }, data: decision() })
    }
    const before = calls.calls.length
    const pending = send(owner)
    tasks.push(pending)
    await wait(() => witness.signal !== undefined || calls.admissions().length > 0, "actual admission canonical request or POST entered")
    expect(witness.signal).toBeDefined()
    expect(calls.calls.slice(before).filter((call) => /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    emit(calls, { id: "held-integration-change", type: "integration.connection.updated", data: { integrationID: "integration-1" }, location: { directory: calls.directory } })
    await wait(() => witness.signal?.aborted === true, "owned admission query is aborted before releasing its transport")
    release.resolve()
    expect(await pending).toBe(false)
    expect(calls.calls.slice(before).filter((call) => /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    expect(owner.prompt.current()).toEqual([{ type: "text", content: "held semantic query", start: 0, end: 19 }])
  } finally { release.resolve(); await Promise.allSettled(tasks); owner.dispose(); selected.dispose(); actual.dispose() }
})

test.each(["matching empty", "different model", "raw null", "raw empty"] as const)("E6 App preserves configured and raw empty variant semantics through canonical and SDK requests: %s", async (choice) => {
  const calls = transport({ reply: async (request) => {
    const input = Schema.decodeUnknownSync(ModelExecution.Input)(await request.clone().json())
    return json({ location: { directory: calls.directory }, data: decision("ready", input.model?.variant) })
  } })
  const selected = selection(calls, "session-1")
  const configured = { model: { providerID: ref.providerID, modelID: choice === "different model" ? "other" : ref.id }, variant: choice === "raw empty" ? "high" : "" }
  state.agentID = "maestro"
  state.agentConfig = configured
  selected.setMetadata("agent", 0, "model", configured.model)
  selected.setMetadata("agent", 0, "variant", configured.variant)
  selected.local.model.set({ providerID: ref.providerID, modelID: ref.id })
  if (choice === "raw null") selected.local.model.variant.set(undefined)
  if (choice === "raw empty") selected.local.model.variant.set("")
  const owner = composer(`empty variant ${choice}`, { model: selected.local.model })
  try {
    const expected = choice === "matching empty" || choice === "raw empty" ? "" : undefined
    await wait(() => selected.local.model.execution.ready(), "configured/raw variant canonical ready control")
    expect(selected.local.model.execution.input().model?.variant).toBe(expected)
    expect(await send(owner)).toBe(true)
    const query = Schema.decodeUnknownSync(ModelExecution.Input)(calls.queries().at(-1)?.body)
    expect(query.model?.variant).toBe(expected)
    expect(calls.calls.filter((call) => call.path.endsWith("/model")).at(-1)?.body)
      .toEqual({ model: expected === undefined ? ref : { ...ref, variant: expected } })
  } finally { owner.dispose(); selected.dispose() }
})

test("E6 App actual directory SDK survives the first consumer, stops at last ref, reacquires fresh and closes with provider", async () => {
  const calls = transport()
  const actual = liveSDK(calls)
  const directory = "/shared/directory"
  const disposers: VoidFunction[] = []
  const ordinary: string[] = []
  const processed = new Set<string>()
  const off = actual.sdk.event.listen((event) => processed.add(event.details.id))
  const acquire = () => createRoot((dispose) => {
    disposers.push(dispose)
    return { sdk: actual.sdk.ensureDirSdkContext(directory), dispose }
  })
  const first = acquire()
  const second = acquire()
  const unsubscribe = second.sdk.event.on("catalog.updated", (event) => ordinary.push(event.id))
  try {
    await wait(() => actual.greetings.length === 1, "native SSE connection control")
    expect(first.sdk).toBe(second.sdk)
    emit(calls, { id: "shared-before-first", type: "catalog.updated", data: {}, location: { directory } })
    await wait(() => ordinary.includes("shared-before-first") && second.sdk.modelExecutionEpoch() === 1, "ordinary fanout and semantic nonce positive control before disposal")
    first.dispose()
    emit(calls, { id: "shared-after-first", type: "catalog.updated", data: {}, location: { directory } })
    await wait(() => ordinary.includes("shared-after-first") && second.sdk.modelExecutionEpoch() === 2, "both ordinary fanout and nonce survive first consumer disposal")
    second.dispose()
    emit(calls, { id: "shared-after-last", type: "catalog.updated", data: {}, location: { directory } })
    await wait(() => processed.has("shared-after-last"), "native event processed after final ref release")
    expect(ordinary).toEqual(["shared-before-first", "shared-after-first"])
    expect(second.sdk.modelExecutionEpoch()).toBe(2)
    const third = acquire()
    expect(third.sdk).not.toBe(second.sdk)
    expect(third.sdk.modelExecutionEpoch()).toBe(0)
    emit(calls, { id: "shared-after-reacquire", type: "catalog.updated", data: {}, location: { directory } })
    await wait(() => third.sdk.modelExecutionEpoch() === 1, "fresh root observes subsequent native events")
    expect(ordinary).toEqual(["shared-before-first", "shared-after-first"])
    actual.dispose()
    expect(calls.calls.find((call) => call.path === "/api/event")?.signal.aborted).toBe(true)
    expect(() => actual.sdk.ensureDirSdkContext(directory)).toThrow("Server SDK is closed")
  } finally { unsubscribe(); off(); disposers.forEach((dispose) => dispose()); actual.dispose() }
})
