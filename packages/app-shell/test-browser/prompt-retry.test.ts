import { registerSubmitHarnessLifecycle } from "@/components/prompt-input/submit-harness"
import { expect, spyOn, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { createRoot } from "solid-js"
import { unwrap } from "solid-js/store"
import { isServer } from "solid-js/web"
import { Effect, Fiber, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { createPromptState, type ImageAttachmentPart } from "@/context/prompt-state"
import { createApiForServer } from "@/utils/server"
import { createSessionManagementForServer } from "@/utils/session-management"
import { ServerScope } from "@/utils/server-scope"
import { ServerConnection } from "@/context/server"
import {
  commands, createPromptSubmit, createdSessions, optimistic, optimisticRemovals, policyFixture, promptInputs,
  sdkFor, sentCommands, sentShell, serverFor, setReactiveOwner, state, submitInput, toasts,
} from "@/components/prompt-input/submit-harness"

registerSubmitHarnessLifecycle()

// These tests exercise the existing composer API. The shared harness stubs UI services, not admission semantics.
// Only the final two native-child cases claim real HTTP/Core/SQLite evidence.
const submitted = Schema.decodeUnknownSync(Schema.Struct({
  id: Schema.String, sessionID: Schema.String, text: Schema.String,
  delivery: Schema.optional(Schema.String), files: Schema.Array(Schema.Unknown), agents: Schema.Array(Schema.Unknown),
}))
const inputAt = (index: number) => submitted(promptInputs[index])
const clone = <T>(value: T) => structuredClone(unwrap(value))
const text = (value: string) => [{ type: "text" as const, content: value, start: 0, end: value.length }]
const send = (submit: ReturnType<typeof createPromptSubmit>) => submit.handleSubmit(new Event("submit"))

function composer(value = "retry this", options: Partial<Parameters<typeof createPromptSubmit>[0]> = {}) {
  expect(isServer, "this suite must use the real Solid browser owner lifecycle").toBe(false)
  state.params.id ??= "session-1"
  return createRoot((dispose) => {
    const prompt = createPromptState({ prompt: value })
    return { dispose, prompt, submit: createPromptSubmit({ ...submitInput(), prompt,
      imageAttachments: () => prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"), ...options }) }
  })
}

async function within<T>(promise: PromiseLike<T>, label: string, milliseconds = 10_000): Promise<T> {
  const expired = Promise.withResolvers<never>()
  const timeout = setTimeout(() => expired.reject(new Error(`Fixture deadline: ${label}`)), milliseconds)
  try { return await Promise.race([promise, expired.promise]) }
  finally { clearTimeout(timeout) }
}

test("CONTROL E1 existing normal prompt succeeds and identical intentional next send gets a new ID", async () => {
  const owner = composer()
  try {
    expect(await send(owner.submit)).toBe(true)
    expect(inputAt(0)).toMatchObject({ sessionID: "session-1", text: "retry this" })
    expect(optimistic[0]?.message.id).toBe(inputAt(0).id)
    expect(owner.prompt.current()).toEqual(text(""))
    owner.prompt.set(text("retry this"))
    expect(await send(owner.submit)).toBe(true)
    expect(promptInputs).toHaveLength(2)
    expect(inputAt(1).id).not.toBe(inputAt(0).id)
  } finally { owner.dispose() }
})

test.each(["reject", "transport AbortError"] as const)("E1 same live owner retains exact normal request and optimistic parts after ambiguous %s", async (failure) => {
  const owner = composer()
  owner.prompt.context.add({ type: "file", path: "/repo/main/review.ts", comment: "retain this note" })
  const initial = clone(owner.prompt.current())
  const context = clone(owner.prompt.context.items())
  state.sendHook = async () => { throw failure === "transport AbortError" ? new DOMException("ACK lost", "AbortError") : new Error("ACK lost") }
  try {
    expect(await send(owner.submit)).toBe(false)
    expect(promptInputs).toHaveLength(1)
    expect(owner.prompt.current()).toEqual(initial)
    expect(owner.prompt.context.items()).toEqual(context)
    const first = clone(promptInputs[0])
    const parts = clone(optimistic[0]?.parts)
    expect(optimistic[0]?.message.id).toBe(inputAt(0).id)
    expect(optimisticRemovals.some((entry) => entry.messageID === inputAt(0).id)).toBe(true)
    state.sendHook = async () => {}
    expect(await send(owner.submit)).toBe(true)
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs[1]).toEqual(first)
    expect(optimistic[1]?.parts).toEqual(parts)
    expect(optimistic[1]?.parts.every((part) => part.messageID === inputAt(0).id)).toBe(true)
  } finally { owner.dispose() }
})

test("E1 composer Stop aborts the captured transport, restores its editor, and retries with the same ID and a fresh controller", async () => {
  const owner = composer()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const signals: AbortSignal[] = []
  const original = policyFixture.server.api.session.prompt
  policyFixture.server.api.session.prompt = async (value, options) => {
    const signal = options?.signal
    if (!signal) throw new Error("Missing composer transport signal")
    signals.push(signal)
    const cancelled = Promise.withResolvers<never>()
    const abort = () => cancelled.reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    try { return await Promise.race([original(value, options), cancelled.promise]) }
    finally { signal.removeEventListener("abort", abort) }
  }
  state.active = {}
  state.sendHook = async () => { started.resolve(); await release.promise }
  const sending = send(owner.submit)
  try {
    await within(started.promise, "actual controller captured by transport")
    const first = clone(promptInputs[0])
    expect(owner.prompt.current()).toEqual(text(""))
    await owner.submit.abort()
    expect(await sending).toBe(false)
    expect(signals[0]?.aborted).toBe(true)
    expect(owner.prompt.current()).toEqual(text("retry this"))
    state.sendHook = async () => {}
    release.resolve()
    expect(await send(owner.submit)).toBe(true)
    expect(promptInputs[1]).toEqual(first)
    expect(signals).toHaveLength(2)
    expect(signals[1]).not.toBe(signals[0])
    expect(signals[1]?.aborted).toBe(false)
  } finally { release.resolve(); await sending; owner.dispose() }
})

test("E1 a failed older action preserves later editor/context edits", async () => {
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const owner = composer("older action")
  state.sendHook = async () => { started.resolve(); await release.promise; throw new Error("lost ACK") }
  const sending = send(owner.submit)
  try {
    await within(started.promise, "first request")
    owner.prompt.set(text("later unsent edit"))
    owner.prompt.context.add({ type: "file", path: "/repo/main/later.ts", comment: "new unsent context" })
    const edits = clone(owner.prompt.context.items())
    release.resolve()
    expect(await sending).toBe(false)
    expect(owner.prompt.current()).toEqual(text("later unsent edit"))
    expect(owner.prompt.context.items()).toEqual(edits)
  } finally { release.resolve(); await sending; owner.dispose() }
})

test("E1 A to B to retry A retains A while A's finalizer cannot release B's pending controller", async () => {
  const owner = composer("A")
  const aEntered = Promise.withResolvers<void>()
  const bEntered = Promise.withResolvers<void>()
  const aRelease = Promise.withResolvers<void>()
  const bRelease = Promise.withResolvers<void>()
  const signals: AbortSignal[] = []
  const original = policyFixture.server.api.session.prompt
  policyFixture.server.api.session.prompt = (value, options) => {
    if (options?.signal) signals.push(options.signal)
    return original(value, options)
  }
  state.sendHook = async (value) => {
    if (submitted(value).text === "A") { aEntered.resolve(); await aRelease.promise; throw new Error("A lost ACK") }
    bEntered.resolve(); await bRelease.promise
  }
  const a = send(owner.submit)
  const tasks: Promise<unknown>[] = [a]
  try {
    await within(aEntered.promise, "A dispatched")
    owner.prompt.set(text("B"))
    const b = send(owner.submit)
    tasks.push(b)
    await within(bEntered.promise, "B dispatched independently")
    expect(inputAt(0).text).toBe("A")
    expect(inputAt(1).text).toBe("B")
    expect(inputAt(1).id).not.toBe(inputAt(0).id)
    expect(signals).toHaveLength(2)
    aRelease.resolve()
    expect(await a).toBe(false)
    expect(signals[1]?.aborted).toBe(false)
    owner.prompt.set(text("A"))
    const retry = send(owner.submit)
    tasks.push(retry)
    expect(await retry).toBe(false)
    expect(promptInputs).toHaveLength(3)
    expect(inputAt(2).id).toBe(inputAt(0).id)
    expect(signals[1]?.aborted).toBe(false)
    state.active = {}
    await owner.submit.abort()
    expect(signals[1]?.aborted, "Stop must still find B after both A finalizers").toBe(true)
  } finally { aRelease.resolve(); bRelease.resolve(); await Promise.allSettled(tasks); owner.dispose() }
})

test("E1 a delayed positive ACK for A retires only A while ambiguous B remains retryable", async () => {
  const owner = composer("A")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  state.sendHook = async (value) => {
    if (submitted(value).text === "A") { entered.resolve(); await release.promise; return }
    throw new Error("B lost ACK")
  }
  const a = send(owner.submit)
  try {
    await within(entered.promise, "A dispatched before B")
    owner.prompt.set(text("B"))
    expect(await send(owner.submit)).toBe(false)
    expect(promptInputs).toHaveLength(2)
    const b = clone(promptInputs[1])
    release.resolve()
    expect(await a).toBe(true)
    owner.prompt.set(text("B"))
    expect(await send(owner.submit)).toBe(false)
    expect(promptInputs).toHaveLength(3)
    expect(promptInputs[2]).toEqual(b)
  } finally { release.resolve(); await a; owner.dispose() }
})

test.each(["prompt", "context", "agent", "model", "variant", "delivery", "local policy generation", "failed local policy generation", "same-policy ABA"])(
  "E1 changed %s is a distinct action while returning to the earlier exact fingerprint keeps its ID", async (field) => {
    const choice = { delivery: "steer" as "steer" | "queue" }
    const owner = composer("A", { delivery: () => choice.delivery })
    state.sendHook = async () => { throw new Error("ambiguous") }
    try {
      expect(await send(owner.submit)).toBe(false)
      if (field === "prompt") owner.prompt.set(text("B"))
      if (field === "context") owner.prompt.context.add({ type: "file", path: "/repo/main/context.ts", comment: "changed" })
      if (field === "agent") state.agentID = "frontend"
      if (field === "model") state.modelID = "another-model"
      if (field === "variant") state.variant = "high"
      if (field === "delivery") choice.delivery = "queue"
      if (field === "local policy generation") await policyFixture.server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
      if (field === "failed local policy generation") {
        const failure = new Error("SET failed after generation advanced")
        state.policyWrite = async () => { throw failure }
        await expect(policyFixture.server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })).rejects.toBe(failure)
        state.policyWrite = async () => {}
      }
      if (field === "same-policy ABA") {
        await policyFixture.server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
        await policyFixture.server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
        expect(policyFixture.server.sessionManagement.subagentModelsWriteVersion("session-1")).toBe(2)
      }
      expect(await send(owner.submit)).toBe(false)
      expect(promptInputs).toHaveLength(2)
      expect(inputAt(1).id).not.toBe(inputAt(0).id)
      if (field.includes("policy")) return // Local SET versions are monotonic; no fictional rollback.
      owner.prompt.set(text("A"))
      owner.prompt.context.items().slice().forEach((item) => owner.prompt.context.remove(item.key))
      state.agentID = "backend"
      state.modelID = "model"
      state.variant = undefined
      choice.delivery = "steer"
      expect(await send(owner.submit)).toBe(false)
      expect(promptInputs).toHaveLength(3)
      expect(inputAt(2).id).toBe(inputAt(0).id)
    } finally { owner.dispose() }
  },
)

test.each(["policy wait", "optimistic insertion"] as const)("E1 a local SET generation changed at %s fences the actual prompt call", async (boundary) => {
  const owner = composer()
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const changes = { count: 0 }
  if (boundary === "policy wait") state.policyWait = async () => { entered.resolve(); await release.promise }
  const push = optimistic.push.bind(optimistic)
  const insertion = boundary === "optimistic insertion" ? spyOn(optimistic, "push").mockImplementation((...values) => {
    const length = push(...values)
    if (!changes.count++) void policyFixture.server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
    return length
  }) : undefined
  const sending = send(owner.submit)
  try {
    if (boundary === "policy wait") {
      await within(entered.promise, "policy wait")
      await policyFixture.server.sessionManagement.setSubagentModels("session-1", { mode: "inherit" })
      release.resolve()
    }
    const sent = await sending
    expect(policyFixture.server.sessionManagement.subagentModelsWriteVersion("session-1")).toBe(1)
    expect(sent).toBe(false)
    expect(promptInputs).toEqual([])
    insertion?.mockRestore()
    expect(await send(owner.submit)).toBe(true)
    expect(promptInputs).toHaveLength(1)
  } finally { release.resolve(); insertion?.mockRestore(); await sending; owner.dispose() }
})

test("E1 unknown slash classification is frozen before waiting and retained before catalog lookup on retry", async () => {
  const owner = composer("/later same payload")
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  state.policyWait = async () => { entered.resolve(); await release.promise }
  state.sendHook = async () => { throw new Error("lost ACK") }
  const sending = send(owner.submit)
  try {
    await within(entered.promise, "unknown slash captured before catalog change")
    commands.push({ name: "later" })
    release.resolve()
    expect(await sending).toBe(false)
    expect(sentCommands).toEqual([])
    expect(promptInputs).toHaveLength(1)
    expect(inputAt(0).text).toBe("/later same payload")
    state.sendHook = async () => {}
    expect(await send(owner.submit)).toBe(true)
    expect(sentCommands).toEqual([])
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs[1]).toEqual(promptInputs[0])
  } finally { release.resolve(); await sending; owner.dispose() }
})

test.each(["command", "shell"] as const)("CONTROL E1 known %s keeps its existing dispatch path", async (kind) => {
  commands.push({ name: "review" })
  const owner = composer(kind === "command" ? "/review these changes" : "echo example", { mode: () => kind === "shell" ? "shell" : "normal" })
  try {
    await send(owner.submit)
    expect(promptInputs).toEqual([])
    expect(kind === "command" ? sentCommands : sentShell).toHaveLength(1)
  } finally { owner.dispose() }
})

test("E1 a successful shell action cannot retire the earlier ambiguous normal action", async () => {
  const choice = { mode: "normal" as "normal" | "shell" }
  const owner = composer("normal A", { mode: () => choice.mode })
  try {
    state.sendHook = async () => { throw new Error("normal A lost ACK") }
    expect(await send(owner.submit)).toBe(false)
    const first = clone(promptInputs[0])
    choice.mode = "shell"
    owner.prompt.set(text("echo independent shell"))
    state.sendHook = async () => {}
    await send(owner.submit)
    expect(sentShell).toHaveLength(1)
    expect(promptInputs).toHaveLength(1)
    choice.mode = "normal"
    owner.prompt.set(text("normal A"))
    expect(await send(owner.submit)).toBe(true)
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs[1]).toEqual(first)
  } finally { owner.dispose() }
})

test("CONTROL E1 existing fresh-Session ambiguous retry still retains its created Session and request", async () => {
  const owner = createRoot((dispose) => {
    const prompt = createPromptState({ prompt: "fresh retained admission" })
    return { dispose, prompt, submit: createPromptSubmit({ ...submitInput(), prompt, info: () => undefined }) }
  })
  try {
    state.sendHook = async () => { throw new Error("fresh ACK lost") }
    expect(await send(owner.submit)).toBe(false)
    expect(createdSessions).toHaveLength(1)
    expect(promptInputs).toHaveLength(1)
    const first = clone(promptInputs[0])
    state.sendHook = async () => {}
    expect(await send(owner.submit)).toBe(true)
    expect(createdSessions).toHaveLength(1)
    expect(promptInputs).toHaveLength(2)
    expect(promptInputs[1]).toEqual(first)
  } finally { owner.dispose() }
})

test.each(["directory", "server", "credentials", "scope", "session", "target", "dispose"] as const)(
  "E1 %s departure and ABA invalidate a held attempt and its retained action", async (binding) => {
    const source = { server: policyFixture.server, sdk: policyFixture.sdk }
    setReactiveOwner("read", () => () => source)
    const owner = composer()
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const tasks: Promise<unknown>[] = []
    const failure = { enabled: true }
    state.sendHook = async () => { if (failure.enabled) throw new Error("ambiguous A") }
    try {
      expect(await send(owner.submit)).toBe(false)
      const first = inputAt(0).id
      state.policyWait = async () => { entered.resolve(); await release.promise }
      const held = send(owner.submit)
      tasks.push(held)
      await within(entered.promise, "retry held before HTTP")
      if (binding === "dispose") owner.dispose()
      if (binding === "session") {
        state.params.id = "other-session"
        setReactiveOwner("read", () => () => ({ ...source }))
        await Promise.resolve()
        state.params.id = "session-1"
        setReactiveOwner("read", () => () => ({ ...source }))
      }
      if (binding === "target") {
        // Capture is an existing owner port; replace the live target, then return to the original object.
        const capture = owner.prompt.capture
        const other = createPromptState({ prompt: "other target" })
        owner.prompt.capture = () => other
        setReactiveOwner("read", () => () => ({ ...source }))
        await Promise.resolve()
        owner.prompt.capture = capture
        setReactiveOwner("read", () => () => ({ ...source }))
      }
      if (["directory", "server", "credentials", "scope"].includes(binding)) {
        const alternate = serverFor(ServerScope.fromServerKey(ServerConnection.Key.make("other")))
        const next = binding === "server" ? { server: alternate, sdk: sdkFor("/repo/main", alternate) }
          : binding === "directory" ? { server: source.server, sdk: sdkFor("/repo/other", source.server) }
          : binding === "scope" ? { server: source.server, sdk: { ...source.sdk, scope: alternate.scope } }
          : { server: source.server, sdk: source.sdk }
        if (binding === "credentials") Object.assign(source.server, { server: { type: "http", http: { url: "http://changed.invalid" } } })
        setReactiveOwner("read", () => () => ({ ...next }))
        await Promise.resolve()
        if (binding === "credentials") Object.assign(source.server, { server: undefined })
        setReactiveOwner("read", () => () => ({ ...source }))
      }
      release.resolve()
      expect(await held).toBe(false)
      expect(promptInputs).toHaveLength(1)
      state.policyWait = async () => {}
      failure.enabled = false
      // ABA must invalidate retention inside the original live owner. Only disposal requires a replacement owner.
      const next = binding === "dispose"
        ? createRoot((dispose) => ({ dispose, submit: createPromptSubmit({ ...submitInput(), prompt: owner.prompt }) }))
        : undefined
      try {
        owner.prompt.set(text("retry this"))
        expect(await send(next?.submit ?? owner.submit)).toBe(true)
        expect(promptInputs).toHaveLength(2)
        expect(inputAt(1).id).not.toBe(first)
      } finally { next?.dispose() }
    } finally { release.resolve(); await Promise.allSettled(tasks); owner.dispose() }
  },
)

// The only global fetch bridge in this file is scoped to these two image cases. Bun Blob and DOM FileReader
// otherwise belong to different realms (the existing submit-delivery suite documents the same boundary).
async function imageRealm(run: (image: ImageAttachmentPart, calls: { gets: number }, gate: ReturnType<typeof Promise.withResolvers<void>>, entered: ReturnType<typeof Promise.withResolvers<void>>) => Promise<void>) {
  const native = fetch
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const calls = { gets: 0 }
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    if (request.method === "GET") { calls.gets++; entered.resolve(); await gate.promise }
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "access-control-allow-origin": "*", "content-type": "image/png" } })
  } })
  const { Window } = createRequire(Bun.resolveSync("@happy-dom/global-registrator", import.meta.dir))("happy-dom")
  const browser = new Window()
  const transport = spyOn(globalThis, "fetch").mockImplementation(browser.fetch.bind(browser) as unknown as typeof fetch)
  try {
    // Explicit fixture bytes, not a PNG-ingestion validity claim.
    await run({ type: "image", id: "image-A", filename: "example.png", mime: "image/png", blob: { id: "image-A", url: server.url.href } }, calls, gate, entered)
  } finally {
    gate.resolve()
    transport.mockRestore()
    await browser.happyDOM.close()
    await server.stop(true)
    expect(fetch).toBe(native)
  }
}

test("E1 concurrent identical action joins before real image preparation and reuses prepared bytes on retry", async () => {
  await imageRealm(async (image, calls, gate, entered) => {
    const owner = composer()
    owner.prompt.set([...text("retry this"), image])
    const original = clone(owner.prompt.current())
    state.sendHook = async () => { throw new Error("lost ACK after preparation") }
    const first = send(owner.submit)
    const tasks: Promise<unknown>[] = [first]
    try {
      await within(entered.promise, "actual attachment fetch")
      // The editor has cleared; replay the exact captured action while the first preparation is still pending.
      owner.prompt.set(original)
      const second = send(owner.submit)
      tasks.push(second)
      gate.resolve()
      expect(await first).toBe(false)
      expect(await second).toBe(false)
      expect(promptInputs.length, "fixture control: FileReader produced a request before coalescence assertions").toBeGreaterThan(0)
      expect(inputAt(0).files).toEqual([{ uri: "data:image/png;base64,AQID", name: "example.png", mention: undefined }])
      expect(calls.gets).toBe(1)
      expect(promptInputs).toHaveLength(1)
      const parts = clone(optimistic[0]?.parts)
      owner.prompt.set(original)
      state.sendHook = async () => {}
      expect(await send(owner.submit)).toBe(true)
      expect(calls.gets).toBe(1)
      expect(promptInputs[1]).toEqual(promptInputs[0])
      expect(optimistic.at(-1)?.parts).toEqual(parts)
    } finally { gate.resolve(); await Promise.allSettled(tasks); owner.dispose() }
  })
})

test("E1 changing the image identity allocates a distinct action; original image retry remains exact", async () => {
  await imageRealm(async (image, calls, gate) => {
    gate.resolve()
    const owner = composer()
    state.sendHook = async () => { throw new Error("lost ACK") }
    try {
      owner.prompt.set([...text("retry this"), image])
      expect(await send(owner.submit)).toBe(false)
      expect(inputAt(0).files).toHaveLength(1) // Real fetch and FileReader completed before product assertions.
      const first = clone(promptInputs[0])
      owner.prompt.set([...text("retry this"), { ...image, id: "image-B", blob: { ...image.blob, id: "image-B" } }])
      expect(await send(owner.submit)).toBe(false)
      expect(inputAt(1).id).not.toBe(inputAt(0).id)
      owner.prompt.set([...text("retry this"), image])
      expect(await send(owner.submit)).toBe(false)
      expect(promptInputs[2]).toEqual(first)
      expect(calls.gets).toBe(2)
    } finally { owner.dispose() }
  })
})

const Ready = Schema.Struct({ url: Schema.String, directory: Schema.String, sessionID: Schema.String })
const Rows = Schema.Struct({
  session: Schema.Struct({ id: Schema.String }),
  inputs: Schema.Array(Schema.Struct({ id: Schema.String, session_id: Schema.String, prompt: Schema.Unknown, delivery: Schema.String, admitted_seq: Schema.Number })),
  admissions: Schema.Array(Schema.Struct({ type: Schema.String, data: Schema.Unknown })),
  messages: Schema.Array(Schema.Unknown),
})
type NativeServer = typeof Ready.Type & { inspect: () => Promise<typeof Rows.Type> }

async function nativeServer(run: (server: NativeServer) => Promise<void>) {
  const scratch = await mkdtemp(path.join(tmpdir(), "orchestra-prompt-retry-"))
  const project = path.join(scratch, "project")
  await mkdir(project)
  const ready = path.join(scratch, "ready.json")
  try {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const app = yield* AppProcess.Service
      const child = yield* app.spawn(ChildProcess.make(process.execPath, [path.join(import.meta.dir, "prompt-retry-native-server.fixture.ts"), project, path.join(scratch, "db.sqlite"), ready], {
        cwd: path.resolve(import.meta.dir, ".."),
        env: { ...process.env, ORCHESTRA_TEST_HOME: scratch, ORCHESTRA_DB: path.join(scratch, "db.sqlite"),
          XDG_DATA_HOME: path.join(scratch, "data"), XDG_CACHE_HOME: path.join(scratch, "cache"),
          XDG_CONFIG_HOME: path.join(scratch, "config"), XDG_STATE_HOME: path.join(scratch, "state"),
          ORCHESTRA_DISABLE_PROJECT_CONFIG: "1", ORCHESTRA_DISABLE_MODELS_FETCH: "1", ORCHESTRA_TEST_CHANNEL: "test",
          ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER: "1" }, stdin: "ignore",
      }))
      const output = yield* Effect.forkScoped(AppProcess.collectStream(child.stdout, 65_536))
      const error = yield* Effect.forkScoped(AppProcess.collectStream(child.stderr, 65_536))
      const waiting = Effect.promise(async () => {
        const expires = Date.now() + 45_000
        while (!(await Bun.file(ready).exists())) {
          if (Date.now() >= expires) throw new Error("Native Session fixture did not publish readiness")
          await Bun.sleep(20)
        }
        return Schema.decodeUnknownSync(Ready)(await Bun.file(ready).json())
      }).pipe(Effect.timeout("45 seconds"))
      const host = yield* Effect.raceFirst(waiting, child.exitCode.pipe(Effect.flatMap((code) => Effect.gen(function* () {
        const stdout = yield* Fiber.join(output)
        const stderr = yield* Fiber.join(error)
        return yield* Effect.die(new Error(`Native fixture exited before readiness (${code}): ${stdout.buffer.toString()}${stderr.buffer.toString()}`))
      }))))
      yield* Effect.promise(async () => {
        const server = { ...host, inspect: async () => {
          const response = await Bun.fetch(`${host.url}/__fixture/inspect`, { signal: AbortSignal.timeout(10_000) })
          expect(response.status).toBe(200)
          return Schema.decodeUnknownSync(Rows)(await response.json())
        } }
        try { await run(server) }
        finally {
          // The child closes the listening socket during this response; its clean exit below is the teardown witness.
          await Bun.fetch(`${host.url}/__fixture/stop`, { signal: AbortSignal.timeout(10_000) }).catch(() => undefined)
        }
      })
      const code = yield* child.exitCode.pipe(Effect.timeout("10 seconds"))
      const stdout = yield* Fiber.join(output)
      const stderr = yield* Fiber.join(error)
      expect(Number(code), stdout.buffer.toString() + stderr.buffer.toString()).toBe(0)
    })).pipe(Effect.provide(LayerNode.compile(AppProcess.node))))
  } finally { await rm(scratch, { recursive: true, force: true }) }
}

function bindNative(host: NativeServer, transport: typeof fetch) {
  const api = createApiForServer({ server: { url: host.url }, fetch: transport })
  const base = serverFor()
  const server = { ...base, api, currentApi: api, server: { type: "http" as const, http: { url: host.url } },
    sessionManagement: createSessionManagementForServer({ server: { url: host.url }, fetch: transport, ready: Promise.resolve() }) }
  state.serverOverride = server
  state.sdkOverride = { ...sdkFor(host.directory, server), api, url: host.url }
  state.params.id = host.sessionID
  return composer("durable retry", { info: () => ({ id: host.sessionID }), delivery: () => "queue" })
}

test("CONTROL E1 native HTTP admission and same text after ACK create two distinct durable rows", async () => {
  expectSpawn(import.meta.path)
  await nativeServer(async (host) => {
    const calls: string[] = []
    const responses: Array<{ stage: string; status: number; body: string }> = []
    const transport: typeof fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
      const request = new Request(...args)
      const stage = new URL(request.url).pathname.split("/").at(-1) ?? ""
      calls.push(stage)
      const response = await Bun.fetch(request)
      // Only this private fixture's synthetic HTTP data; cap diagnostic output and never log headers/env/settings.
      responses.push({ stage, status: response.status, body: (await response.clone().text()).slice(0, 512) })
      expect(["execution", "agent", "model", "prompt"]).toContain(stage)
      expect(response.status).toBe(stage === "execution" || stage === "prompt" ? 200 : 204)
      return response
    }, { preconnect: Bun.fetch.preconnect })
    const owner = bindNative(host, transport)
    try {
      expect((await host.inspect()).inputs).toEqual([])
      expect(await send(owner.submit), JSON.stringify({ calls, responses, toasts })).toBe(true)
      const first = await host.inspect()
      expect(first.session.id).toBe(host.sessionID)
      expect(first.inputs).toHaveLength(1)
      expect(first.admissions).toHaveLength(1)
      expect(first.inputs[0]).toMatchObject({ session_id: host.sessionID, delivery: "queue", prompt: { text: "durable retry" } })
      owner.prompt.set(text("durable retry"))
      expect(await send(owner.submit)).toBe(true)
      const second = await host.inspect()
      expect(second.inputs).toHaveLength(2)
      expect(second.admissions).toHaveLength(2)
      expect(second.inputs[0]?.id).not.toBe(second.inputs[1]?.id)
      expect(calls).toEqual(["execution", "agent", "model", "prompt", "execution", "agent", "model", "prompt"])
      expect(promptInputs, "the mocked harness transport must not service this test").toEqual([])
    } finally { owner.dispose() }
  })
}, 75_000)

test("E1 real HTTP 200 and SQL commit followed by lost ACK retry one exact durable admission", async () => {
  expectSpawn(import.meta.path)
  await nativeServer(async (host) => {
    const posts: unknown[] = []
    const acknowledgements: number[] = []
    const committed: Array<typeof Rows.Type> = []
    const transport: typeof fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
      const request = new Request(...args)
      const prompt = new URL(request.url).pathname.endsWith("/prompt")
      if (prompt) posts.push(await request.clone().json())
      const response = await Bun.fetch(request)
      if (!prompt) return response
      acknowledgements.push(response.status)
      expect(response.status, "HTTP response exists before the localized ACK fault").toBe(200)
      committed.push(await host.inspect())
      if (posts.length === 1) {
        expect(committed.at(-1)?.inputs).toHaveLength(1)
        expect(committed.at(-1)?.admissions).toHaveLength(1)
        await response.arrayBuffer()
        throw new TypeError("Test transport lost the already-committed HTTP ACK")
      }
      return response
    }, { preconnect: Bun.fetch.preconnect })
    const owner = bindNative(host, transport)
    try {
      const original = clone(owner.prompt.current())
      expect(await send(owner.submit)).toBe(false)
      expect(acknowledgements).toEqual([200])
      expect(posts).toHaveLength(1)
      expect(committed).toHaveLength(1)
      expect(committed[0]?.inputs[0]).toMatchObject({ session_id: host.sessionID, delivery: "queue", prompt: { text: "durable retry" } })
      expect(owner.prompt.current()).toEqual(original)
      const parts = clone(optimistic[0]?.parts)
      expect(await send(owner.submit)).toBe(true)
      expect(acknowledgements).toEqual([200, 200])
      expect(posts).toHaveLength(2)
      expect(posts[1]).toEqual(posts[0])
      const final = await host.inspect()
      expect(final.inputs).toEqual(committed[0]?.inputs)
      expect(final.admissions).toEqual(committed[0]?.admissions)
      expect(final.messages).toEqual([]) // Admission-only execution; no provider/tool exactly-once claim.
      expect(optimistic[1]?.message.id).toBe(final.inputs[0]?.id)
      expect(optimistic[1]?.parts).toEqual(parts)
      expect(promptInputs).toEqual([])
    } finally { owner.dispose() }
  })
}, 75_000)
