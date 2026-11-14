import { expect } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRoot } from "solid-js"
import { isServer } from "solid-js/web"
import { Effect, Fiber, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { createPromptState, type ImageAttachmentPart } from "@/context/prompt-state"
import { createApiForServer } from "@/utils/server"
import { createSessionManagementForServer } from "@/utils/session-management"
import { createPromptSubmit, sdkFor, serverFor, setReactiveOwner, state, submitInput } from "@/components/prompt-input/submit-harness"


export function composer(value = "retry this", options: Partial<Parameters<typeof createPromptSubmit>[0]> = {}) {
  expect(isServer, "this suite must use the real Solid browser owner lifecycle").toBe(false)
  state.params.id ??= "session-1"
  return createRoot((dispose) => {
    const prompt = createPromptState({ prompt: value })
    return { dispose, prompt, submit: createPromptSubmit({ ...submitInput(), prompt,
      imageAttachments: () => prompt.current().filter((part): part is ImageAttachmentPart => part.type === "image"), ...options }) }
  })
}

const Ready = Schema.Struct({ url: Schema.String, directory: Schema.String, sessionID: Schema.String })
const Rows = Schema.Struct({
  session: Schema.Struct({ id: Schema.String }),
  inputs: Schema.Array(Schema.Struct({ id: Schema.String, session_id: Schema.String, prompt: Schema.Unknown, delivery: Schema.String, admitted_seq: Schema.Number })),
  admissions: Schema.Array(Schema.Struct({ type: Schema.String, data: Schema.Unknown })),
  messages: Schema.Array(Schema.Unknown),
})
const HeldAck = Schema.Struct({ status: Schema.Number, sessionID: Schema.String, messageID: Schema.String })
export type NativeServer = typeof Ready.Type & {
  inspect: (sessionID?: string) => Promise<typeof Rows.Type>
  armPromptAck: () => Promise<void>
  waitPromptAck: () => Promise<typeof HeldAck.Type>
  releasePromptAck: () => Promise<void>
}

export async function nativeServer(run: (server: NativeServer) => Promise<void>) {
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
        const server = { ...host, inspect: async (sessionID?: string) => {
          const url = new URL("/__fixture/inspect", host.url)
          if (sessionID !== undefined) url.searchParams.set("sessionID", sessionID)
          const response = await Bun.fetch(url, { signal: AbortSignal.timeout(10_000) })
          expect(response.status).toBe(200)
          return Schema.decodeUnknownSync(Rows)(await response.json())
        }, armPromptAck: async () => {
          const response = await Bun.fetch(`${host.url}/__fixture/prompt-ack/arm`, { method: "POST", signal: AbortSignal.timeout(10_000) })
          expect(response.status).toBe(200)
        }, waitPromptAck: async () => {
          const response = await Bun.fetch(`${host.url}/__fixture/prompt-ack/entered`, { signal: AbortSignal.timeout(10_000) })
          expect(response.status).toBe(200)
          return Schema.decodeUnknownSync(HeldAck)(await response.json())
        }, releasePromptAck: async () => {
          const response = await Bun.fetch(`${host.url}/__fixture/prompt-ack/release`, { method: "POST", signal: AbortSignal.timeout(10_000) })
          expect(response.status).toBe(200)
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

export function bindNative(host: NativeServer, transport: typeof fetch) {
  const api = createApiForServer({ server: { url: host.url }, fetch: transport })
  const base = serverFor()
  const server = { ...base, api, currentApi: api, server: { type: "http" as const, http: { url: host.url } },
    sessionManagement: createSessionManagementForServer({ server: { url: host.url }, fetch: transport, ready: Promise.resolve() }) }
  state.serverOverride = server
  state.sdkOverride = { ...sdkFor(host.directory, server), api, url: host.url }
  state.params.id = host.sessionID
  return composer("durable retry", { info: () => ({ id: host.sessionID }), delivery: () => "queue" })
}

export function bindNativeDraft(host: NativeServer, transport: typeof fetch) {
  const api = createApiForServer({ server: { url: host.url }, fetch: transport })
  const base = serverFor()
  const server = { ...base, api, currentApi: api, server: { type: "http" as const, http: { url: host.url } },
    sessionManagement: createSessionManagementForServer({ server: { url: host.url }, fetch: transport, ready: Promise.resolve() }) }
  const source = { server, sdk: { ...sdkFor(host.directory, server), api, url: host.url } }
  state.serverOverride = server
  state.sdkOverride = source.sdk
  state.params.id = undefined
  state.selected = "main"
  setReactiveOwner("read", () => () => source)
  return createRoot((dispose) => {
    const prompt = createPromptState({ prompt: "native draft held ACK" })
    return { dispose, prompt, server, source, submit: createPromptSubmit({ ...submitInput(), prompt,
      info: () => state.params.id ? { id: state.params.id } : undefined,
      newSessionWorktree: () => "main" }) }
  })
}

