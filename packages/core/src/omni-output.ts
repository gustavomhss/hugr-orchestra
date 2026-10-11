// The host side of one omni child's output (integration plan D-L5, D-L6, R2-1, R2-4): the pump that moves omni's
// items into two host queues, the readers, the HIGH_WATER backpressure and the drain grace. omni-spawner.ts wires
// it to a spawned child; see its header for the whole design.

import { Cause, Effect, Stream } from "effect"
import type * as Arr from "effect/Array"
import * as PlatformError from "effect/PlatformError"
import { toError } from "./child-process-common"
import { OmniBackground } from "./omni-background"

/** After the root exits, how long descendants may hold the output open before the host streams end (D-L6). */
export const DRAIN_GRACE_MS = 2_000
/** Host-side bytes per stream nobody took yet; above it the pump stops pulling and omni's backpressure takes over. */
const HIGH_WATER = 8 * 1024 * 1024

export type Kind = "stdout" | "stderr"
export type Item = { stream: "stdout" | "stderr" | "pty"; data: Uint8Array; lostBefore?: number }

/**
 * The host side of one child's output: the pump, the two queues, the readers and the drain grace. Plain JS, driven
 * by omni's promises; readers wait on it through Effect callbacks.
 */
export function drain(
  source: AsyncIterator<Item>,
  input: {
    policy: "fail" | "marker"
    /** Where output goes once the host streams ended, while the tree may still be adopted (R2-4). */
    overflow?: () => OmniBackground.Sink
    ignored: Record<Kind, boolean>
    gap: (stream: Kind, bytes: number) => void
    ended: () => void
  },
) {
  let seq = 0
  let ended = false
  let discard = false
  let spill: OmniBackground.Sink | undefined
  let halted = false
  let paused: (() => void) | undefined
  let graceDue = false
  let grace: ReturnType<typeof setTimeout> | undefined
  const queues = {
    stdout: { items: [] as { seq: number; data: Uint8Array }[], bytes: 0 },
    stderr: { items: [] as { seq: number; data: Uint8Array }[], bytes: 0 },
  }
  const failed: Partial<Record<Kind, PlatformError.PlatformError>> = {}
  const subscribed = { stdout: false, stderr: false }
  const waiters = new Set<() => void>()
  const wake = () => [...waiters].forEach((waiter) => waiter())
  const full = () => (["stdout", "stderr"] as const).filter((key) => queues[key].bytes >= HIGH_WATER)

  void (async () => {
    try {
      for (;;) {
        if (!discard && full().length > 0) {
          if (halted) expire(true)
          else await new Promise<void>((resume) => (paused = resume))
        }
        const next = await source.next()
        if (next.done) break
        push(next.value)
      }
    } catch (err) {
      const error = systemError("Unknown", "output", `reading the output failed: ${toError(err).message}`, err)
      for (const key of ["stdout", "stderr"] as const) failed[key] ??= error
    }
    finish()
  })()

  function push(item: Item) {
    if (discard) {
      spill?.write(item.data)
      return
    }
    const key: Kind = item.stream === "stderr" ? "stderr" : "stdout"
    if (input.ignored[key] || failed[key]) return
    if (item.lostBefore) {
      input.gap(key, item.lostBefore)
      if (input.policy === "fail") {
        failed[key] = systemError("InvalidData", `fromOmni(${key})`, `${item.lostBefore} bytes of ${key} were lost`)
        return wake()
      }
      enqueue(key, new TextEncoder().encode(`\n[omni: ${item.lostBefore} bytes of ${key} were lost here]\n`))
    }
    if (item.data.length > 0) enqueue(key, item.data)
    wake()
  }

  function enqueue(key: Kind, data: Uint8Array) {
    queues[key].items.push({ seq: seq++, data })
    queues[key].bytes += data.length
  }

  function finish() {
    if (ended) return
    ended = true
    clearTimeout(grace)
    discard = true
    wake()
    input.ended()
  }

  // The grace ran out: the host streams end. A queue the pump had stopped for still had data in omni, so that
  // stream fails rather than end short. A slow reader that subscribed postpones the grace until it catches up.
  function expire(force: boolean) {
    if (ended) return
    if (!force && paused && full().every((key) => subscribed[key])) {
      graceDue = true
      return
    }
    // A stalled pump left output in omni that no reader will get: every stream fails instead of ending short.
    if (paused || force)
      for (const key of ["stdout", "stderr"] as const)
        failed[key] ??= systemError(
          "BadResource",
          `fromOmni(${key})`,
          `${key} was not read before the drain grace ended`,
        )
    if (!force) spill = input.overflow?.()
    resume()
    finish()
  }

  function resume() {
    const wakeup = paused
    paused = undefined
    wakeup?.()
    if (graceDue) {
      graceDue = false
      arm()
    }
  }

  function arm() {
    clearTimeout(grace)
    if (!ended) grace = setTimeout(() => expire(false), DRAIN_GRACE_MS)
  }

  function take(kinds: readonly Kind[]) {
    const lists = kinds.map((key) => queues[key].items)
    const batch =
      lists.length === 1
        ? (lists[0] ?? []).map((item) => item.data)
        : [...(lists[0] ?? []), ...(lists[1] ?? [])].toSorted((a, b) => a.seq - b.seq).map((item) => item.data)
    for (const key of kinds) queues[key] = { items: [], bytes: 0 }
    if (paused && full().length === 0) resume()
    return batch
  }

  const pull = (kinds: readonly Kind[]) =>
    Effect.callback<Arr.NonEmptyReadonlyArray<Uint8Array>, PlatformError.PlatformError | Cause.Done>((done) => {
      const attempt = () => {
        const [head, ...rest] = take(kinds)
        const error = kinds.map((key) => failed[key]).find((x) => x !== undefined)
        const result =
          head !== undefined
            ? Effect.succeed<Arr.NonEmptyReadonlyArray<Uint8Array>>([head, ...rest])
            : error
              ? Effect.fail(error)
              : ended
                ? Cause.done()
                : undefined
        if (result) done(result)
        return result !== undefined
      }
      if (attempt()) return undefined
      const waiter = () => {
        if (attempt()) waiters.delete(waiter)
      }
      waiters.add(waiter)
      return Effect.sync(() => waiters.delete(waiter))
    })

  return {
    stream: (kinds: readonly Kind[]): Stream.Stream<Uint8Array, PlatformError.PlatformError> =>
      Stream.fromPull(
        Effect.sync(() => {
          for (const key of kinds) subscribed[key] = true
          return pull(kinds)
        }),
      ),
    rootExited: () => arm(),
    /** The tree was stopped: nothing will read faster any more, so a stalled pump ends the streams now. */
    halt: () => {
      halted = true
      if (paused) expire(true)
    },
    /**
     * The spawn scope closed: readers are gone and the pump never blocks the child from now on. An adopted tree's
     * output goes to the registry's ring; any other is discarded.
     */
    close: (adopted: boolean) => {
      spill = adopted ? (spill ?? input.overflow?.()) : undefined
      resume()
      finish()
    },
  }
}

function systemError(tag: PlatformError.SystemErrorTag, method: string, description: string, cause?: unknown) {
  return PlatformError.systemError({ _tag: tag, module: "ChildProcess", method, description, cause })
}
