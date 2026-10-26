export * as SessionProcess from "./session-process"

import { Clock, Context, Deferred, Duration, Effect, Exit, Fiber, Layer, Option, Scope, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { AppProcess } from "./process"
import { EventV2 } from "./event"
import { Identifier } from "./id/id"
import { makeGlobalNode } from "./effect/app-node"
import { OmniBackground } from "./omni-background"
import { OutputInspector } from "./output-inspector"
import { SessionV2 } from "./session"

export const RING_BYTES = OmniBackground.RING_BYTES
export const TAIL_BYTES = OmniBackground.TAIL_BYTES
/** Finished jobs kept for `get` and `wait`; older ones are forgotten. */
export const FINISHED_KEPT = 32
const DRAIN_TIMEOUT = Duration.millis(500)
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
  /** Rewrites the command before it spawns (sandbox confinement); its Scope lives as long as the process. */
  readonly prepare?: (command: ChildProcess.Command) => Effect.Effect<ChildProcess.Command, unknown, Scope.Scope>
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
  readonly inspection: ReturnType<typeof OutputInspector.make>
  // Latched once the output shows a recognized secret: no tail of it leaves the registry afterwards.
  withheld?: string
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

  // Mirrors foreground bash, which discards a result whose output shows a recognized secret.
  const output = (entry: Entry, bytes: number) =>
    entry.withheld
      ? `[output withheld: ${entry.withheld}. The process ran, but its output contains a recognized secret.]`
      : entry.ring.text(bytes)

  const snapshot = (entry: Entry): Info => ({
    id: entry.id,
    pid: entry.pid,
    title: entry.title,
    started: entry.started,
    processes: entry.processes,
    output: output(entry, RING_BYTES),
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
    entry.withheld ??= entry.inspection.finish()
    const info = snapshot(entry)
    yield* Deferred.succeed(entry.done, info).pipe(Effect.ignore)
    const text =
      status === "completed"
        ? `Background process "${entry.title}" exited with code ${exitCode ?? 0}.\n\n${output(entry, 4096)}`
        : `Background process "${entry.title}" failed: ${error ?? "unknown"}.\n\n${output(entry, 4096)}`
    if (Option.isSome(entry.sessions))
      yield* deliver(entry.sessions.value, SessionV2.ID.make(entry.sessionID), text).pipe(Effect.forkIn(scope))
    yield* retire(entry)
  })

  // Finished jobs stay readable until newer ones push them out; a job's scope closes once its process is gone.
  const retire = Effect.fnUntraced(function* (entry: Entry) {
    const finished = [...entries.values()].filter((item) => item.finished)
    finished.slice(0, Math.max(0, finished.length - FINISHED_KEPT)).forEach((item) => entries.delete(item.id))
    // Forked: the exit watcher that calls this runs inside the scope being closed.
    yield* Scope.close(entry.scope, Exit.void).pipe(Effect.forkIn(scope))
  })

  const cancelEntry = Effect.fn("SessionProcess.cancelEntry")(function* (entry: Entry) {
    if (entry.finished) return true
    entry.finished = true
    entry.status = "cancelled"
    entry.exitCode = null
    yield* entry.handle.kill().pipe(Effect.ignore)
    yield* Deferred.succeed(entry.done, snapshot(entry)).pipe(Effect.ignore)
    yield* retire(entry)
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
    const base =
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
    const command = input.prepare
      ? yield* input.prepare(base).pipe(
          Effect.provideService(Scope.Scope, procScope),
          Effect.tapError(() => Scope.close(procScope, Exit.void)),
        )
      : base
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
      inspection: OutputInspector.make(),
      scope: procScope,
      processes: [{ pid: Number(handle.pid), parentPid: null, name: null }],
      done,
      finished: false,
      status: "running",
      exitCode: null,
    }
    entries.set(id, entry)
    const reader = yield* Stream.runForEach(handle.all, (chunk) =>
      Effect.sync(() => {
        entry.withheld ??= entry.inspection.push(chunk)
        ring.write(chunk)
      }),
    ).pipe(Effect.ignore).pipe(Effect.forkIn(procScope))
    yield* Effect.gen(function* () {
      const code = yield* Effect.orElseSucceed(handle.exitCode, () => null)
      // The exit can land before the pipe drains; bounded because a grandchild may keep the pipe open.
      yield* Fiber.await(reader).pipe(Effect.timeout(DRAIN_TIMEOUT), Effect.ignore)
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
        output: output(entry, bytes),
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
    if (event.type !== "session.next.deleted") return Effect.void
    if (typeof data?.sessionID !== "string") return Effect.void
    return stopSession(data.sessionID).pipe(Effect.ignore)
  })
  yield* Effect.addFinalizer(() => off)

  return Service.of({ launch, list, get, wait, cancel, stopSession })
})

// A Session refuses a synthetic message while a turn runs; the notice waits for that turn to settle and tries again,
// so it reaches the agent at the next boundary instead of being dropped.
function deliver(sessions: SessionV2.Interface, sessionID: SessionV2.ID, text: string): Effect.Effect<void> {
  return sessions.synthetic({ sessionID, text, resume: true }).pipe(
    Effect.asVoid,
    Effect.catchTag("Session.BusyError", () =>
      sessions.wait(sessionID).pipe(Effect.andThen(Effect.suspend(() => deliver(sessions, sessionID, text)))),
    ),
    Effect.ignore,
  )
}

const layer = Layer.effect(Service, make)

export const node = makeGlobalNode({ service: Service, layer, deps: [AppProcess.node, EventV2.node] })
