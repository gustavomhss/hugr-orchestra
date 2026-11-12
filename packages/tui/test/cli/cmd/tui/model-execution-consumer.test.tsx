/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { reconcile } from "solid-js/store"
import { Schema } from "effect"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { json } from "../../../fixture/tui-sdk"
import { decision, mount, ref, wait } from "./model-execution-consumer.fixture"

// The rendered Prompt and model dialog consume real SDK/catalog/context implementations.
// Controlled endpoint decisions prove consumption; backend eligibility is covered independently.
test("CONTROL E6 TUI generated SDK serializes draft lineage, authorization, Location and exact variant", async () => {
  const fixture = await mount({ reply: () => json({ location: { directory: "/other/location" }, data: decision("unavailable", "high") }) })
  try {
    const result = await fixture.context.sdk.api.models.execution({ location: { directory: "/other/location", workspace: "worktree-1" },
      context: { type: "draft", parentID: "parent-1", agentID: "maestro" }, model: { ...ref, variant: "high" } })
    expect(fixture.queries()).toHaveLength(1)
    expect(fixture.queries()[0]).toMatchObject({ method: "POST", authorization: "Basic Zml4dHVyZTpub25l", body: {
      context: { type: "draft", parentID: "parent-1", agentID: "maestro" }, model: { ...ref, variant: "high" },
    } })
    expect(fixture.queries()[0]?.url.searchParams.get("location[directory]")).toBe("/other/location")
    expect(fixture.queries()[0]?.url.searchParams.get("location[workspace]")).toBe("worktree-1")
    const response = Schema.decodeUnknownSync(ModelExecution.Response)(result.data)
    expect(response.models.map((entry) => entry.status)).toEqual(["ready", "unsupported"])
    expect(response.selection).toMatchObject({ status: "unavailable", reason: "variant-unavailable", ref: { ...ref, variant: "high" } })
  } finally { await fixture.dispose() }
})

test.each([false, true])("CONTROL E6 TUI ordinary ready Prompt uses the actual adapter RPC order; draft=%s", async (draft) => {
  const fixture = await mount({ draft })
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
  const fixture = await mount({ reply: () => {
    if (failure === "transport") throw new TypeError("canonical metadata unavailable")
    return typeof failure === "number" ? json({ _tag: "FixtureUnavailable", message: "not ready" }, { status: failure })
      : json({ location: { directory: "/repo" }, data: decision(failure) })
  } })
  try {
    fixture.prompt.set({ input: "keep this draft", parts: [], mode: "normal" })
    fixture.prompt.submit()
    // Witness either the new preflight or the baseline's actual admission; absence of a query is then a behavior failure.
    await wait(() => fixture.queries().length > 0 || fixture.admissions().length > 0, "preflight or baseline POST")
    await Bun.sleep(0)
    expect(fixture.admissions()).toEqual([])
    expect(fixture.calls.filter((call) => call.method === "POST" && call.path !== "/api/model/execution")).toEqual([])
    expect(fixture.prompt.current.input).toBe("keep this draft")
    expect(fixture.queries().length).toBeGreaterThanOrEqual(1)
  } finally { await fixture.dispose() }
})

test("E6 TUI a ready model row cannot authorize its unavailable exact variant", async () => {
  const fixture = await mount({ reply: () => json({ location: { directory: "/repo" }, data: decision("unavailable", "high") }) })
  try {
    fixture.context.local.model.variant.set("high")
    expect(fixture.context.local.model.variant.current()).toBe("high")
    fixture.prompt.set({ input: "high variant", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().some((call) => {
      const body = Schema.decodeUnknownSync(ModelExecution.Input)(call.body)
      return body.model?.variant === "high"
    }) || fixture.admissions().length > 0, "exact variant decision or baseline admission")
    expect(fixture.queries().length).toBeGreaterThanOrEqual(1)
    expect(fixture.queries().at(-1)?.body).toMatchObject({ model: { ...ref, variant: "high" } })
    expect(fixture.admissions()).toEqual([])
    expect(fixture.prompt.current.input).toBe("high variant")
  } finally { await fixture.dispose() }
})

test("E6 TUI draft canonical context omits nonexistent UI parentID and blocks before creating a Session", async () => {
  const fixture = await mount({ draft: true, reply: () => json({ location: { directory: "/repo" }, data: decision("unsupported") }) })
  try {
    fixture.prompt.set({ input: "unavailable draft", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > 0 || fixture.admissions().length > 0, "draft preflight or baseline POST")
    expect(fixture.queries().length).toBeGreaterThanOrEqual(1)
    expect(fixture.queries().at(-1)?.body).toMatchObject({ context: { type: "draft", agentID: "maestro" } })
    const context = Schema.decodeUnknownSync(ModelExecution.Input)(fixture.queries().at(-1)?.body).context
    expect("parentID" in context).toBe(false)
    expect(fixture.calls.filter((call) => call.path === "/api/session" && call.method === "POST")).toEqual([])
    expect(fixture.prompt.current.input).toBe("unavailable draft")
  } finally { await fixture.dispose() }
})

test("E6 TUI explicit removed choice stays selected instead of silently choosing a supported catalog entry", async () => {
  const fixture = await mount()
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
  const fixture = await mount()
  try {
    fixture.showModels()
    await wait(() => { void fixture.app.renderOnce(); return fixture.app.captureCharFrame().includes("Blocked model") }, "catalog row rendered by real DialogModel")
    await fixture.app.renderOnce()
    expect(fixture.app.captureCharFrame()).toContain("Consumer model")
    expect(fixture.queries()).toHaveLength(1)
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
  const fixture = await mount({ reply: async () => { entered.resolve(); await release.promise; return json({ location: { directory: "/repo" }, data: decision() }) } })
  try {
    fixture.prompt.set({ input: "pending context", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.queries().length > 0 || fixture.admissions().length > 0, "pending query or baseline POST")
    expect(fixture.queries()).toHaveLength(1)
    expect(fixture.admissions()).toEqual([])
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
    if (change === "reconnect") fixture.events.emit({ directory: fixture.root, workspace: undefined, payload: { type: "server.connected", properties: {} } })
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
    expect(fixture.admissions()).toEqual([])
  } finally { release.resolve(); await fixture.dispose() }
})

test("CONTROL E6 TUI shell is not blocked solely by unavailable model eligibility", async () => {
  const fixture = await mount({ reply: () => json({ location: { directory: "/repo" }, data: decision("unsupported") }) })
  try {
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
  const fixture = await mount({ reply: async () => { await release.promise; return json({ location: { directory: "/repo" }, data: decision() }) } })
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


test("CONTROL E6 TUI known command retains its own selection RPC semantics when eligibility is unavailable", async () => {
  const fixture = await mount({ reply: () => json({ location: { directory: "/repo" }, data: decision("unavailable") }) })
  try {
    await wait(() => fixture.context.sync.data.command.some((command) => command.name === "known"), "real command catalog")
    const before = fixture.queries().length
    fixture.prompt.set({ input: "/known value", parts: [], mode: "normal" })
    fixture.prompt.submit()
    await wait(() => fixture.calls.some((call) => call.path.endsWith("/command")), "actual known command POST")
    expect(fixture.queries()).toHaveLength(before)
    expect(fixture.admissions()).toEqual([])
    expect(fixture.calls.filter((call) => call.method === "POST" && call.path !== "/api/model/execution").map((call) => call.path.split("/").at(-1))).toEqual(["agent", "model", "command"])
  } finally { await fixture.dispose() }
})
