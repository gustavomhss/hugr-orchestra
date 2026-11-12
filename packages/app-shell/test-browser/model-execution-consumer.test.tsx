import { expect, test } from "bun:test"
import { Schema } from "effect"
import { unwrap } from "solid-js/store"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ModelExecution } from "@orchestra/schema/model-execution"
import { createFollowupSender, followupInput, commands, state, toasts, optimistic, promptInputs, sentCommands, sentShell, sdkFor, serverFor, setReactiveOwner } from "@/components/prompt-input/submit-harness"
import { createPromptState } from "@/context/prompt-state"
import { ServerScope } from "@/utils/server-scope"
import { ServerConnection } from "@/context/server"
import type { FollowupDraft } from "@/components/prompt-input/submit"
import { bind, composer, decision, draftSelection, json, liveSDK, nativeServer, ref, selection, selectorDOM, send, text, transport, wait } from "./model-execution-consumer.fixture"

// Controls prove generated serialization and current public consumers, not the server's eligibility algorithm.
// All sources remain at the baseline. Missing canonical queries are behavioral failures, never missing-export red.
test.each([
  { type: "session" as const, sessionID: "session-1", agentID: "backend" },
  { type: "draft" as const, parentID: "parent-1", agentID: "backend" },
  { type: "draft" as const, agentID: "backend" },
])("CONTROL E6 App generated canonical SDK preserves context %j and exact variant", async (context) => {
  const calls = transport({ reply: () => json({ location: { directory: "/repo/main" }, data: decision("unavailable", "high") }) })
  const result = await calls.orchestra.models.execution({ location: { directory: "/repo/main", workspace: "worktree-1" }, context, model: { ...ref, variant: "high" } })
  expect(calls.queries()).toHaveLength(1)
  const request = calls.queries()[0]
  expect(request?.method).toBe("POST")
  expect(request?.authorization).toBe("Basic Zml4dHVyZTpub25l")
  expect(request?.body).toEqual({ context, model: { ...ref, variant: "high" } })
  expect(request?.url.searchParams.get("location[directory]")).toBe("/repo/main")
  expect(request?.url.searchParams.get("location[workspace]")).toBe("worktree-1")
  const response = Schema.decodeUnknownSync(ModelExecution.Response)(result.data)
  expect(response.models.map((entry) => [entry.model.id, entry.status])).toEqual([["model", "ready"], ["blocked", "unsupported"]])
  expect(response.selection).toMatchObject({ ref: { ...ref, variant: "high" }, status: "unavailable", reason: "variant-unavailable" })
})

test("CONTROL E6 App ready ordinary admission uses actual SDK adapter agent then model then prompt", async () => {
  const calls = transport()
  bind(calls)
  const owner = composer()
  try {
    expect(await send(owner)).toBe(true)
    expect(calls.calls.filter((call) => call.path !== "/api/model/execution").map((call) => call.path.split("/").at(-1))).toEqual(["agent", "model", "prompt"])
    expect(calls.admissions()).toHaveLength(1)
    expect(promptInputs).toEqual([])
  } finally { owner.dispose() }
})

test.each(["unsupported", "unavailable", "transport", 400, 404, 503] as const)("E6 App fresh admission is canonically blocked by %s before selection RPCs and preserves editor", async (failure) => {
  const calls = transport({ reply: () => {
    if (failure === "transport") throw new TypeError("metadata transport offline")
    return typeof failure === "number" ? json({ _tag: "FixtureUnavailable", message: "not ready" }, failure)
      : json({ location: { directory: "/repo/main" }, data: decision(failure) })
  } })
  bind(calls)
  const owner = composer()
  const initial = structuredClone(unwrap(owner.prompt.current()))
  try {
    expect(await send(owner)).toBe(false)
    expect(calls.queries()).toHaveLength(1)
    expect(calls.calls.filter((call) => call.path !== "/api/model/execution")).toEqual([])
    expect(owner.prompt.current()).toEqual(initial)
  } finally { owner.dispose() }
})

test("E6 App exact unavailable variant blocks even when the base model row is ready", async () => {
  const calls = transport({ reply: () => json({ location: { directory: "/repo/main" }, data: decision("unavailable", "high") }) })
  bind(calls)
  state.variant = "high"
  const owner = composer()
  try {
    expect(await send(owner)).toBe(false)
    expect(calls.queries()).toHaveLength(1)
    expect(calls.queries()[0]?.body).toMatchObject({ model: { ...ref, variant: "high" } })
    expect(calls.admissions()).toEqual([])
  } finally { owner.dispose() }
})

test.each(["session-1", undefined])("E6 App Local selection retains an explicit removed model in %s instead of choosing a catalog default", async (sessionID) => {
  const calls = transport()
  const owner = selection(calls, sessionID)
  try {
    owner.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    expect(owner.local.model.current()?.id).toBe(ref.id)
    owner.removeModel()
    await Promise.resolve()
    expect(owner.local.model.current()?.id).toBe(ref.id)
  } finally { owner.dispose() }
})

test("E6 App actual deferred sender refuses a blocked model and preserves the captured draft", async () => {
  const calls = transport({ reply: () => json({ location: { directory: "/repo/main" }, data: decision("unsupported") }) })
  bind(calls)
  const drafts: FollowupDraft[] = []
  const owner = composer("deferred draft", { shouldQueue: () => true, onQueue: (draft) => drafts.push(draft) })
  try {
    expect(await send(owner)).toBe(true)
    expect(drafts).toHaveLength(1)
    expect(calls.admissions()).toEqual([])
    const input = followupInput(drafts[0])
    const before = structuredClone(unwrap(drafts[0].prompt))
    expect(await createFollowupSender()(input)).toBe(false)
    expect(calls.queries()).toHaveLength(1)
    expect(calls.admissions()).toEqual([])
    expect(drafts[0]?.prompt).toEqual(before)
  } finally { owner.dispose() }
})

test.each(["agent", "model"])("E6 App failure before actual POST at select %s must query afresh on retry", async (stage) => {
  const calls = transport()
  bind(calls)
  calls.control.before = async (path) => { if (path.endsWith(`/${stage}`)) throw new TypeError(`select ${stage} failed`) }
  const owner = composer()
  try {
    expect(await send(owner)).toBe(false)
    expect(calls.admissions()).toEqual([])
    calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: decision("unsupported") })
    calls.control.before = async () => {}
    expect(await send(owner)).toBe(false)
    expect(calls.queries()).toHaveLength(2)
    expect(calls.admissions()).toEqual([])
  } finally { owner.dispose() }
})

test("E6 App preparation failure is not an actual-POST ambiguity and cannot bypass a fresh canonical refusal", async () => {
  const calls = transport()
  bind(calls)
  const owner = composer()
  owner.prompt.set([...text("image preparation"), { type: "image", id: "missing-image", filename: "missing.png", mime: "image/png", blob: { id: "missing-image", url: "blob:unavailable-fixture" } }])
  try {
    expect(await send(owner)).toBe(false)
    expect(calls.admissions()).toEqual([])
    calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: decision("unsupported") })
    expect(await send(owner)).toBe(false)
    expect(calls.queries()).toHaveLength(2)
    expect(calls.admissions()).toEqual([])
  } finally { owner.dispose() }
})

test("E6 App coalesces a duplicate task before the canonical query and preparation", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const calls = transport({ reply: async () => { entered.resolve(); await release.promise; return json({ location: { directory: "/repo/main" }, data: decision() }) } })
  bind(calls)
  const owner = composer()
  const first = send(owner)
  const second = send(owner)
  try {
    // The original implementation completes without querying; race its observable completion with the future query.
    await Promise.race([entered.promise, Promise.allSettled([first, second])])
    expect(calls.queries()).toHaveLength(1)
    expect(calls.admissions()).toEqual([])
    release.resolve()
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(calls.admissions()).toHaveLength(1)
  } finally { release.resolve(); await Promise.allSettled([first, second]); owner.dispose() }
})

test.each(["Session", "policy", "disposal", "directory ABA", "server ABA", "credentials ABA", "scope ABA", "target ABA", "raw model", "raw variant", "agent"])("E6 App ownership %s changes while preflight is pending prevent all selection and POST effects", async (change) => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const calls = transport({ reply: async () => { entered.resolve(); await release.promise; return json({ location: { directory: "/repo/main" }, data: decision() }) } })
  const server = bind(calls)
  const source = { server, sdk: { ...sdkFor(calls.directory, server), orchestra: calls.orchestra } }
  setReactiveOwner("read", () => () => source)
  const owner = composer()
  const checkpoint = calls.calls.length
  const pending = send(owner)
  try {
    await Promise.race([entered.promise, pending])
    expect(calls.queries()).toHaveLength(1)
    if (change === "Session") state.params.id = "other-session"
    if (change === "policy") {
      expect(await server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })).toEqual({ mode: "inherit" })
      expect(server.sessionManagement.subagentModelsWriteVersion("session-1")).toBe(1)
    }
    if (change === "disposal") owner.dispose()
    if (change.endsWith(" ABA")) {
      const alternate = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("other")))
      const originalHttp = server.server
      const capture = owner.prompt.capture
      const other = createPromptState({ prompt: "other target" })
      if (change === "credentials ABA") Object.assign(server, { server: { type: "http", http: { url: calls.url, password: "changed" } } })
      if (change === "target ABA") owner.prompt.capture = () => other
      const next = change === "server ABA" ? { server: alternate, sdk: sdkFor(calls.directory, alternate) }
        : change === "directory ABA" ? { server, sdk: { ...source.sdk, directory: "/repo/other" } }
        : change === "scope ABA" ? { server, sdk: { ...source.sdk, scope: alternate.scope } } : source
      setReactiveOwner("read", () => () => ({ ...next }))
      await Promise.resolve()
      Object.assign(server, { server: originalHttp })
      owner.prompt.capture = capture
      setReactiveOwner("read", () => () => ({ ...source }))
    }
    if (change === "raw model") state.modelID = "blocked"
    if (change === "raw variant") state.variant = "high"
    if (change === "agent") state.agentID = "frontend"
    release.resolve()
    expect(await pending).toBe(false)
    expect(calls.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|prompt)$/.test(call.path))).toEqual([])
  } finally { release.resolve(); await pending; owner.dispose() }
})

test("CONTROL E6 App shell keeps its semantics without a fresh model preflight", async () => {
  const calls = transport()
  bind(calls)
  const owner = composer("pwd", { mode: () => "shell" })
  try {
    // Its actual captured model is the ready harness choice, not a missing-model no-op.
    expect(state.modelID).toBe(ref.id)
    const before = calls.queries().length
    calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: decision("unavailable") })
    expect(await send(owner)).toBeUndefined()
    expect(calls.queries()).toHaveLength(before)
    expect(calls.calls.at(-1)?.path.endsWith("/shell")).toBe(true)
    expect(calls.calls.at(-1)?.body).toMatchObject({ command: "pwd" })
    expect(toasts).toEqual([])
    expect(owner.prompt.current()).toEqual(text(""))
    expect(sentShell).toEqual([])
  } finally { owner.dispose() }
})

test("CONTROL E6 App ready known command preserves actual adapter order", async () => {
  const calls = transport()
  bind(calls)
  commands.push({ name: "known" })
  const owner = composer("/known value")
  try {
    expect(await send(owner)).toBe(true)
    expect(calls.calls.filter((call) => call.path !== "/api/model/execution").map((call) => call.path.split("/").at(-1))).toEqual(["agent", "model", "command"])
    expect(sentCommands).toEqual([])
  } finally { owner.dispose() }
})

test("E6 App unavailable known command requires a fresh canonical query before any command or selection RPC", async () => {
  const calls = transport()
  bind(calls)
  commands.push({ name: "known" })
  const owner = composer("/known value")
  const queries = calls.queries().length
  const checkpoint = calls.calls.length
  calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: decision("unavailable") })
  try {
    expect(await send(owner)).toBe(false)
    expect(calls.queries().length).toBeGreaterThan(queries)
    expect(calls.queries().at(-1)?.body).toMatchObject({ context: { type: "session", sessionID: "session-1", agentID: "backend" }, model: ref })
    expect(calls.calls.slice(checkpoint).filter((call) => call.method === "POST" && /\/(agent|model|command|prompt)$/.test(call.path))).toEqual([])
    expect(owner.prompt.current()).toEqual(text("/known value"))
  } finally { owner.dispose() }
})

test("CONTROL E6 App real committed HTTP ACK loss reconciles a retained request after metadata failure without a second durable row", async () => {
  expectSpawn(import.meta.path)
  await nativeServer(async (host) => {
    const calls = transport({ native: host })
    bind(calls)
    state.params.id = host.sessionID
    const owner = composer("canonical durable retry", { info: () => ({ id: host.sessionID }), delivery: () => "queue" })
    const committed: Awaited<ReturnType<typeof host.inspect>>[] = []
    const posts: unknown[] = []
    calls.control.after = async (path, response) => {
      if (!path.endsWith("/prompt")) return
      expect(response.status).toBe(200)
      posts.push(calls.admissions().at(-1)?.body)
      committed.push(await host.inspect())
      if (posts.length !== 1) return
      expect(committed[0]?.inputs).toHaveLength(1)
      expect(committed[0]?.admissions).toHaveLength(1)
      await response.arrayBuffer()
      throw new TypeError("Test transport lost the already committed ACK")
    }
    try {
      expect(await send(owner)).toBe(false)
      expect(posts).toHaveLength(1)
      expect(committed[0]?.inputs).toHaveLength(1)
      expect(optimistic[0]?.message.id).toBe(committed[0]?.inputs[0]?.id)
      const parts = structuredClone(unwrap(optimistic[0]?.parts))
      calls.control.reply = () => { throw new TypeError("metadata offline after committed prompt") }
      expect(await send(owner)).toBe(true)
      expect(posts).toHaveLength(2)
      expect(posts[1]).toEqual(posts[0])
      const final = await host.inspect()
      expect(final.inputs).toEqual(committed[0]?.inputs)
      expect(final.admissions).toEqual(committed[0]?.admissions)
      expect(optimistic[1]?.message.id).toBe(final.inputs[0]?.id)
      expect(optimistic[1]?.parts).toEqual(parts)
      expect(final.messages).toEqual([])
      expect(promptInputs).toEqual([])
    } finally { owner.dispose() }
  })
}, 75_000)


test("CONTROL E6 App real model popover renders catalog rows through its production controller", async () => {
  const calls = transport()
  const owner = selection(calls, "session-1")
  const view = await selectorDOM(owner)
  try {
    expect(view.rows().map((row) => row.textContent)).toContain("Consumer model")
    expect(view.rows().some((row) => row.textContent?.includes("Blocked model"))).toBe(true)
  } finally { view.dispose(); owner.dispose() }
})

test("E6 App one canonical context query disables an unsupported rendered row without hiding it", async () => {
  const calls = transport()
  const owner = selection(calls, "session-1")
  const view = await selectorDOM(owner)
  try {
    const row = view.rows().find((item) => item.textContent?.includes("Blocked model"))
    expect(row, "real selector must retain the catalog entry").toBeDefined()
    expect(calls.queries()).toHaveLength(1)
    expect(row?.getAttribute("aria-disabled")).toBe("true")
    row?.click()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(owner.local.model.current()?.id).not.toBe("blocked")
  } finally { view.dispose(); owner.dispose() }
})

test("E6 App no explicit raw choice may auto-default only after canonical selection is ready", async () => {
  const released = Promise.withResolvers<void>()
  const calls = transport({ reply: async () => { await released.promise; return json({ location: { directory: "/repo/main" }, data: decision() }) } })
  const owner = selection(calls, "session-1")
  try {
    expect(owner.saved.session["session-1"]?.model).toBeUndefined()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(calls.queries()).toHaveLength(1)
    expect(owner.local.model.current()).toBeUndefined()
    released.resolve()
    const until = Date.now() + 2000
    while (owner.local.model.current()?.id !== ref.id) {
      if (Date.now() >= until) throw new Error("Fixture deadline: canonical automatic default")
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
    expect(owner.local.model.current()?.id).toBe(ref.id)
  } finally { released.resolve(); owner.dispose() }
})

test("E6 App actual-POST ambiguity uses raw intent; changed text/model/variant and explicit null cannot inherit it", async () => {
  expectSpawn(import.meta.path)
  await nativeServer(async (host) => {
    const calls = transport({ native: host })
    const selected = selection(calls, host.sessionID)
    selected.setSaved("session", host.sessionID, { model: { providerID: ref.providerID, modelID: ref.id } })
    state.params.id = host.sessionID
    const owner = composer("original intent", { model: selected.local.model, info: () => ({ id: host.sessionID }), delivery: () => "queue" })
    const posts: unknown[] = []
    const rows: Awaited<ReturnType<typeof host.inspect>>[] = []
    calls.control.after = async (path, response) => {
      if (!path.endsWith("/prompt")) return
      expect(response.status).toBe(200)
      posts.push(calls.admissions().at(-1)?.body)
      rows.push(await host.inspect())
      if (posts.length > 1) return
      expect(rows[0]?.inputs).toHaveLength(1)
      expect(rows[0]?.admissions).toHaveLength(1)
      await response.arrayBuffer()
      throw new TypeError("Test lost a committed admission ACK")
    }
    try {
      expect(selected.local.model.variant.selected()).toBeUndefined()
      expect(await send(owner)).toBe(false)
      expect(posts).toHaveLength(1)
      const parts = structuredClone(unwrap(optimistic[0]?.parts))
      expect(optimistic[0]?.message.id).toBe(rows[0]?.inputs[0]?.id)
      const before = calls.queries().length
      calls.control.reply = () => { throw new TypeError("catalog removed and metadata unavailable") }
      owner.prompt.set(text("changed text"))
      expect(await send(owner)).toBe(false)
      expect(posts).toHaveLength(1)
      owner.prompt.set(text("original intent"))
      selected.setSaved("session", host.sessionID, { model: { providerID: ref.providerID, modelID: "blocked" } })
      expect(await send(owner)).toBe(false)
      expect(posts).toHaveLength(1)
      selected.setSaved("session", host.sessionID, { model: { providerID: ref.providerID, modelID: ref.id }, variant: "high" })
      expect(await send(owner)).toBe(false)
      expect(posts).toHaveLength(1)
      selected.setSaved("session", host.sessionID, { model: { providerID: ref.providerID, modelID: ref.id }, variant: null })
      expect(selected.local.model.variant.selected()).toBeNull()
      expect(await send(owner)).toBe(false)
      expect(posts).toHaveLength(1)
      expect(calls.queries().length).toBe(before + 4)
      selected.setSaved("session", host.sessionID, { model: { providerID: ref.providerID, modelID: ref.id }, variant: undefined })
      expect(selected.local.model.variant.selected()).toBeUndefined()
      selected.removeModel()
      expect(await send(owner)).toBe(true)
      expect(posts).toHaveLength(2)
      expect(posts[1]).toEqual(posts[0])
      expect(optimistic.at(-1)?.parts).toEqual(parts)
      expect(optimistic.at(-1)?.message.id).toBe(rows[0]?.inputs[0]?.id)
      expect((await host.inspect()).inputs).toEqual(rows[0]?.inputs)
      expect((await host.inspect()).admissions).toEqual(rows[0]?.admissions)
    } finally { owner.dispose(); selected.dispose() }
  })
}, 75_000)


test("E6 App actual draft composer selector retains removed explicit raw selection and sends parentless draft context", async () => {
  const calls = transport()
  const owner = draftSelection(calls)
  try {
    owner.model.set({ providerID: ref.providerID, modelID: ref.id })
    await Promise.resolve()
    expect(owner.prompt.model.current()).toMatchObject({ providerID: ref.providerID, modelID: ref.id })
    expect(owner.model.current()?.id).toBe(ref.id)
    owner.source.removeModel()
    await Promise.resolve()
    expect(owner.model.current()?.id).toBe(ref.id)
    expect(calls.queries().length).toBeGreaterThanOrEqual(1)
    const input = Schema.decodeUnknownSync(ModelExecution.Input)(calls.queries().at(-1)?.body)
    expect(input.context).toMatchObject({ type: "draft" })
    expect("parentID" in input.context).toBe(false)
  } finally { owner.dispose() }
})


test("CONTROL E6 App actual SDK parses two greetings without remount or global fetch replacement", async () => {
  const calls = transport()
  const live = liveSDK(calls)
  try {
    await wait(() => live.greetings.length === 1, "first actual SDK greeting")
    expect(calls.streams).toHaveLength(1)
    calls.streams[0]!.close()
    await wait(() => live.greetings.length === 2, "reconnected actual SDK greeting")
    expect(live.greetings).toEqual(["greeting-1", "greeting-2"])
  } finally { live.dispose() }
})

test("E6 App reconnect invalidates held preflight even if its old canonical answer later reports ready", async () => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const calls = transport({ reply: async () => { entered.resolve(); await release.promise; return json({ location: { directory: "/repo/main" }, data: decision() }) } })
  const live = liveSDK(calls)
  const owner = composer()
  await wait(() => live.greetings.length === 1, "first actual SDK greeting")
  const pending = send(owner)
  try {
    await Promise.race([entered.promise, pending])
    expect(calls.queries()).toHaveLength(1)
    expect(calls.admissions()).toEqual([])
    calls.streams[0]!.close()
    await wait(() => live.greetings.length === 2, "second actual SDK greeting")
    release.resolve()
    expect(await pending).toBe(false)
    expect(calls.admissions()).toEqual([])
  } finally { release.resolve(); await pending; owner.dispose(); live.dispose() }
})


test.each(["Session", "raw model", "policy", "credentials"])("E6 App rechecks %s after adapter selectors and immediately before actual prompt POST", async (change) => {
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const calls = transport()
  const server = bind(calls)
  const source = { server, sdk: { ...sdkFor(calls.directory, server), orchestra: calls.orchestra } }
  setReactiveOwner("read", () => () => source)
  calls.control.before = async (path) => {
    if (!path.endsWith("/model")) return
    entered.resolve()
    await release.promise
  }
  const owner = composer()
  const pending = send(owner)
  try {
    await Promise.race([entered.promise, pending])
    expect(calls.calls.filter((call) => call.path.endsWith("/agent"))).toHaveLength(1)
    expect(calls.calls.filter((call) => call.path.endsWith("/model"))).toHaveLength(1)
    expect(calls.admissions()).toEqual([])
    if (change === "Session") state.params.id = "other-session"
    if (change === "raw model") state.modelID = "blocked"
    if (change === "policy") await server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
    if (change === "credentials") Object.assign(server, { server: { type: "http", http: { url: calls.url, password: "changed" } } })
    setReactiveOwner("read", () => () => ({ ...source }))
    await Promise.resolve()
    release.resolve()
    expect(await pending).toBe(false)
    expect(calls.admissions()).toEqual([])
    expect(calls.queries()).toHaveLength(1)
    expect(owner.prompt.current()).toEqual(text("canonical prompt"))
  } finally { release.resolve(); await pending; owner.dispose() }
})

test("CONTROL E6 App catalog settings input retains all models after a canonical unsupported decision", async () => {
  const calls = transport()
  const owner = selection(calls, "session-1")
  try {
    const result = await calls.orchestra.models.execution({ context: { type: "session", sessionID: "session-1" }, model: ref })
    expect(result.data.models.find((entry) => entry.model.id === "blocked")?.status).toBe("unsupported")
    // Settings reads this actual catalog source, not the execution-filtered selector.
    expect(owner.models.list().map((item) => item.id).toSorted()).toEqual(["blocked", "model"])
  } finally { owner.dispose() }
})


test("E6 App unknown slash remains a normal prompt and requires canonical fresh admission", async () => {
  const calls = transport({ reply: () => json({ location: { directory: "/repo/main" }, data: decision("unavailable") }) })
  bind(calls)
  const owner = composer("/not-a-command value")
  try {
    expect(await send(owner)).toBe(false)
    expect(calls.queries()).toHaveLength(1)
    expect(calls.admissions()).toEqual([])
    expect(calls.calls.some((call) => call.path.endsWith("/command"))).toBe(false)
    expect(owner.prompt.current()).toEqual(text("/not-a-command value"))
  } finally { owner.dispose() }
})

test("E6 App rendered selector keeps NEW A after A to B to A and a late old A response", async () => {
  const release = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const returned = Promise.withResolvers<void>()
  const both = { ...decision(), models: decision().models.map((entry) => ({ model: entry.model, engine: entry.engine, status: "ready" as const })) }
  const bothB = Schema.decodeUnknownSync(ModelExecution.Response)({ ...both, selection: { status: "ready", ref: { ...ref, id: "blocked" }, engine: "orchestra" } })
  const newest = { ...decision(), models: both.models.filter((entry) => entry.model.id === ref.id) }
  const calls = transport({ reply: () => json({ location: { directory: "/repo/main" }, data: both }) })
  const contract = await calls.orchestra.models.execution({ context: { type: "session", sessionID: "bootstrap-session", agentID: "maestro" }, model: ref })
  expect(contract.data.models.map((entry) => entry.model.id)).toEqual(["model", "blocked"])
  const owner = selection(calls, "bootstrap-session")
  owner.local.model.set({ providerID: ref.providerID, modelID: ref.id })
  await wait(() => owner.local.model.current()?.id === ref.id, "real READY explicit selector choice")
  // Seed B READY, then park a fresh A request. The following A→B→A are actual raw selector choices.
  calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: bothB })
  owner.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
  await wait(() => owner.local.model.current()?.id === "blocked", "real READY seed B choice")
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
  const view = await selectorDOM(owner)
  try {
    expect(view.rows().some((row) => row.textContent?.includes("Consumer model"))).toBe(true)
    const beforeA = calls.queries().length
    calls.control.reply = async () => {
      const captured = json({ location: { directory: "/repo/main" }, data: both })
      entered.resolve()
      await release.promise
      returned.resolve()
      return captured
    }
    owner.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(calls.queries().length).toBeGreaterThan(beforeA)
    expect(calls.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "bootstrap-session", agentID: "maestro" }, model: ref })
    await entered.promise
    const beforeB = calls.queries().length
    calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: bothB })
    owner.local.model.set({ providerID: ref.providerID, modelID: "blocked" })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(calls.queries().length).toBeGreaterThan(beforeB)
    expect(calls.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "bootstrap-session", agentID: "maestro" }, model: { ...ref, id: "blocked" } })
    await wait(() => view.rows().some((row) => row.textContent?.includes("Blocked model")), "B snapshot actually rendered")
    const beforeNewA = calls.queries().length
    calls.control.reply = () => json({ location: { directory: "/repo/main" }, data: newest })
    owner.local.model.set({ providerID: ref.providerID, modelID: ref.id })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(calls.queries().length).toBeGreaterThan(beforeNewA)
    expect(calls.queries().at(-1)?.body).toEqual({ context: { type: "session", sessionID: "bootstrap-session", agentID: "maestro" }, model: ref })
    await wait(() => view.rows().some((row) => row.textContent?.includes("Consumer model")) && !view.rows().some((row) => row.textContent?.includes("Blocked model")), "NEW A model list applied")
    const a = view.rows().find((row) => row.textContent?.includes("Consumer model"))
    expect(a?.getAttribute("aria-disabled")).not.toBe("true")
    expect(a?.getAttribute("data-selected-model")).toBe("true")
    release.resolve()
    await returned.promise
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    expect(view.rows().some((row) => row.textContent?.includes("Blocked model"))).toBe(false)
    expect(owner.local.model.current()?.id).toBe(ref.id)
    expect(view.rows().find((row) => row.textContent?.includes("Consumer model"))?.getAttribute("aria-disabled")).not.toBe("true")
    expect(owner.models.list().some((item) => item.id === "blocked"), "the catalog still contains B; only the canonical context changed").toBe(true)
  } finally { release.resolve(); view.dispose(); owner.dispose() }
})
