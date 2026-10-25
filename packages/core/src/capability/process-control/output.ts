export * as CapabilityProcessOutput from "./output"

import { Effect } from "effect"
import type { CapabilityProcessContract } from "./contract"

/**
 * Bounded byte ring over an append-only stream. Offsets are absolute since start; only the last
 * `capacity` bytes stay readable. Reads cut on UTF-8 sequence boundaries so `text` never splits a
 * valid character; bytes the process emitted as invalid UTF-8 decode as U+FFFD.
 * `append` after `end()` is ignored: late pipe data after settlement must not move the window.
 */
export function make(options: { capacity: number }): CapabilityProcessContract.Buffer {
  const ring = new Uint8Array(options.capacity)
  const waiters = new Set<{ cursor: number; wake: () => void }>()
  // ignoreBOM keeps U+FEFF that a chunk happens to start with; it is process output, not a marker.
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true })
  const state = { total: 0, ended: false }
  const retained = () => Math.max(0, state.total - options.capacity)
  const at = (offset: number) => ring[offset % options.capacity]

  const wake = () =>
    [...waiters]
      .filter((waiter) => ready(waiter.cursor))
      .forEach((waiter) => {
        waiters.delete(waiter)
        waiter.wake()
      })

  // Waiters wake only when a read would return a whole unit, so a partial character never spins a reader.
  const ready = (cursor: number) => {
    if (state.ended) return true
    const start = align(Math.max(Math.min(cursor, state.total), retained()))
    return start < state.total && unit(start) !== undefined
  }

  // Advances a start that falls inside a sequence to the next unit boundary.
  const align = (offset: number) => {
    if (offset >= state.total || !continuation(at(offset))) return offset
    const lead = [1, 2, 3].map((back) => offset - back).find((q) => q < retained() || !continuation(at(q)))
    // Three continuation bytes behind: offset is an orphan byte of invalid output, already a boundary.
    if (lead === undefined || lead < 0) return offset
    // Lead byte was evicted: drop the remaining continuation bytes of that unit.
    if (lead < retained()) return skip(offset, retained() + 3)
    if (width(at(lead)) <= offset - lead) return offset
    return skip(offset, lead + width(at(lead)))
  }
  const skip = (offset: number, limit: number) => {
    const bound = Math.min(limit, state.total)
    let next = offset
    while (next < bound && continuation(at(next))) next++
    return next
  }
  // End of the unit starting at offset, or undefined when the stream may still complete it.
  const unit = (offset: number) => {
    const end = skip(offset + 1, offset + width(at(offset)))
    if (end < offset + width(at(offset)) && end === state.total && !state.ended) return undefined
    return end
  }

  const bytes = (start: number, end: number) => {
    const from = start % options.capacity
    if (from + end - start <= options.capacity) return ring.subarray(from, from + end - start)
    const out = new Uint8Array(end - start)
    out.set(ring.subarray(from))
    out.set(ring.subarray(0, end - start - (options.capacity - from)), options.capacity - from)
    return out
  }

  return {
    append: (input) => {
      if (state.ended || input.length === 0) return
      const kept = input.subarray(Math.max(0, input.length - options.capacity))
      const offset = state.total + input.length - kept.length
      const from = offset % options.capacity
      const head = Math.min(kept.length, options.capacity - from)
      ring.set(kept.subarray(0, head), from)
      ring.set(kept.subarray(head), 0)
      state.total += input.length
      wake()
    },
    end: () => {
      state.ended = true
      wake()
    },
    window: () => ({ retainedStart: retained(), end: state.total, eof: state.ended }),
    read: (cursor, maxBytes) => {
      const requested = Math.min(cursor ?? retained(), state.total)
      const start = align(Math.max(requested, retained()))
      const end = scan(start, maxBytes)
      return {
        start,
        end,
        text: decoder.decode(bytes(start, end)),
        ...(start > requested ? { lost: { from: requested, to: start } } : {}),
        eof: state.ended && end === state.total,
      }
    },
    changed: (cursor) =>
      Effect.callback<void>((resume) => {
        if (ready(cursor)) return resume(Effect.void)
        const waiter = { cursor, wake: () => resume(Effect.void) }
        waiters.add(waiter)
        return Effect.sync(() => waiters.delete(waiter))
      }),
  }

  // Whole units up to maxBytes; the first unit is always taken so a tiny maxBytes still progresses.
  function scan(start: number, maxBytes: number) {
    let offset = start
    while (offset < state.total) {
      const next = unit(offset)
      if (next === undefined || (next - start > maxBytes && offset > start)) return offset
      offset = next
    }
    return offset
  }
}

const continuation = (byte: number) => (byte & 0xc0) === 0x80

const width = (lead: number) => {
  if (lead >= 0xc2 && lead <= 0xdf) return 2
  if (lead >= 0xe0 && lead <= 0xef) return 3
  if (lead >= 0xf0 && lead <= 0xf4) return 4
  return 1
}
