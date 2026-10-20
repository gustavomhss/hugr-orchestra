export * as SessionProcess from "./session-process"

import { Clock, Context, Deferred, Duration, Effect, Layer, Option, Scope, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { AppProcess } from "./process"
import { EventV2 } from "./event"
import { Identifier } from "./id/id"
import { makeGlobalNode } from "./effect/app-node"
import { OmniBackground } from "./omni-background"
import { SessionV2 } from "./session"
import { SessionV1 } from "./v1/session"

export const RING_BYTES = OmniBackground.RING_BYTES
export const TAIL_BYTES = OmniBackground.TAIL_BYTES
export const Ring = OmniBackground.Ring

export type ProcessInfo = OmniBackground.ProcessInfo

export type Info = {
  readonly id: string
  readonly pid: number
  readonly title: string
  readonly started: number
  readonly processes: ReadonlyArray<ProcessInfo>
  readonly output: string
  readonly written: number
}

export type LaunchInput = {
  readonly sessionID: string
  readonly command: string | ChildProcess.Command
  readonly args?: ReadonlyArray<string>
  readonly title?: string
  readonly cwd?: string
  readonly env?: Record<string, string | undefined>
  readonly shell?: string
}

export type WaitResult = {
  readonly info?: Info
  readonly timedOut: boolean
}

export interface Interface {
  readonly launch: (input: LaunchInput) => Effect.Effect<Info & { readonly processID: string }, unknown>
  readonly list: (sessionID: string, tail?: number) => Effect.Effect<ReadonlyArray<Info>>
  readonly get: (sessionID: string, id: string) => Effect.Effect<Info | undefined>
  readonly wait: (sessionID: string, id: string, timeout?: number) => Effect.Effect<WaitResult>
  readonly cancel: (sessionID: string, id: string) => Effect.Effect<boolean>
  readonly stopSession: (sessionID: string) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/SessionProcess") {}

type Status = "running" | "completed" | "error" | "cancelled"

type Entry = {
  readonly id: string
  readonly sessionID: string
  // Captured from the launching caller: the registry is global and must not require the Session service to build.
  readonly sessions: Option.Option<SessionV2.Interface>
  title: string
  readonly started: number
  readonly pid: number
  readonly handle: ChildProcessHandle
  readonly ring: OmniBackground.Ring
  readonly scope: Scope.Closeable
  readonly processes: ReadonlyArray<ProcessInfo>
  readonly done: Deferred.Deferred<Info>
  finished: boolean
  status: Status
  exitCode: number | null
  error?: string
}

const make = Effect.gen(function* () {
  const appProcess = yield* AppProcess.Service
  const events = yield* EventV2.Service
  const scope = yield* Scope.Scope

  const entries = new Map<string, Entry>()

  const snapshot = (entry: Entry): Info => ({
    id: entry.id,
    pid: entry.pid,
    title: entry.title,
    started: entry.started,
    processes: entry.processes,
    output: entry.ring.text(RING_BYTES),
    written: entry.ring.written,
  })

  const finish = Effect.fn("SessionProcess.finish")(function* (
    entry: Entry,
    status: Exclude<Status, "running" | "cancelled">,
    exitCode: number | null,
    error: string | undefined,
  ) {
    if (entry.finished) return
    entry.finished = true
    entry.status = status
    entry.exitCode = exitCode
    entry.error = error
    const info = snapshot(entry)
    yield* Deferred.succeed(entry.done, info).pipe(Effect.ignore)
    const text =
      status === "completed"
        ? `Background process "${entry.title}" exited with code ${exitCode ?? 0}.\n\n${entry.ring.text(4096)}`
        : `Background process "${entry.title}" failed: ${error ?? "unknown"}.\n\n${entry.ring.text(4096)}`
    if (Option.isSome(entry.sessions))
      yield* entry.sessions.value.synthetic({ sessionID: entry.sessionID as never, text, resume: true }).pipe(Effect.ignore)
  })

  const cancelEntry = Effect.fn("SessionProcess.cancelEntry")(function* (entry: Entry) {
    if (entry.finished) return true
    entry.finished = true
    entry.status = "cancelled"
    entry.exitCode = null
    yield* entry.handle.kill().pipe(Effect.ignore)
    yield* Deferred.succeed(entry.done, snapshot(entry)).pipe(Effect.ignore)
    return true
  })

  const stopSession: Interface["stopSession"] = Effect.fn("SessionProcess.stopSession")(function* (sessionID) {
    const targets = [...entries.values()].filter((entry) => entry.sessionID === sessionID && !entry.finished)
    yield* Effect.forEach(targets, (entry) => cancelEntry(entry), { concurrency: "unbounded", discard: true })
  })

  const launch: Interface["launch"] = Effect.fn("SessionProcess.launch")(function* (input) {
    const title = input.title ?? (typeof input.command === "string" ? input.command : "background process")
    const id = Identifier.ascending("job")
    const started = yield* Clock.currentTimeMillis
    const ring = new OmniBackground.Ring()
    const done = yield* Deferred.make<Info>()
    const sessions = yield* Effect.serviceOption(SessionV2.Service)
    const procScope = yield* Scope.fork(scope)
    const shell = input.shell ?? (process.platform === "win32" ? (process.env.COMSPEC ?? "cmd.exe") : "/bin/sh")
    const command =
      typeof input.command === "string"
        ? ChildProcess.make(input.command, input.args ?? [], {
            cwd: input.cwd,
            shell,
            env: input.env,
            stdin: "ignore",
            detached: process.platform !== "win32",
            forceKillAfter: Duration.seconds(3),
          })
        : input.command
    const handle = yield* appProcess.spawn(command).pipe(Effect.provideService(Scope.Scope, procScope))
    const entry: Entry = {
      id,
      sessionID: input.sessionID,
      sessions,
      title,
      started,
      pid: Number(handle.pid),
      handle,
      ring,
      scope: procScope,
      processes: [{ pid: Number(handle.pid), parentPid: null, name: null }],
      done,
      finished: false,
      status: "running",
      exitCode: null,
    }
    entries.set(id, entry)
    yield* Stream.runForEach(handle.all, (chunk) => Effect.sync(() => ring.write(chunk))).pipe(Effect.ignore).pipe(Effect.forkIn(procScope))
    yield* Effect.gen(function* () {
      const code = yield* Effect.orElseSucceed(handle.exitCode, () => null)
      if (entry.finished) return
      yield* finish(entry, code === 0 ? "completed" : "error", code, code === 0 ? undefined : `exit ${code}`)
    }).pipe(Effect.ignore, Effect.forkIn(procScope))
    return { ...snapshot(entry), processID: id }
  })

  const list: Interface["list"] = Effect.fn("SessionProcess.list")(function* (sessionID, tail) {
    const bytes = tail === undefined ? TAIL_BYTES : Math.max(0, Math.min(tail, RING_BYTES))
    return [...entries.values()]
      .filter((entry) => entry.sessionID === sessionID && entry.status === "running")
      .map((entry) => ({
        id: entry.id,
        pid: entry.pid,
        title: entry.title,
        started: entry.started,
        processes: entry.processes,
        output: entry.ring.text(bytes),
        written: entry.ring.written,
      }))
  })

  const get: Interface["get"] = Effect.fn("SessionProcess.get")(function* (sessionID, id) {
    const entry = entries.get(id)
    if (!entry || entry.sessionID !== sessionID) return undefined
    return snapshot(entry)
  })

  const wait: Interface["wait"] = Effect.fn("SessionProcess.wait")(function* (sessionID, id, timeout) {
    const entry = entries.get(id)
    if (!entry || entry.sessionID !== sessionID) return { timedOut: false }
    if (entry.finished) return { info: snapshot(entry), timedOut: false }
    if (timeout === undefined) return { info: yield* Deferred.await(entry.done), timedOut: false }
    if (timeout <= 0) return { info: snapshot(entry), timedOut: true }
    const info = yield* Deferred.await(entry.done).pipe(Effect.timeoutOption(timeout))
    if (info._tag === "Some") return { info: info.value, timedOut: false }
    return { info: snapshot(entry), timedOut: true }
  })

  const cancel: Interface["cancel"] = Effect.fn("SessionProcess.cancel")(function* (sessionID, id) {
    const entry = entries.get(id)
    if (!entry || entry.sessionID !== sessionID) return false
    if (entry.finished) return false
    return yield* cancelEntry(entry)
  })

  const off = yield* events.listen((event) => {
    const data = event.data as { sessionID?: unknown }
    if (event.type !== SessionV1.Event.Deleted.type) return Effect.void
    if (typeof data?.sessionID !== "string") return Effect.void
    return stopSession(data.sessionID).pipe(Effect.ignore)
  })
  yield* Effect.addFinalizer(() => off)

  return Service.of({ launch, list, get, wait, cancel, stopSession })
})

const layer = Layer.effect(Service, make)

export const node = makeGlobalNode({ service: Service, layer, deps: [AppProcess.node, EventV2.node] })
