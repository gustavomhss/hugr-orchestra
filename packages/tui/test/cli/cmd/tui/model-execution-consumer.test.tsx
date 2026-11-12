/** @jsxImportSource @opentui/solid */
import { expect, spyOn, test } from "bun:test"
import { reconcile } from "solid-js/store"
import { Schema } from "effect"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { json } from "../../../fixture/tui-sdk"
import { decision, mount, ready, ref, wait } from "./model-execution-consumer.fixture"

// The rendered Prompt and model dialog consume real SDK/catalog/context implementations.
// Controlled endpoint decisions prove consumption; backend eligibility is covered independently.
test("CONTROL E6 TUI generated SDK serializes draft lineage, authorization, Location and exact variant", async () => {
  const fixture = await ready()
  try {
    const before = fixture.queries().length
    fixture.control.reply = () => json({ location: { directory: "/other/location" }, data: decision("unavailable", "high") })
    const result = await fixture.context.sdk.api.models.execution({ location: { directory: "/other/location", workspace: "worktree-1" },
      context: { type: "draft", parentID: "parent-1", agentID: "maestro" }, model: { ...ref, variant: "high" } })
    const queries = fixture.queries().slice(before)
    expect(queries).toHaveLength(1)
    expect(queries[0]).toMatchObject({ method: "POST", authorization: "Basic Zml4dHVyZTpub25l", body: {
      context: { type: "draft", parentID: "parent-1", agentID: "maestro" }, model: { ...ref, variant: "high" },
    } })
    expect(queries[0]?.url.searchParams.get("location[directory]")).toBe("/other/location")
    expect(queries[0]?.url.searchParams.get("location[workspace]")).toBe("worktree-1")
    const response = Schema.decodeUnknownSync(ModelExecution.Response)(result.data)
    expect(response.models.map((entry) => entry.status)).toEqual(["ready", "unsupported"])
    expect(response.selection).toMatchObject({ status: "unavailable", reason: "variant-unavailable", ref: { ...ref, variant: "high" } })
  } finally { await fixture.dispose() }
})

test.each([false, true])("CONTROL E6 TUI ordinary ready Prompt uses the actual adapter RPC order; draft=%s", async (draft) => {
  const fixture = await ready({ draft })
  try {
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: ref.id })
    expect(fixture.context.sdk.connectionEpoch()).toBe(1)
    fixture.prompt.set({ input: "ready control", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.admissions().length === 1, "actual generated Session prompt POST")
    const writes = fixture.calls.filter((call) => call.method === "POST" && call.path !== "/api/model/execution")
    expect(writes.map((call) => call.path.split("/").at(-1))).toEqual(draft ? ["session", "agent", "model", "prompt"] : ["agent", "model", "prompt"])
    expect(writes.at(-1)?.body).toMatchObject({ prompt: { text: "ready control" } })
    expect(fixture.prompt.current.input).toBe("")
  } finally { await fixture.dispose() }
})

test.each(["unsupported", "unavailable", "transport", 400, 404, 503] as const)("E6 TUI fresh ordinary submit blocks %s before selection and retains editor", async (failure) => {
  const fixture = await ready()
  try {
    const before = fixture.queries().length
    const checkpoint = fixture.calls.length
    fixture.control.reply = () => {
      if (failure === "transport") throw new TypeError("canonical metadata unavailable")
      return typeof failure === "number" ? json({ _tag: "FixtureUnavailable", message: "not ready" }, { status: failure })
        : json({ location: { directory: fixture.owner.directory }, data: decision(failure) })
    }
    fixture.prompt.set({ input: "keep this draft", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > before || fixture.admissions().length > 0, "NEW submit preflight or baseline POST")
    expect(fixture.queries().length).toBeGreaterThan(before)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: ref })
    await Bun.sleep(0)
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    expect(fixture.prompt.current.input).toBe("keep this draft")
  } finally { await fixture.dispose() }
})

test("E6 TUI a ready model row cannot authorize its unavailable exact variant", async () => {
  const fixture = await ready()
  try {
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: decision("ready", "high") })
    fixture.context.local.model.variant.set("high")
    await wait(() => fixture.context.local.model.variant.current() === "high", "real high variant choice")
    await Bun.sleep(0)
    const before = fixture.queries().length
    const checkpoint = fixture.calls.length
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: decision("unavailable", "high") })
    fixture.prompt.set({ input: "high variant", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > before || fixture.admissions().length > 0, "NEW exact variant query or baseline POST")
    expect(fixture.queries().length).toBeGreaterThan(before)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: { ...ref, variant: "high" } })
    await Bun.sleep(0)
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    expect(fixture.prompt.current.input).toBe("high variant")
  } finally { await fixture.dispose() }
})

test("E6 TUI draft canonical context omits nonexistent UI parentID and blocks before creating a Session", async () => {
  const fixture = await ready({ draft: true })
  try {
    const before = fixture.queries().length
    const checkpoint = fixture.calls.length
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: decision("unsupported") })
    fixture.prompt.set({ input: "unavailable draft", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > before || fixture.admissions().length > 0, "NEW draft preflight or baseline POST")
    expect(fixture.queries().length).toBeGreaterThan(before)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "draft", agentID: "maestro" }, model: ref })
    const context = Schema.decodeUnknownSync(ModelExecution.Input)(fixture.queries().at(-1)?.body).context
    expect("parentID" in context).toBe(false)
    await Bun.sleep(0)
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && (call.path === "/api/session" || /\/(agent|model|prompt)$/.test(call.path)))).toEqual([])
    expect(fixture.prompt.current.input).toBe("unavailable draft")
  } finally { await fixture.dispose() }
})

test("E6 TUI explicit removed choice stays selected instead of silently choosing a supported catalog entry", async () => {
  const fixture = await ready()
  try {
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: ref.id })
    fixture.context.sync.set("provider", 0, "models", reconcile({ blocked: fixture.context.sync.data.provider[0]!.models.blocked! }))
    await Bun.sleep(0)
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: ref.id })
    fixture.showModels()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Select model") }, "actual model dialog rendered")
    await fixture.app.renderOnce()
    expect(fixture.app.captureCharFrame()).toContain("Consumer model")
  } finally { await fixture.dispose() }
})

test("E6 TUI one context query feeds all dialog rows and exposes unsupported model without enabling it", async () => {
  const fixture = await ready()
  try {
    const beforeDialog = fixture.queries().length
    fixture.showModels()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Blocked model") }, "catalog row rendered by real DialogModel")
    await fixture.app.renderOnce()
    expect(fixture.app.captureCharFrame()).toContain("Consumer model")
    expect(fixture.queries().length).toBeGreaterThan(0)
    expect(fixture.queries().length - beforeDialog).toBeLessThanOrEqual(1)
    const inputs = fixture.queries().slice(beforeDialog).map((call) => JSON.stringify(Schema.decodeUnknownSync(ModelExecution.Input)(call.body)))
    expect(new Set(inputs).size, "one context/ref query per dialog generation; earlier raw-intent generations may repeat the wire input").toBe(inputs.length)
    // Choosing a disabled row must keep the real current selection. No UI wording or reason-key policy is prescribed.
    fixture.app.mockInput.pressKey("b")
    await fixture.app.renderOnce()
    fixture.app.mockInput.pressEnter()
    await Bun.sleep(0)
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: ref.id })
  } finally { await fixture.dispose() }
})

test.each(["Session ABA", "raw model", "variant", "reconnect", "disposal", "directory ABA", "server ABA", "credentials ABA", "agent"])("E6 TUI pending canonical answer cannot dispatch after %s", async (change) => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const fixture = await ready()
  try {
    const before = fixture.queries().length
    const checkpoint = fixture.calls.length
    fixture.control.reply = async () => {
      const captured = json({ location: { directory: fixture.owner.directory }, data: decision() })
      entered.resolve()
      await release.promise
      return captured
    }
    fixture.prompt.set({ input: "pending context", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > before || fixture.admissions().length > 0, "NEW held submit query or baseline POST")
    expect(fixture.queries().length).toBeGreaterThan(before)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: ref })
    await entered.promise
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
    if (change === "Session ABA") {
      fixture.setOwner("sessionID", "session-2")
      fixture.context.route.navigate({ type: "session", sessionID: "session-2" })
      await Bun.sleep(0)
      fixture.setOwner("sessionID", "session-1")
      fixture.context.route.navigate({ type: "session", sessionID: "session-1" })
    }
    if (change === "raw model") fixture.context.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
    if (change === "variant") fixture.context.local.model.variant.set("high")
    if (change === "agent") fixture.context.local.agent.set("backend")
    if (change === "reconnect") fixture.events.emit({ directory: fixture.root, workspace: undefined, payload: { id: "e6-reconnect", type: "server.connected", data: {} } })
    if (change === "disposal") await fixture.dispose()
    if (change.endsWith(" ABA") && change !== "Session ABA") {
      const key = change === "directory ABA" ? "directory" : change === "server ABA" ? "url" : "authorization"
      const old = fixture.owner[key]
      const previous = fixture.context.sdk
      fixture.setOwner(key, change === "directory ABA" ? "/other/location" : change === "server ABA" ? "http://other.fixture" : "Basic b3RoZXI6bm9uZQ==")
      await fixture.reload()
      await wait(() => fixture.context.sdk !== previous, "provider rebind after departure")
      const alternate = fixture.context.sdk
      fixture.setOwner(key, old)
      await fixture.reload()
      await wait(() => fixture.context.sdk !== alternate, "provider rebind after ABA return")
    }
    release.resolve()
    await Bun.sleep(0)
    await Bun.sleep(0)
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
  } finally { release.resolve(); await fixture.dispose() }
})

test("CONTROL E6 TUI shell is not blocked solely by unavailable model eligibility", async () => {
  const fixture = await ready()
  try {
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: decision("unavailable") })
    const queriesBeforeShell = fixture.queries().length
    fixture.prompt.set({ input: "", parts: [], mode: "normal" })
    fixture.prompt.focus()
    await fixture.app.mockInput.pressKey("!")
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Shell") }, "actual shell-mode key binding")
    fixture.prompt.set({ input: "pwd", parts: [], mode: "shell" })
    fixture.prompt.submit()
    await wait(() => fixture.calls.some((call) => call.path.endsWith("/shell")), "actual shell POST")
    expect(fixture.queries()).toHaveLength(queriesBeforeShell)
    expect(fixture.admissions()).toEqual([])
    expect(fixture.calls.filter((call) => call.method === "POST" && call.path !== "/api/model/execution").map((call) => call.path.split("/").at(-1))).toEqual(["shell"])
  } finally { await fixture.dispose() }
})


test("E6 TUI absent raw choice does not install a catalog default while canonical selection is loading", async () => {
  const release = Promise.withResolvers<void>()
  const fixture = await mount({ reply: async () => { await release.promise; return json({ location: { directory: fixture.owner.directory }, data: decision() }) } })
  try {
    await Bun.sleep(0)
    expect(fixture.queries()).toHaveLength(1)
    expect(fixture.context.local.model.current()).toBeUndefined()
    fixture.prompt.set({ input: "wait for canonical default", parts: [], mode: "normal" })
    fixture.prompt.submit()
    expect(fixture.admissions()).toEqual([])
    release.resolve()
    await wait(() => fixture.context.local.model.current()?.modelID === ref.id, "canonical automatic default")
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: ref.id })
  } finally { release.resolve(); await fixture.dispose() }
})


test("CONTROL E6 TUI ready known command preserves its actual selection RPC order", async () => {
  const fixture = await ready()
  try {
    await wait(() => fixture.context.sync.data.command.some((command) => command.name === "known"), "real command catalog")
    const checkpoint = fixture.calls.length
    fixture.prompt.set({ input: "/known value", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.calls.slice(checkpoint).some((call) => call.path.endsWith("/command")), "actual ready known command POST")
    expect(fixture.admissions()).toEqual([])
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && call.path !== "/api/model/execution").map((call) => call.path.split("/").at(-1))).toEqual(["agent", "model", "command"])
  } finally { await fixture.dispose() }
})

test("E6 TUI unavailable known command requires a NEW canonical query before any selection or command RPC", async () => {
  const fixture = await ready()
  try {
    await wait(() => fixture.context.sync.data.command.some((command) => command.name === "known"), "real command catalog")
    const before = fixture.queries().length
    const checkpoint = fixture.calls.length
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: decision("unavailable") })
    fixture.prompt.set({ input: "/known value", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > before || fixture.calls.slice(checkpoint).some((call) => call.path.endsWith("/command")), "NEW command preflight or baseline command POST")
    expect(fixture.queries().length).toBeGreaterThan(before)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: ref })
    await Bun.sleep(0)
    expect(fixture.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|command|prompt)$/.test(call.path))).toEqual([])
    expect(fixture.prompt.current.input).toBe("/known value")
  } finally { await fixture.dispose() }
})

test("E6 TUI rendered selector keeps NEW A after A to B to A and a late old A response", async () => {
  const release = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<void>()
  const both = { ...decision(), models: decision().models.map((entry) => ({ model: entry.model, engine: entry.engine, status: "ready" as const })) }
  const bothB = Schema.decodeUnknownSync(ModelExecution.Response)({ ...both, selection: { status: "ready", ref: { ...ref, id: "blocked" }, engine: "orchestra" } })
  const newest = { ...decision(), models: both.models.filter((entry) => entry.model.id === ref.id) }
  const fixture = await ready({ initial: both })
  const selecting = spyOn(fixture.context.local.model, "set")
  try {
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: both })
    const manualBefore = fixture.queries().length
    const contract = await fixture.context.sdk.api.models.execution({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: ref })
    expect(fixture.queries()).toHaveLength(manualBefore + 1)
    expect(contract.data.models.map((entry) => entry.model.id)).toEqual(["model", "blocked"])
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: bothB })
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
    await wait(() => fixture.context.local.model.current()?.modelID === "blocked", "real READY seed B choice")
    await Bun.sleep(0)
    fixture.showModels()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Consumer model") }, "actual READY selector rendered")
    const beforeA = fixture.queries().length
    fixture.control.reply = async () => {
      const captured = json({ location: { directory: fixture.owner.directory }, data: both })
      entered.resolve()
      await release.promise
      returned.resolve()
      return captured
    }
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await fixture.app.renderOnce()
    await Bun.sleep(0)
    expect(fixture.queries().length).toBeGreaterThan(beforeA)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: ref })
    await entered.promise
    const beforeB = fixture.queries().length
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: bothB })
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
    await fixture.app.renderOnce()
    await Bun.sleep(0)
    expect(fixture.queries().length).toBeGreaterThan(beforeB)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: { ...ref, id: "blocked" } })
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Blocked model") }, "B response actually rendered")
    const beforeNewA = fixture.queries().length
    fixture.control.reply = () => json({ location: { directory: fixture.owner.directory }, data: newest })
    fixture.context.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await fixture.app.renderOnce()
    await Bun.sleep(0)
    expect(fixture.queries().length).toBeGreaterThan(beforeNewA)
    expect(fixture.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "session-1", agentID: "maestro" }, model: ref })
    await wait(() => { void fixture.app.renderOnce(); const frame = fixture.app.captureCharFrame(); return frame.includes("Consumer model") && !frame.includes("Blocked model") }, "NEW A model list applied")
    release.resolve()
    await returned.promise
    await fixture.app.renderOnce()
    await Bun.sleep(0)
    expect(fixture.app.captureCharFrame()).toContain("Consumer model")
    expect(fixture.app.captureCharFrame()).not.toContain("Blocked model")
    expect(fixture.context.local.model.current()).toEqual({ providerID: ref.providerID, modelID: ref.id })
    const selectionsBeforeMissingB = selecting.mock.calls.length
    await fixture.app.mockInput.pressKey("b")
    await fixture.app.renderOnce()
    await fixture.app.mockInput.pressEnter()
    await Bun.sleep(0)
    expect(selecting.mock.calls).toHaveLength(selectionsBeforeMissingB)
    expect(fixture.context.sync.data.provider[0]?.models.blocked, "catalog B remains; only the canonical context list changed").toBeDefined()
    await fixture.app.mockInput.pressKey("backspace")
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Consumer model") }, "original dialog restores A after clearing the missing-B search")
    const selectedBefore = selecting.mock.calls.length
    await fixture.app.mockInput.pressEnter()
    await wait(() => selecting.mock.calls.length === selectedBefore + 1, "NEW A ready row invokes the real set method after OLD A settled")
    expect(selecting.mock.calls.at(-1)?.[0]).toEqual({ providerID: ref.providerID, modelID: ref.id })
  } finally { release.resolve(); selecting.mockRestore(); await fixture.dispose() }
})
