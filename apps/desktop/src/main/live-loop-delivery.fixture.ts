import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { extname } from "node:path"
import { fileURLToPath } from "node:url"
import type { TestContext } from "node:test"
import type { startCapture } from "./live-capture.ts"
import type { createTranscriber, TranscriberEvent } from "./live-transcriber.ts"
import type { registerLiveLoop } from "./live-loop.ts"
import type { LiveDeliveryOwner } from "./live-delivery-owner-contract.ts"
import type { LiveOverlay } from "./live-overlay.ts"
import type { LiveOverlayAction } from "./live-overlay-state.ts"
import type { MeetingServer } from "./live-meeting-client.ts"
import { bounded, ownerFixture } from "./live-delivery-owner-test.fixture.ts"
import { gate, json, until } from "./live-delivery-manager-test.fixture.ts"

let active: { capture: typeof startCapture; transcriber: typeof createTranscriber } | undefined
export const captureBoundary: typeof startCapture = (...args) => { assert.ok(active); return active.capture(...args) }
export const transcriberBoundary: typeof createTranscriber = (...args) => { assert.ok(active); return active.transcriber(...args) }

// Only external UI/capture/STT are controlled. The loop, senses, owner, manager, SQLite and all HTTP are actual source.
export function loadLoopBoundary() {
  const source = import.meta.url
  const electron = `const unexpected = () => { throw new Error("Unexpected native operation in loop acceptance"); };
export const app={getPath:unexpected,getVersion:unexpected}; export const ipcMain={on:unexpected}; export const ipcRenderer=undefined;
export const shell={openExternal:unexpected}; export const safeStorage={}; export const desktopCapturer={}; export const screen={};
export const BrowserWindow={getAllWindows:()=>[]}; export const globalShortcut={register:unexpected,unregister:unexpected};
export const systemPreferences={getMediaAccessStatus:()=>"granted"};
export default {app,ipcMain,ipcRenderer,shell,safeStorage};`
  const data = (text: string) => `data:text/javascript,${encodeURIComponent(text)}`
  const hook = registerHooks({ resolve(specifier, context, next) {
    if (specifier === "electron") return { url: data(electron), shortCircuit: true }
    if (context.parentURL?.endsWith("/live-senses.ts") && ["./live-capture", "./live-capture.ts"].includes(specifier))
      return { url: data(`export { captureBoundary as startCapture } from ${JSON.stringify(source)};`), shortCircuit: true }
    if (context.parentURL?.endsWith("/live-senses.ts") && ["./live-transcriber", "./live-transcriber.ts"].includes(specifier))
      return { url: data(`export { transcriberBoundary as createTranscriber } from ${JSON.stringify(source)};`), shortCircuit: true }
    if (specifier.startsWith(".") && !extname(specifier) && context.parentURL?.startsWith(new URL("./", source).href)) {
      const resolved = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(fileURLToPath(resolved))) return { url: resolved.href, shortCircuit: true }
    }
    return next(specifier, context)
  } })
  return {
    async load() {
      const loop = await import("./live-loop.ts")
      const senses = await import("./live-senses.ts")
      const settings = await import("./live-settings.ts")
      const overlay = await import("./live-overlay-state.ts")
      const client = await import("./live-session-client.ts")
      const answer = await import("./live-answer.ts")
      return { ...loop, ...senses, ...settings, ...overlay, ...client, ...answer }
    },
    dispose: () => hook.deregister(),
  }
}

type Reason = "user" | "rotation" | "quit"
type Loop = Omit<ReturnType<typeof registerLiveLoop>, "stop"> & { stop(reason?: Reason): Promise<void> }
type Options = Omit<Parameters<typeof registerLiveLoop>[0], "server"> & {
  delivery: Pick<LiveDeliveryOwner, "manager" | "canStart" | "connection" | "onComplete">
  server: (signal?: AbortSignal) => Promise<MeetingServer>
}

export async function loopFixture(t: TestContext, load: ReturnType<typeof loadLoopBoundary>["load"], publish = true) {
  assert.equal("bun" in process.versions, false)
  assert.equal(active, undefined)
  const f = await ownerFixture(t)
  const implementation = await load()
  const held: Array<() => void> = []
  const requests = new Set<AbortController>()
  const starts = new Set<Promise<Awaited<ReturnType<typeof implementation.startSenses>>>>()
  const handles = new Set<Awaited<ReturnType<typeof implementation.startSenses>>>()
  const state = {
    sessionCount: 0, serverLookups: 0, captures: 0, captureStops: 0, sttStops: 0,
    acquisition: undefined as Promise<void> | undefined,
    close: undefined as Promise<void> | undefined,
    postSeal: undefined as Promise<void> | undefined,
    captureFailure: undefined as Error | undefined,
    captureJoined: false, cleaning: false,
    captureEntered: gate(), captureStopped: gate(), postSealEntered: gate(),
    sttEvent: undefined as ((event: TranscriberEvent) => void) | undefined,
    completions: [] as Array<{ localID: string; sessionID: string; meetingID: string }>,
  }
  const binding: { loop?: Loop } = {}
  const expected = (error: unknown): boolean => state.captureFailure !== undefined &&
    (error === state.captureFailure || (error instanceof AggregateError && error.errors.length > 0 && error.errors.every(expected)))
  const owner = f.create({ stopCapture: async (reason) => {
    await binding.loop?.stop(reason).catch((error: unknown) => {
      // Only teardown acknowledges the exact already-observed injected failure. Other causes still fail cleanup.
      if (!state.cleaning || !expected(error)) throw error
    })
  } })
  owner.onComplete((completion) => state.completions.push(completion))
  f.remote.handlers.set("POST /api/session", (_, response) => {
    const id = `ses_loop_delivery_${++state.sessionCount}`
    f.remote.handlers.set(`POST /api/session/${id}/prompt`, (_, reply) => { reply.writeHead(204); reply.end() })
    json(response, { data: { id } })
  })
  f.remote.handlers.set("GET /api/event", (_, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" })
    response.write(": actual long-lived follow\n\n")
  })
  f.remote.handlers.set("PATCH /api/meeting", (_, response, record) => json(response, { data: { title: record.body.title } }))
  const actions = new Set<(action: LiveOverlayAction) => void>()
  const view = { value: implementation.initialState(true) }
  const overlay: LiveOverlay = {
    state: () => view.value,
    start(startedAt = Date.now(), suggestions = false) { view.value = { ...implementation.initialState(true), startedAt, suggestions } },
    stop() { view.value = { ...view.value, startedAt: undefined } },
    show() {}, hide() {}, destroy() {},
    setContentProtection(contentProtection) { view.value = { ...view.value, contentProtection } },
    setView(value) { view.value = { ...view.value, view: value } },
    setError(error) { view.value = { ...view.value, error } },
    streamAnswer(answer) { view.value = implementation.streamAnswer(view.value, answer) },
    pushAnswer(answer) { view.value = implementation.pushAnswer(view.value, answer) },
    onAction(listener) { actions.add(listener); return () => actions.delete(listener) },
  }
  const values = new Map<string, unknown>()
  const settings = implementation.liveSettings({ get: (key) => values.get(key), set: (key, value) => { values.set(key, value) } },
    { register: () => true, unregister() {} })
  settings.set({ sources: { microphone: true, "system-audio": false } })
  const capture: typeof startCapture = async () => {
    state.captures++
    state.captureEntered.resolve()
    if (state.acquisition) await state.acquisition
    let closed: Promise<void> | undefined
    return { stop() {
      closed ??= (async () => {
        state.captureStops++
        if (state.close) await state.close
        state.captureJoined = true
        state.captureStopped.resolve()
        if (state.captureFailure) throw state.captureFailure
      })()
      return closed
    } }
  }
  const transcriber: typeof createTranscriber = (_, onEvent) => {
    state.sttEvent = onEvent
    let stopped = false
    return { send() {}, stop: async () => { if (!stopped) { stopped = true; state.sttStops++ } } }
  }
  active = { capture, transcriber }
  const options: Options = {
    overlay, delivery: owner, logDirectory: f.root, openSettings() {},
    server: async (signal) => {
      state.serverLookups++
      return (await owner.connection(signal ?? new AbortController().signal)).server
    },
    runtime: { settings, readKey: () => "fixture-key-not-a-credential",
      permissions: () => ({ microphone: "granted", "system-audio": "granted" }),
      senses: async (input) => {
        assert.equal(input.delivery, owner.manager, "Actual Loop must pass its actual durable manager")
        const starting = implementation.startSenses({ ...input,
          runtime: { readKey: () => "fixture-key-not-a-credential", microphone: async () => true, capture, transcriber },
        })
        starts.add(starting)
        const senses = await starting.finally(() => starts.delete(starting))
        handles.add(senses)
        // Approved post-seal continuation seam: physical capture/STT are already joined by ACTUAL senses.stop.
        // This holds only the returned result, exercising completion before Loop marks its local stop closed.
        let stopping: ReturnType<typeof senses.stop> | undefined
        return { ...senses, stop() {
          stopping ??= senses.stop().then(async (result) => {
            state.postSealEntered.resolve()
            if (state.postSeal) await state.postSeal
            return result
          })
          return stopping
        } }
      },
    },
  }
  const loop: Loop = implementation.registerLiveLoop(options)
  binding.loop = loop
  f.releaseOnCleanup(() => {
    state.cleaning = true
    held.forEach((release) => release())
    requests.forEach((controller) => controller.abort())
    // Failure containment only: release hardware gates and abort the actual Loop before the owner scope closes.
    loop.destroy()
  })
  t.after(async () => {
    try {
      await bounded(Promise.allSettled([...starts]), "Fixture startup resources did not join")
      const closed = await bounded(Promise.allSettled([...handles].map((handle) => handle.stop())), "Fixture capture/STT handles did not join")
      const failures = closed.flatMap((result) => result.status === "rejected" && !expected(result.reason) ? [result.reason] : [])
      if (failures.length) throw new AggregateError(failures, "Fixture capture/STT cleanup failed")
    } finally { active = undefined }
  })
  if (publish) await owner.setConnection(f.connection)
  return {
    ...f, owner, loop, state, implementation, overlay,
    hold() { const value = gate(); held.push(() => value.resolve()); return value },
    controller() { const controller = new AbortController(); requests.add(controller); return controller },
    fire(action: LiveOverlayAction) { actions.forEach((listener) => listener(action)) },
    sessions: () => f.remote.requests.filter((request) => request.path === "/api/session"),
    follows: () => f.remote.requests.filter((request) => request.path === "/api/event"),
    prompts: () => f.remote.requests.filter((request) => request.path.endsWith("/prompt")),
    summaries: () => f.remote.requests.filter((request) => (request.body.prompt as { text?: string } | undefined)?.text === implementation.LIVE_PROMPTS.stop),
    piece(text = "Actual loop durable final") {
      assert.ok(state.sttEvent)
      state.sttEvent({ kind: "piece", piece: { track: "me", text, startMs: 0, endMs: 100, final: true } })
      state.sttEvent({ kind: "speech-end", track: "me", atMs: 100 })
    },
    async running(title = "Loop delivery") {
      const started = await loop.start(title)
      assert.equal(started.ok, true)
      await until(() => f.remote.requests.some((request) => request.path === "/api/event"), "Actual Session follow was not entered")
      return started
    },
  }
}
