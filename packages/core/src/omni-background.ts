export * as OmniBackground from "./omni-background"

// The background process registry of O1(b) (WP11), behind the frozen OmniAdoption.Registry seam. An adopted omni
// tree becomes a BackgroundJob of type "process" that runs until its tree is gone, the session ends, the instance is
// disposed or the user stops it. The job's run owns the tree: whatever ends the run (cancel, scope close, the tree's
// own end) stops the tree, bounded by STOP_GRACE_MS.
//
// The job carries `metadata.sessionID`, never `metadata.sessionId`: the session run state cancels every job whose
// `sessionId` names the session when the user presses Esc, and an adopted dev server must outlive the turn (R2-5).
// Session removal stops these jobs through stopSession(), wired by the host.

import { Effect } from "effect"
import type { BackgroundJob } from "./background-job"
import { Identifier } from "./id/id"
import type { Child } from "./omni"
import type { OmniAdoption } from "./omni-adoption"

export const TYPE = "process"
/** What the ring keeps of an adopted tree's output (R2-4). */
export const RING_BYTES = 1024 * 1024
/** What list() returns of the ring unless asked for more. */
export const TAIL_BYTES = 16 * 1024
export const STOP_GRACE_MS = 2000
const POLL_MS = 1000

export type ProcessInfo = { pid: number; parentPid: number | null; name: string | null }

export type Listed = {
  id: string
  pid: number
  title: string
  started: number
  processes: ProcessInfo[]
  output: string
  /** Bytes of output written since adoption began, including the ones the ring no longer holds. */
  written: number
}

/** Where the spawner's pump writes an adoptable child's output after the drain grace (R2-4). Never blocks. */
export interface Sink {
  readonly write: (data: string | Uint8Array) => void
}

/** The last `limit` bytes of a byte stream. */
export class Ring implements Sink {
  private chunks: Uint8Array[] = []
  private size = 0
  written = 0

  constructor(readonly limit = RING_BYTES) {}

  /** Bytes the ring holds now; never more than `limit`. */
  get held() {
    return this.size
  }

  write(data: string | Uint8Array) {
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data
    if (bytes.byteLength === 0) return
    this.written += bytes.byteLength
    // Copy: the pump may hand over a view of a buffer it reuses.
    const kept = bytes.byteLength > this.limit ? bytes.slice(bytes.byteLength - this.limit) : bytes.slice()
    this.chunks.push(kept)
    this.size += kept.byteLength
    while (this.size > this.limit) {
      const first = this.chunks[0]
      const excess = this.size - this.limit
      if (first.byteLength <= excess) {
        this.chunks.shift()
        this.size -= first.byteLength
        continue
      }
      this.chunks[0] = first.subarray(excess)
      this.size -= excess
    }
  }

  /** The last `bytes` bytes as text, starting at a character boundary. */
  text(bytes = this.limit) {
    const all = new Uint8Array(this.size)
    this.chunks.reduce((offset, chunk) => {
      all.set(chunk, offset)
      return offset + chunk.byteLength
    }, 0)
    const start = Math.max(0, this.size - bytes)
    // Skip UTF-8 continuation bytes, so a cut never starts with a replacement character.
    const boundary = all.subarray(start).findIndex((byte) => (byte & 0xc0) !== 0x80)
    return new TextDecoder().decode(all.subarray(boundary < 0 ? all.byteLength : start + boundary))
  }
}

const rings = new WeakMap<Child, Ring>()

/**
 * The output sink of a child that may still be adopted. The spawner's pump calls it once the drain grace has passed
 * and writes every later chunk into it; the ring is created on first use and handed to the registry if the child is
 * adopted. A child that is never adopted takes its ring with it when it is collected.
 */
export function sink(child: Child): Sink {
  return ring(child)
}

function ring(child: Child) {
  const existing = rings.get(child)
  if (existing) return existing
  const created = new Ring()
  rings.set(child, created)
  return created
}

export interface Interface extends OmniAdoption.Interface {
  /** The session's running adopted trees, each with its live processes and the last `tail` bytes of output. */
  readonly list: (sessionID: string, tail?: number) => Effect.Effect<Listed[]>
  /** Stops one adopted tree of the session; false when the session has no such running tree. */
  readonly stop: (sessionID: string, id: string) => Effect.Effect<boolean>
  /** Stops every adopted tree of the session (session removal). */
  readonly stopSession: (sessionID: string) => Effect.Effect<void>
}

type Entry = { child: Child; ring: Ring }

/** A registry over `jobs`. Job ids are unique, so one registry serves every instance the jobs service routes to. */
export function make(jobs: BackgroundJob.Interface, options: { pollMs?: number } = {}): Interface {
  const entries = new Map<string, Entry>()
  const pollMs = options.pollMs ?? POLL_MS

  const adopt = Effect.fnUntraced(function* (child: Child, input: OmniAdoption.RegisterInput) {
    // A tree that is already gone (killed by an abort, or it simply ended) is not worth a job.
    if ((yield* processes(child)).length === 0) {
      yield* stopChild(child)
      return
    }
    const id = Identifier.ascending("job")
    entries.set(id, { child, ring: ring(child) })
    yield* jobs
      .start({
        id,
        type: TYPE,
        title: input.title,
        metadata: { sessionID: input.sessionID, pid: child.pid },
        run: watch(child, pollMs).pipe(
          Effect.ensuring(
            stopChild(child).pipe(
              Effect.ensuring(input.finalize ?? Effect.void),
              Effect.ensuring(Effect.sync(() => entries.delete(id))),
            ),
          ),
          Effect.as(""),
        ),
      })
      .pipe(Effect.onError(() => Effect.sync(() => entries.delete(id))))
    yield* input.onAdopt ?? Effect.void
    yield* Effect.logInfo("omni adopted a background tree", { id, pid: child.pid, sessionID: input.sessionID })
  })

  // register() takes ownership: whatever goes wrong, the tree must not outlive this call unowned.
  const register: Interface["register"] = (child, input) =>
    adopt(child, input).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("omni could not adopt a tree; stopping it", { cause }).pipe(
          Effect.andThen(stopChild(child)),
          Effect.ensuring(input.finalize ?? Effect.void),
        ),
      ),
      Effect.withSpan("OmniBackground.register"),
    )

  const running = Effect.fnUntraced(function* (sessionID: string) {
    return (yield* jobs.list()).filter(
      (job) => job.type === TYPE && job.status === "running" && job.metadata?.sessionID === sessionID,
    )
  })

  const list: Interface["list"] = Effect.fn("OmniBackground.list")(function* (sessionID, tail = TAIL_BYTES) {
    const bytes = Math.max(0, Math.min(tail, RING_BYTES))
    return yield* Effect.forEach(
      yield* running(sessionID),
      (job) =>
        Effect.gen(function* () {
          const entry = entries.get(job.id)
          return {
            id: job.id,
            pid: typeof job.metadata?.pid === "number" ? job.metadata.pid : (entry?.child.pid ?? 0),
            title: job.title ?? "",
            started: job.started_at,
            processes: entry ? yield* processes(entry.child) : [],
            output: entry ? entry.ring.text(bytes) : "",
            written: entry?.ring.written ?? 0,
          }
        }),
      { concurrency: "unbounded" },
    )
  })

  const stop: Interface["stop"] = Effect.fn("OmniBackground.stop")(function* (sessionID, id) {
    if (!(yield* running(sessionID)).some((job) => job.id === id)) return false
    yield* jobs.cancel(id)
    return true
  })

  const stopSession: Interface["stopSession"] = Effect.fn("OmniBackground.stopSession")(function* (sessionID) {
    yield* Effect.forEach(yield* running(sessionID), (job) => jobs.cancel(job.id), {
      concurrency: "unbounded",
      discard: true,
    })
  })

  return { register, list, stop, stopSession }
}

/** Runs until the tree is gone. */
const watch = Effect.fnUntraced(function* (child: Child, pollMs: number) {
  while ((yield* processes(child)).length > 0) yield* Effect.sleep(pollMs)
})

function processes(child: Child) {
  return Effect.tryPromise(() => child.processes()).pipe(
    Effect.map((list): ProcessInfo[] =>
      list.map((item) => ({ pid: item.pid, parentPid: item.parentPid, name: item.name })),
    ),
    Effect.orElseSucceed((): ProcessInfo[] => []),
  )
}

function stopChild(child: Child) {
  return Effect.tryPromise(() => child.stop({ graceMs: STOP_GRACE_MS })).pipe(Effect.ignore, Effect.uninterruptible)
}
