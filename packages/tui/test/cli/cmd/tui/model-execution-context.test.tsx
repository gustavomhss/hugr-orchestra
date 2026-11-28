/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { Agent } from "@orchestra/schema/agent"
import { Model } from "@orchestra/schema/model"
import { Provider } from "@orchestra/schema/provider"
import { json } from "../../../fixture/tui-sdk"
import { decision, model, mount, ready, ref, wait } from "./model-execution-consumer.fixture"

// Explicit controlled canonical responses; the actual SDK, Local provider and Prompt consume them.
function refused(variant?: string) {
  return ModelExecution.Response.make({ ...decision("unavailable", variant),
    models: [{ model, status: "unavailable", reason: "variant-unavailable", engine: "orchestra" }] })
}
async function readyReply(request: Request) {
  const input = Schema.decodeUnknownSync(ModelExecution.Input)(await request.clone().json())
  return json({ location: { directory: new URL(request.url).searchParams.get("location[directory]") },
    data: decision("ready", input.model?.variant) })
}

test("E6 TUI uses a resumed Session's workspace for visual, semantic and admission checks", async () => {
  const directory = "/other/checkout"
  const workspace = "wrk_resumed"
  const fixture = await ready({ session: { location: { directory, workspaceID: workspace } }, reply: readyReply })
  try {
    const isPlacement = (url: URL) => url.searchParams.get("location[directory]") === directory &&
      url.searchParams.get("location[workspace]") === workspace
    await wait(() => fixture.queries().some((call) => isPlacement(call.url)), "the visual query uses the resumed Session's placement")
    const before = fixture.queries().length
    fixture.events.emit({ directory, workspace, payload: { id: "resumed-catalog", type: "catalog.updated", data: {} } })
    await wait(() => fixture.queries().length > before, "semantic refresh for the resumed checkout")
    expect(fixture.queries().slice(before).every((call) => isPlacement(call.url))).toBe(true)

    fixture.control.reply = (request) => isPlacement(new URL(request.url))
      ? readyReply(request)
      : json({ _tag: "ModelExecutionContextNotFoundError", message: "wrong placement", reason: "session-missing" }, { status: 404 })
    fixture.prompt.set({ input: "resume at the saved placement", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1, "the prompt reaches the known Session after preflight")
    const query = fixture.queries().at(-1)
    expect(query && isPlacement(query.url)).toBe(true)
    expect(query?.body).toMatchObject({ context: { type: "session", sessionID: "session-1" } })
  } finally { await fixture.dispose() }
})

test("E6 TUI can choose a canonical model for a persisted checkout-local agent", async () => {
  const localAgent = "checkout-local"
  const secondModel = Model.Info.make({ ...model, id: Model.ID.make("second-model"), name: "Second checkout model" })
  const fixture = await mount({ session: { agent: localAgent, model: ref }, reply: async (request) => {
    const input = Schema.decodeUnknownSync(ModelExecution.Input)(await request.clone().json())
    if (input.context.agentID !== localAgent) return json({ message: "wrong agent" }, { status: 404 })
    return json({ location: { directory: "/checkout" }, data: {
      ...decision(), models: [...decision().models, { model: secondModel, status: "ready", engine: "orchestra" }],
      selection: { status: "ready", engine: "orchestra", ref: input.model ?? ref },
    } })
  } })
  try {
    const choice = { providerID: ref.providerID, modelID: secondModel.id }
    expect(fixture.context.local.agent.id()).toBe(localAgent)
    expect(fixture.context.local.agent.current()).toBeUndefined()
    await wait(() => fixture.context.local.model.execution.allows(choice), "canonical checkout approves model for persisted agent")
    fixture.context.local.model.set(choice, { recent: true })
    expect(fixture.context.local.model.current()).toEqual(choice)
    expect(fixture.context.local.agent.id()).toBe(localAgent)
  } finally { await fixture.dispose() }
})

test("E6 TUI model picker drops a late answer from the previous draft checkout", async () => {
  const fixture = await ready({ draft: true })
  const release = Promise.withResolvers<void>()
  try {
    const entered = Promise.withResolvers<AbortSignal>()
    const previous = "/other/previous"
    const next = "/other/next"
    fixture.control.reply = async (request) => {
      const directory = new URL(request.url).searchParams.get("location[directory]")
      if (directory === previous) {
        entered.resolve(request.signal)
        await release.promise
      }
      const scoped = Model.Info.make({ ...model, name: directory === next ? "Next checkout model" : "Previous checkout model" })
      return json({ location: { directory }, data: { ...decision(), models: [{ model: scoped, status: "ready", engine: "orchestra" }] } })
    }
    fixture.context.home?.setDestination({ type: "directory", directory: previous, subdirectory: false })
    const oldRequest = await entered.promise
    fixture.context.home?.setDestination({ type: "directory", directory: next, subdirectory: false })
    await wait(() => oldRequest.aborted, "the prior draft checkout query was canceled")
    fixture.showModels()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Next checkout model") }, "the selected checkout's catalog is visible")
    release.resolve()
    await Bun.sleep(0)
    await fixture.app.renderOnce()
    expect(fixture.app.captureCharFrame()).toContain("Next checkout model")
    expect(fixture.app.captureCharFrame()).not.toContain("Previous checkout model")
  } finally { release.resolve(); await fixture.dispose() }
})

test("E6 TUI preserves a removed persisted model and agent even when the Session has no history", async () => {
  const removed = { ...ref, id: "removed", variant: "" }
  const fixture = await mount({ session: { agent: "backend", model: removed }, reply: () => json({ location: { directory: "/checkout" }, data: {
    ...decision(), selection: { status: "unavailable", reason: "model-missing", engine: "orchestra", ref: removed },
  } }) })
  try {
    await wait(() => fixture.queries().some((call) => JSON.stringify(call.body).includes("removed")), "read the persisted removed ref")
    expect(fixture.context.sync.data.message["session-1"] ?? []).toHaveLength(0)
    expect(fixture.context.local.agent.id()).toBe("backend")
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: removed.id })
    const before = fixture.queries().length
    fixture.prompt.set({ input: "preserve the saved choice", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.context.toast.currentToast?.message === "Model is no longer available", "the saved model's refusal is shown")
    expect(fixture.queries().slice(before).at(-1)?.body).toEqual({
      context: { type: "session", sessionID: "session-1", agentID: "backend" }, model: removed,
    })
    expect(fixture.admissions()).toEqual([])
    expect(fixture.prompt.current.input).toBe("preserve the saved choice")
  } finally { await fixture.dispose() }
})

test.each(["provider connection", "provider options", "agent engine"] as const)("E6 TUI refreshes the same canonical ref after %s", async (change) => {
  const fixture = await ready()
  try {
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "initial canonical response applied")
    const before = fixture.queries().length
    const context = fixture.context.local.model.execution.context()
    const revision = fixture.context.sync.data.catalogRevision
    const legacy = JSON.stringify({ agents: fixture.context.sync.data.agent, providers: fixture.context.sync.data.provider })
    const input = fixture.queries().at(-1)?.body
    const intent = fixture.context.local.model.intent()
    fixture.control.reply = () => json({ location: { directory: fixture.root }, data: refused() })
    if (change === "provider connection") fixture.control.catalogProviders = fixture.control.catalogProviders.map((provider) => Provider.Info.make({ ...provider, disabled: true }))
    if (change === "provider options") fixture.control.catalogProviders = fixture.control.catalogProviders.map((provider) => Provider.Info.make({ ...provider,
      api: { type: "native", settings: { fixtureEndpoint: "changed" } } }))
    if (change === "agent engine") fixture.control.catalogAgents = fixture.control.catalogAgents.map((agent, index) => index === 0 ? Agent.Info.make({ ...agent, engine: "claude-code" }) : agent)
    await fixture.context.sync.bootstrap({ fatal: false })
    expect(fixture.context.sync.data.catalogRevision).toBe(revision + 1)
    if (change !== "provider connection")
      expect(JSON.stringify({ agents: fixture.context.sync.data.agent, providers: fixture.context.sync.data.provider })).toBe(legacy)
    await wait(() => fixture.queries().length > before && fixture.context.local.model.execution.read().status === "ready", "metadata-only change obtains a fresh canonical response")
    expect(fixture.context.local.model.execution.context()).not.toBe(context)
    expect(fixture.queries().at(-1)?.body).toEqual(input)
    expect(fixture.context.local.model.intent()).toEqual(intent)
    expect(fixture.context.local.model.execution.allows({ providerID: ref.providerID, modelID: ref.id })).toBe(false)
    expect(fixture.admissions()).toEqual([])
  } finally { await fixture.dispose() }
})

test("E6 TUI metadata context excludes raw choice and reconnect generations", async () => {
  const fixture = await ready()
  try {
    const context = fixture.context.local.model.execution.context()
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
    fixture.context.local.model.variant.set("high")
    expect(fixture.context.local.model.intent()).toEqual({ model: { providerID: ref.providerID, modelID: "blocked" }, variant: "high" })
    expect(fixture.context.local.model.execution.context()).toBe(context)
    fixture.events.emit({ directory: fixture.root, workspace: undefined,
      payload: { id: "context-only-reconnect", type: "server.connected", data: {} } })
    await wait(() => fixture.context.sdk.connectionEpoch() === 2, "actual second greeting handled")
    expect(fixture.context.local.model.execution.context()).toBe(context)
    expect(fixture.admissions()).toEqual([])
  } finally { await fixture.dispose() }
})

test("E6 TUI a failed actual catalog bootstrap cannot publish a successful snapshot revision", async () => {
  const fixture = await ready()
  const witness = { agent: false }
  try {
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "canonical ready control before bootstrap failure")
    const revision = fixture.context.sync.data.catalogRevision
    const context = fixture.context.local.model.execution.context()
    const before = fixture.queries().length
    fixture.control.before = async (path) => {
      if (path !== "/api/agent") return
      witness.agent = true
      throw new TypeError("fixture agent metadata unavailable")
    }
    await expect(fixture.context.sync.bootstrap({ fatal: false })).rejects.toThrow()
    expect(witness.agent).toBe(true)
    expect(fixture.context.sync.data.catalogRevision).toBe(revision)
    expect(fixture.context.local.model.execution.context()).toBe(context)
    expect(fixture.queries()).toHaveLength(before)
    fixture.control.before = async () => {}
    await fixture.context.sync.bootstrap({ fatal: false })
    expect(fixture.context.sync.data.catalogRevision).toBe(revision + 1)
  } finally { await fixture.dispose() }
})

test("E6 TUI metadata A to B to A invalidates a held admission before its ready reply returns", async () => {
  const fixture = await ready()
  const release = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<void>()
  const witness: { signal?: AbortSignal } = {}
  try {
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "ready model before held admission")
    const initial = fixture.context.local.model.execution.context()
    const initialRevision = fixture.context.sync.data.catalogRevision
    const legacy = JSON.stringify(fixture.context.sync.data.agent)
    const originalEngine = fixture.control.catalogAgents[0]!.engine
    fixture.control.reply = async (request) => {
      witness.signal ??= request.signal
      await release.promise
      returned.resolve()
      return json({ location: { directory: fixture.root }, data: decision() })
    }
    const before = fixture.calls.length
    fixture.prompt.set({ input: "held metadata ABA", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => witness.signal !== undefined || fixture.admissions().length > 0, "actual held admission canonical request or POST entered")
    expect(witness.signal).toBeDefined()
    expect(fixture.calls.slice(before).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    fixture.control.reply = () => json({ location: { directory: fixture.root }, data: refused() })
    fixture.control.catalogAgents = fixture.control.catalogAgents.map((agent, index) => index === 0 ? Agent.Info.make({ ...agent, engine: "claude-code" }) : agent)
    await fixture.context.sync.bootstrap({ fatal: false })
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "B refusal applied while admission A is held")
    expect(witness.signal?.aborted).toBe(true)
    const beforeA = fixture.queries().length
    fixture.control.catalogAgents = fixture.control.catalogAgents.map((agent, index) => index === 0 ? Agent.Info.make({ ...agent, engine: originalEngine }) : agent)
    await fixture.context.sync.bootstrap({ fatal: false })
    await wait(() => fixture.queries().length > beforeA && fixture.context.local.model.execution.read().status === "ready", "fresh A refusal after ABA")
    expect(fixture.context.sync.data.catalogRevision).toBe(initialRevision + 2)
    expect(JSON.stringify(fixture.context.sync.data.agent)).toBe(legacy)
    expect(fixture.context.local.model.execution.context()).not.toBe(initial)
    release.resolve()
    await returned.promise
    await fixture.app.renderOnce()
    await Bun.sleep(0)
    expect(fixture.calls.slice(before).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    expect(fixture.prompt.current.input).toBe("held metadata ABA")
    expect(fixture.context.local.model.execution.allows({ providerID: ref.providerID, modelID: ref.id })).toBe(false)
  } finally { release.resolve(); await fixture.dispose() }
})

test.each(["catalog.updated", "integration.connection.updated"] as const)("E6 TUI actual SDK scopes semantic %s refresh without reconnect or metadata delta", async (type) => {
  const fixture = await ready()
  const seen = new Map<string, number>()
  const unsubscribe = fixture.context.sdk.event.on("event", (event) => seen.set(event.payload.id, fixture.context.sdk.modelExecutionEpoch()))
  try {
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "initial canonical view ready")
    const reconnect = fixture.context.sdk.connectionEpoch()
    const input = fixture.queries().at(-1)?.body
    for (const scope of ["other directory", "explicit workspace", "global", "matching directory"] as const) {
      const before = fixture.queries().length
      const context = fixture.context.local.model.execution.context()
      const semantic = fixture.context.sdk.modelExecutionEpoch()
      const id = `${type}-${scope}`
      const accepted = scope === "global" || scope === "matching directory"
      fixture.control.reply = () => json({ location: { directory: fixture.root }, data: scope === "global" ? refused() : decision() })
      fixture.events.emit({ directory: scope === "global" ? "global" : scope === "other directory" ? "/other/directory" : fixture.root,
        workspace: scope === "explicit workspace" ? "worktree-1" : undefined,
        payload: type === "catalog.updated" ? { id, type, data: {} }
          : { id, type, data: { integrationID: "integration-1" } } })
      await wait(() => seen.has(id), "actual SDK fanout observes the native event")
      expect(seen.get(id)).toBe(semantic + (accepted ? 1 : 0))
      if (!accepted) {
        expect(fixture.queries()).toHaveLength(before)
        expect(fixture.context.local.model.execution.context()).toBe(context)
      }
      if (accepted) {
        await wait(() => fixture.queries().length > before && fixture.context.local.model.execution.read().status === "ready", "accepted semantic change obtains a fresh response")
        expect(fixture.context.local.model.execution.context()).not.toBe(context)
        expect(fixture.queries().at(-1)?.body).toEqual(input)
        expect(fixture.context.local.model.execution.allows({ providerID: ref.providerID, modelID: ref.id })).toBe(scope !== "global")
      }
      expect(fixture.context.sdk.connectionEpoch()).toBe(reconnect)
    }
  } finally { unsubscribe(); await fixture.dispose() }
})

test("E6 TUI semantic native change aborts a held admission query before release and cannot POST", async () => {
  const fixture = await ready()
  const release = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<void>()
  const witness: { signal?: AbortSignal } = {}
  try {
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "initial canonical view applied")
    fixture.control.reply = async (request) => {
      witness.signal ??= request.signal
      await release.promise
      returned.resolve()
      return json({ location: { directory: fixture.root }, data: decision() })
    }
    const before = fixture.calls.length
    fixture.prompt.set({ input: "held semantic query", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => witness.signal !== undefined || fixture.admissions().length > 0, "actual held admission canonical request or POST entered")
    expect(witness.signal).toBeDefined()
    fixture.events.emit({ directory: fixture.root, workspace: undefined,
      payload: { id: "pending-semantic-change", type: "integration.connection.updated", data: { integrationID: "integration-1" } } })
    await wait(() => witness.signal?.aborted === true, "own query signal aborts before releasing the backend response")
    expect(fixture.calls.slice(before).filter((call) => /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    release.resolve()
    await returned.promise
    await fixture.app.renderOnce()
    await Bun.sleep(0)
    expect(fixture.calls.slice(before).filter((call) => /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    expect(fixture.prompt.current.input).toBe("held semantic query")
  } finally { release.resolve(); await fixture.dispose() }
})

test.each(["matching empty", "different model", "raw null", "raw empty"] as const)("E6 TUI preserves configured and raw empty variant semantics in canonical and SDK requests: %s", async (choice) => {
  const fixture = await ready()
  try {
    fixture.control.reply = readyReply
    fixture.control.catalogAgents = fixture.control.catalogAgents.map((agent, index) => index === 0 ? Agent.Info.make({ ...agent,
      model: Model.Ref.make({ providerID: Provider.ID.make(ref.providerID), id: Model.ID.make(choice === "different model" ? "other" : ref.id),
        variant: Model.VariantID.make(choice === "raw empty" ? "high" : "") }),
    }) : agent)
    await fixture.context.sync.bootstrap({ fatal: false })
    if (choice === "raw null") fixture.context.local.model.variant.set(undefined)
    if (choice === "raw empty") fixture.context.local.model.variant.set("")
    const expected = choice === "matching empty" || choice === "raw empty" ? Model.VariantID.make("") : undefined
    await wait(() => fixture.context.local.model.execution.read().status === "ready", "current configured/raw variant response applied")
    expect(fixture.context.local.model.execution.input().model?.variant).toBe(expected)
    fixture.prompt.set({ input: `empty variant ${choice}`, parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1, "actual generated prompt POST after exact variant preflight")
    const query = Schema.decodeUnknownSync(ModelExecution.Input)(fixture.queries().at(-1)?.body)
    expect(query.model?.variant).toBe(expected)
    expect(fixture.calls.filter((call) => call.path.endsWith("/model") && call.method === "POST").at(-1)?.body)
      .toEqual({ model: expected === undefined ? ref : { ...ref, variant: expected } })
  } finally { await fixture.dispose() }
})

test("E6 TUI explicit empty CLI variant reaches the actual setter and generated model payload unchanged", async () => {
  const fixture = await mount({ args: { model: `${ref.providerID}/${ref.id}`, variant: "" }, reply: readyReply })
  try {
    await wait(() => fixture.context.local.model.ready && fixture.context.local.model.execution.read().status === "ready", "CLI setter and asynchronous preferences settled")
    expect(fixture.context.local.model.intent().variant).toBe("")
    fixture.prompt.set({ input: "CLI empty variant", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1, "actual CLI-empty prompt reaches SDK")
    expect(Schema.decodeUnknownSync(ModelExecution.Input)(fixture.queries().at(-1)?.body).model?.variant).toBe(Model.VariantID.make(""))
    expect(fixture.calls.filter((call) => call.path.endsWith("/model") && call.method === "POST").at(-1)?.body)
      .toEqual({ model: { ...ref, variant: "" } })
  } finally { await fixture.dispose() }
})
