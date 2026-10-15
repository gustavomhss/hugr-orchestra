export * as Pty from "./pty"

import { makeLocationNode } from "./effect/app-node"
import type { Disp, Proc } from "#pty"
import { Context, Effect, Exit, Layer, Option, Schema, Types } from "effect"
import { Pty } from "@orchestra/schema/pty"
import { Config } from "./config"
import { EventV2 } from "./event"
import { Flag } from "./flag/flag"
import { Location } from "./location"
import { OmniAdoption } from "./omni-adoption"
import { OmniBackground } from "./omni-background"
import { PtyProtocol } from "./pty/protocol"
import { clampSize } from "./pty/pty"
import type { OmniProc } from "./pty/omni"
import { PtyID } from "./pty/schema"
import { Shell } from "./shell"
import { lazy } from "./util/lazy"

const BUFFER_LIMIT = 1024 * 1024 * 2
// Exited sessions stay observable (status, exit code, retained output) until removed explicitly.
// Cap retention so abandoned terminals do not accumulate unbounded buffers.
const EXITED_LIMIT = 25
const pty = lazy(() => import("#pty"))
const omniPty = lazy(() => import("./pty/omni").then((mod) => mod.load()))
// How long an omni tree gets to wind down when its session goes, and how long the layer finalizer waits for every
// pending stop: above ConPTY's declared 6 s close (integration plan, WP2).
const STOP_GRACE_MS = 2000
const FINALIZE_CAP = "7 seconds"

type Subscriber = {
  readonly onData: (chunk: string) => void
  readonly onEnd: (event: { exitCode?: number }) => void
  active: boolean
  detached: boolean
  pending: string[]
  end?: { exitCode?: number }
}

type Active = {
  info: Info
  process: Proc
  buffer: string
  bufferCursor: number
  cursor: number
  subscribers: Map<object, Subscriber>
  listeners: Disp[]
  // Set when omni runs this session: its tree, and the adoption services the creating caller had (R2-3).
  omni?: {
    proc: OmniProc
    adoption?: { service: OmniAdoption.Service["Service"]; registry?: OmniAdoption.Interface }
  }
}

export const Info = Pty.Info
export type Info = Types.DeepMutable<typeof Info.Type>

export const CreateInput = Pty.CreateInput

export type CreateInput = Types.DeepMutable<typeof CreateInput.Type>

export const UpdateInput = Pty.UpdateInput

export type UpdateInput = Types.DeepMutable<typeof UpdateInput.Type>

export const Event = Pty.Event

export type AttachInput = {
  // Absolute output cursor to replay from. -1 tails from the current end; omitted replays the full retained buffer.
  readonly cursor?: number
  // Callbacks fire synchronously from the native PTY data path; keep them non-blocking.
  readonly onData: (chunk: string) => void
  // Fired once when the session stops producing output: process exit (exitCode set), removal, or service teardown.
  readonly onEnd: (event: { exitCode?: number }) => void
}

export type Attachment = {
  // Retained output from the requested cursor to the current end.
  readonly replay: string
  // Absolute output cursor after replay.
  readonly cursor: number
  readonly write: (data: string) => void
  // Starts live delivery after the caller has applied replay and cursor metadata.
  readonly activate: () => void
  readonly detach: () => void
}

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("Pty.NotFoundError", {
  ptyID: PtyID,
}) {}

export class ExitedError extends Schema.TaggedErrorClass<ExitedError>()("Pty.ExitedError", {
  ptyID: PtyID,
}) {}

export interface Interface {
  readonly list: () => Effect.Effect<Info[]>
  readonly get: (id: PtyID) => Effect.Effect<Info, NotFoundError>
  readonly create: (input: CreateInput) => Effect.Effect<Info>
  readonly update: (id: PtyID, input: UpdateInput) => Effect.Effect<Info, NotFoundError>
  readonly remove: (id: PtyID) => Effect.Effect<void, NotFoundError>
  readonly write: (id: PtyID, data: string) => Effect.Effect<void, NotFoundError>
  readonly attach: (id: PtyID, input: AttachInput) => Effect.Effect<Attachment, NotFoundError | ExitedError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Pty") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    const location = yield* Location.Service
    const config = yield* Config.Service
    const context = yield* Effect.context()
    const runFork = Effect.runForkWith(context)
    const runPromise = Effect.runPromiseWith(context)
    const sessions = new Map<PtyID, Active>()
    const exitOrder: PtyID[] = []
    // Stops of omni trees still in flight: remove never awaits them, the layer finalizer does (capped).
    const stopping = new Set<Promise<void>>()

    function notifyEnd(session: Active, event: { exitCode?: number }) {
      for (const subscriber of session.subscribers.values()) {
        if (!subscriber.active) {
          subscriber.end = event
          continue
        }
        try {
          subscriber.onEnd(event)
        } catch {}
      }
      session.subscribers.clear()
    }

    // `adopt`: the user closed the session, so a tree with live descendants may go to the adoption registry. Eviction
    // and the layer's end always stop what is left of the tree (for omni, also after the root exited).
    function teardown(session: Active, adopt: boolean) {
      for (const listener of session.listeners) listener.dispose()
      session.listeners.length = 0
      if (session.omni) {
        const pending = close(session.omni, session.info.title, adopt)
        stopping.add(pending)
        void pending.finally(() => stopping.delete(pending))
      }
      if (!session.omni && session.info.status === "running") {
        try {
          session.process.kill()
        } catch {}
      }
      notifyEnd(session, {})
    }

    async function close(omni: NonNullable<Active["omni"]>, title: string, adopt: boolean) {
      const adoption = adopt ? omni.adoption : undefined
      if (!adoption || !(await descendants(omni.proc))) return omni.proc.stop(STOP_GRACE_MS)
      // The adopted tree's output goes to the registry's ring from now on (R2-4), not to the closed session.
      const sink = OmniBackground.sink(omni.proc.child)
      omni.proc.redirect((data) => sink.write(data))
      const release = OmniAdoption.release(omni.proc.child, Exit.void, { title, graceMs: STOP_GRACE_MS }).pipe(
        Effect.provideService(OmniAdoption.Service, adoption.service),
      )
      return runPromise(
        adoption.registry ? release.pipe(Effect.provideService(OmniAdoption.Registry, adoption.registry)) : release,
      ).catch(() => omni.proc.stop(STOP_GRACE_MS))
    }

    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        for (const session of sessions.values()) teardown(session, false)
        sessions.clear()
        exitOrder.length = 0
        if (stopping.size === 0) return
        yield* Effect.promise(() => Promise.allSettled([...stopping])).pipe(
          Effect.timeoutOption(FINALIZE_CAP),
          Effect.asVoid,
        )
      }),
    )

    const requireSession = Effect.fn("Pty.requireSession")(function* (id: PtyID) {
      const session = sessions.get(id)
      if (!session) return yield* new NotFoundError({ ptyID: id })
      return session
    })

    const removeSession = Effect.fnUntraced(function* (id: PtyID, adopt = false) {
      const session = sessions.get(id)
      if (!session) return
      sessions.delete(id)
      const index = exitOrder.indexOf(id)
      if (index !== -1) exitOrder.splice(index, 1)
      yield* Effect.logInfo("removing session", { id })
      teardown(session, adopt)
      yield* events.publish(Event.Deleted, { id: session.info.id })
    })

    const remove = Effect.fn("Pty.remove")(function* (id: PtyID) {
      yield* requireSession(id)
      yield* removeSession(id, true)
    })

    const list = Effect.fn("Pty.list")(function* () {
      return Array.from(sessions.values()).map((session) => session.info)
    })

    const get = Effect.fn("Pty.get")(function* (id: PtyID) {
      return (yield* requireSession(id)).info
    })

    const create = Effect.fn("Pty.create")(function* (input: CreateInput) {
      const id = PtyID.ascending()
      const command = input.command || Shell.preferred(Config.latest(yield* config.entries(), "shell"))
      const args = Shell.login(command) ? [...(input.args ?? []), "-l"] : [...(input.args ?? [])]
      const cwd = input.cwd || location.directory
      const env = {
        ...process.env,
        ...input.env,
        TERM: "xterm-256color",
        ORCHESTRA_TERMINAL: "1",
      } as Record<string, string>
      if (process.platform === "win32") {
        env.LC_ALL = "C.UTF-8"
        env.LC_CTYPE = "C.UTF-8"
        env.LANG = "C.UTF-8"
      }
      // Only given sizes reach the backend, so a create without them stays what it was.
      const size = {
        ...(input.cols === undefined ? {} : { cols: clampSize(input.cols) }),
        ...(input.rows === undefined ? {} : { rows: clampSize(input.rows) }),
      }
      const backend = Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? "legacy" : "omni"
      yield* Effect.logInfo("creating session", { id, cmd: command, args, cwd, backend })
      const omni =
        backend === "omni"
          ? yield* Effect.gen(function* () {
              const { spawn } = yield* Effect.promise(() => omniPty())
              const proc = yield* Effect.sync(() => spawn(command, args, { name: "xterm-256color", cwd, env, ...size }))
              const service = Option.getOrUndefined(yield* Effect.serviceOption(OmniAdoption.Service))
              const registry = Option.getOrUndefined(yield* Effect.serviceOption(OmniAdoption.Registry))
              return { proc, ...(service ? { adoption: { service, registry } } : {}) }
            })
          : undefined
      const proc =
        omni?.proc ??
        (yield* Effect.gen(function* () {
          const { spawn } = yield* Effect.promise(() => pty())
          // A short command can exit right after spawn, and the backends only notify listeners attached when an event
          // fires (bun-pty 0.4.9 starts reading on a microtask; 0.4.8 read inside spawn and dropped such exits). Attach
          // onData and onExit below without an async step in between, or the session never leaves "running".
          return yield* Effect.sync(() => spawn(command, args, { name: "xterm-256color", cwd, env, ...size }))
        }))
      const info: Info = {
        id,
        title: input.title || `Terminal ${id.slice(-4)}`,
        command,
        args,
        cwd,
        status: "running",
        pid: proc.pid,
      }
      const session: Active = {
        info,
        process: proc,
        buffer: "",
        bufferCursor: 0,
        cursor: 0,
        subscribers: new Map(),
        listeners: [],
        ...(omni ? { omni } : {}),
      }
      sessions.set(id, session)
      session.listeners.push(
        proc.onData((chunk) => {
          session.cursor += chunk.length
          for (const [token, subscriber] of session.subscribers.entries()) {
            if (!subscriber.active) {
              subscriber.pending.push(chunk)
              continue
            }
            try {
              subscriber.onData(chunk)
            } catch {
              session.subscribers.delete(token)
            }
          }
          session.buffer += chunk
          if (session.buffer.length <= BUFFER_LIMIT) return
          // Never keep half of a surrogate pair at the start of the ring.
          const excess = PtyProtocol.cut(session.buffer, session.buffer.length - BUFFER_LIMIT)
          session.buffer = session.buffer.slice(excess)
          session.bufferCursor += excess
        }),
        proc.onExit(({ exitCode }) => {
          if (session.info.status === "exited") return
          session.info.status = "exited"
          session.info.exitCode = exitCode
          notifyEnd(session, { exitCode })
          exitOrder.push(id)
          runFork(
            Effect.gen(function* () {
              yield* Effect.logInfo("session exited", { id, exitCode })
              yield* events.publish(Event.Exited, { id, exitCode })
              while (exitOrder.length > EXITED_LIMIT) {
                const oldest = exitOrder[0]
                if (!oldest) break
                yield* removeSession(oldest)
              }
            }),
          )
        }),
      )
      yield* events.publish(Event.Created, { info })
      return info
    })

    const update = Effect.fn("Pty.update")(function* (id: PtyID, input: UpdateInput) {
      const session = yield* requireSession(id)
      if (input.title) session.info.title = input.title
      if (input.size && session.info.status === "running")
        session.process.resize(clampSize(input.size.cols), clampSize(input.size.rows))
      yield* events.publish(Event.Updated, { info: session.info })
      return session.info
    })

    const write = Effect.fn("Pty.write")(function* (id: PtyID, data: string) {
      const session = yield* requireSession(id)
      if (session.info.status === "running") session.process.write(data)
    })

    const attach = Effect.fn("Pty.attach")(function* (id: PtyID, input: AttachInput) {
      const session = yield* requireSession(id)
      if (session.info.status !== "running") return yield* new ExitedError({ ptyID: id })
      yield* Effect.logInfo("client attached to session", { id, directory: location.directory })
      const token = {}
      const subscriber: Subscriber = {
        onData: input.onData,
        onEnd: input.onEnd,
        active: false,
        detached: false,
        pending: [],
      }
      session.subscribers.set(token, subscriber)
      const start = session.bufferCursor
      const end = session.cursor
      const from =
        input.cursor === -1
          ? end
          : typeof input.cursor === "number" && Number.isSafeInteger(input.cursor)
            ? Math.max(0, input.cursor)
            : 0
      const replay = (() => {
        if (!session.buffer || from >= end) return ""
        const offset = Math.max(0, from - start)
        if (offset >= session.buffer.length) return ""
        return session.buffer.slice(offset)
      })()
      return {
        replay,
        cursor: end,
        write: (data: string) => {
          if (session.info.status === "running") session.process.write(data)
        },
        activate: () => {
          if (subscriber.active || subscriber.detached) return
          subscriber.active = true
          try {
            for (const chunk of subscriber.pending) subscriber.onData(chunk)
            subscriber.pending.length = 0
            if (subscriber.end) subscriber.onEnd(subscriber.end)
          } catch {
            session.subscribers.delete(token)
          }
        },
        detach: () => {
          subscriber.detached = true
          subscriber.pending.length = 0
          subscriber.end = undefined
          session.subscribers.delete(token)
        },
      }
    })

    return Service.of({ list, get, create, update, remove, write, attach })
  }),
)

// Whether anything besides the root is alive in the tree, such as a background job the shell left behind.
async function descendants(proc: OmniProc) {
  const alive = await proc.child.processes().catch(() => [])
  return alive.some((entry) => entry.pid !== proc.pid)
}

export const locationLayer = layer.pipe(Layer.provide(Config.locationLayer))

export const node = makeLocationNode({ service: Service, layer, deps: [EventV2.node, Location.node, Config.node] })
