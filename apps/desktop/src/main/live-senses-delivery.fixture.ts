import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { extname } from "node:path"
import { fileURLToPath } from "node:url"
import type { TestContext } from "node:test"
import type { startCapture } from "./live-capture.ts"
import type { createTranscriber, TranscriberEvent } from "./live-transcriber.ts"
import type { startSenses } from "./live-senses.ts"
import type { LiveDeliveryManager } from "./live-delivery-contract.ts"
import { attach } from "./live-delivery-manager-actions.fixture.ts"
import { fixture, gate, input, until } from "./live-delivery-manager-test.fixture.ts"

// Only the OS capture/STT boundaries are controlled. Source senses, segmenter, delivery manager, SQLite and HTTP run.
type Capture = typeof startCapture
type Transcriber = typeof createTranscriber
type Started = Awaited<ReturnType<typeof startSenses>>
let active: { capture: Capture; transcriber: Transcriber } | undefined
export const captureBoundary: Capture = (...args) => {
  assert.ok(active, "Capture called outside its owned acceptance fixture")
  return active.capture(...args)
}
export const transcriberBoundary: Transcriber = (...args) => {
  assert.ok(active, "STT called outside its owned acceptance fixture")
  return active.transcriber(...args)
}

export function loadSensesBoundary() {
  const source = import.meta.url
  const electron = `const unavailable = () => { throw new Error("Unexpected Electron operation outside controlled capture/STT"); };
export const app = { getPath: unavailable, getVersion: unavailable };
export const ipcMain = { on: unavailable }; export const ipcRenderer = undefined;
export const shell = {}; export const safeStorage = {}; export const desktopCapturer = {}; export const screen = {};
export const systemPreferences = { getMediaAccessStatus: () => "granted" };
export default { app, ipcMain, ipcRenderer, shell, safeStorage };`
  const url = (body: string) => `data:text/javascript,${encodeURIComponent(body)}`
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "electron") return { url: url(electron), shortCircuit: true }
      if (context.parentURL?.endsWith("/live-senses.ts") && ["./live-capture", "./live-capture.ts"].includes(specifier))
        return { url: url(`export { captureBoundary as startCapture } from ${JSON.stringify(source)};`), shortCircuit: true }
      if (context.parentURL?.endsWith("/live-senses.ts") && ["./live-transcriber", "./live-transcriber.ts"].includes(specifier))
        return { url: url(`export { transcriberBoundary as createTranscriber } from ${JSON.stringify(source)};`), shortCircuit: true }
      // Node's type stripping does not add extensions to the existing Electron Main imports.
      if (specifier.startsWith(".") && !extname(specifier) && context.parentURL?.startsWith(new URL("./", source).href)) {
        const resolved = new URL(`${specifier}.ts`, context.parentURL)
        if (existsSync(fileURLToPath(resolved))) return { url: resolved.href, shortCircuit: true }
      }
      return next(specifier, context)
    },
  })
  return { load: () => import("./live-senses.ts"), dispose: () => hooks.deregister() }
}

export async function bounded<A>(work: Promise<A>, label: string, milliseconds = 1000) {
  const expired = gate<never>()
  const timer = setTimeout(() => expired.reject(new Error(label)), milliseconds)
  try { return await Promise.race([work, expired.promise]) } finally { clearTimeout(timer) }
}

// A typed intersection transcribes the frozen future ports; current source may accept the variable structurally.
type Options = Parameters<typeof startSenses>[0] & {
  delivery: LiveDeliveryManager
  runtime: NonNullable<Parameters<typeof startSenses>[0]["runtime"]> & { capture: Capture; transcriber: Transcriber }
}

export async function sensesFixture(t: TestContext, load: () => Promise<{ startSenses: typeof startSenses }>) {
  assert.equal("bun" in process.versions, false, "SQLite qualification must execute in actual Node")
  assert.equal(active, undefined, "Acceptance capture owners must not overlap")
  const f = await fixture(t)
  const manager = attach(f)
  const controller = new AbortController()
  const releases: Array<() => void> = []
  const events: Parameters<Options["onEvent"]>[0][] = []
  const state = {
    captureStarts: 0, captureStops: 0, captureJoined: false, transcriberStops: 0,
    permissionEntered: gate(), captureEntered: gate(), sttEntered: gate(), captureClosed: gate(),
    permission: undefined as Promise<boolean> | undefined,
    acquisition: undefined as Promise<void> | undefined,
    captureClose: undefined as Promise<void> | undefined,
    sttClose: undefined as Promise<void> | undefined,
    beforeCaptureStop: undefined as (() => void) | undefined,
    finalDuringStop: undefined as TranscriberEvent | undefined,
    sttEvent: undefined as ((event: TranscriberEvent) => void) | undefined,
  }
  const capture: Capture = async () => {
    state.captureStarts++
    state.captureEntered.resolve()
    if (state.acquisition) await state.acquisition
    return {
      async stop() {
        state.captureStops++
        assert.equal(state.captureStops, 1, "Capture stop must not reenter before publishing its memoized promise")
        state.beforeCaptureStop?.()
        if (state.captureClose) await state.captureClose
        state.captureJoined = true
        state.captureClosed.resolve()
      },
    }
  }
  const transcriber: Transcriber = (_, onEvent) => {
    state.sttEvent = onEvent
    return {
      send() {},
      async stop() {
        state.transcriberStops++
        assert.equal(state.captureJoined, true, "STT finalization must follow joined capture closure")
        assert.equal(state.transcriberStops, 1, "STT stop must be joined once")
        state.sttEntered.resolve()
        if (state.finalDuringStop) onEvent(state.finalDuringStop)
        if (state.sttClose) await state.sttClose
      },
    }
  }
  const owned: { starting?: Promise<Started>; senses?: Started } = {}
  f.own(async () => {
    releases.forEach((release) => release())
    controller.abort()
    try {
      if (owned.starting) await owned.starting.catch(() => undefined)
      if (owned.senses) await owned.senses.stop()
    } finally { active = undefined }
  })
  active = { capture, transcriber }
  const implementation = await load()
  const options: Options = {
    signal: controller.signal, delivery: manager, server: f.current.value.server,
    ...input(), logDirectory: f.root, sources: { microphone: true, systemAudio: false },
    onEvent: (event) => events.push(event),
    runtime: { readKey: () => "fixture-key-not-a-credential", microphone: async () => {
      state.permissionEntered.resolve()
      return state.permission ? await state.permission : true
    }, capture, transcriber },
  }
  return {
    ...f, manager, controller, state, events,
    hold() { const held = gate(); releases.push(() => held.resolve()); return held },
    holdPermission() { const held = gate<boolean>(); releases.push(() => held.resolve(true)); state.permission = held.promise; return held },
    start() {
      const starting = implementation.startSenses(options)
      owned.starting = starting
      starting.then((senses) => { owned.senses = senses }, () => undefined)
      return starting
    },
    piece(text: string, final = true) {
      assert.ok(state.sttEvent, "Real senses must install the controlled STT callback")
      state.sttEvent({ kind: "piece", piece: { track: "me", text, startMs: 0, endMs: 100, final } })
    },
    endSpeech() {
      assert.ok(state.sttEvent)
      state.sttEvent({ kind: "speech-end", track: "me", atMs: 100 })
    },
    async localID() {
      await until(() => manager.snapshot().items.length === 1, "Real durable meeting row was not created")
      const id = manager.snapshot().items[0]?.id
      assert.ok(id)
      return id
    },
  }
}
