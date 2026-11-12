export * as EventOrder from "./order"

import { Context, Deferred, Effect, Exit } from "effect"
import type * as Scope from "effect/Scope"

/**
 * Notification turn for one committed durable event. Tickets of an aggregate are taken inside the commit
 * transaction, so their order is the commit order; `prev` is the ticket whose delivery must finish first.
 */
export interface Ticket {
  readonly aggregateID: string
  readonly prev: Deferred.Deferred<void> | undefined
  readonly done: Deferred.Deferred<void>
}

type Entry = { ticket: Ticket; released: boolean; next?: Entry }

type Restore = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

// Aggregates whose notification the current fiber is executing. Reentrant publications take normal tickets,
// but hand delivery to the service scope so they do not wait for the listener that is publishing them.
const Delivering = Context.Reference<ReadonlySet<string>>("@orchestra/Event/Delivering", {
  defaultValue: () => new Set(),
})

const DeferNotifications = Context.Reference<boolean>("@orchestra/Event/DeferNotifications", {
  defaultValue: () => false,
})

/** Commit durable events and register their ordered delivery without waiting for arbitrary listeners. */
export const deferNotifications = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, DeferNotifications, true)

/** Per-aggregate notify order for one event service. Different aggregates never wait on each other. */
export function make(scope: Scope.Scope) {
  const tails = new Map<string, Entry>()
  const entries = new WeakMap<Ticket, Entry>()

  const take = (aggregateID: string) =>
    Effect.gen(function* () {
      const done = yield* Deferred.make<void>()
      const tail = tails.get(aggregateID)
      const ticket: Ticket = { aggregateID, prev: tail?.ticket.done, done }
      const entry: Entry = { ticket, released: false }
      if (tail) tail.next = entry
      tails.set(aggregateID, entry)
      entries.set(ticket, entry)
      return ticket
    })

  const release = (ticket: Ticket | undefined) =>
    Effect.gen(function* () {
      if (!ticket) return
      const entry = entries.get(ticket)
      if (!entry) return
      entry.released = true
      if (ticket.prev && !(yield* Deferred.isDone(ticket.prev))) return
      let current: Entry | undefined = entry
      while (current?.released) {
        yield* Deferred.succeed(current.ticket.done, undefined)
        entries.delete(current.ticket)
        if (tails.get(current.ticket.aggregateID) === current) tails.delete(current.ticket.aggregateID)
        current = current.next
      }
    })

  // Waits for the actual predecessor and releases on every exit. Only the wait and notification
  // are interruptible. Explicitly deferred and reentrant delivery belongs to the event service's scope.
  const deliver = (ticket: Ticket | undefined, notifying: Effect.Effect<void>, restore: Restore) =>
    Effect.gen(function* () {
      const run = restore(
        Effect.gen(function* () {
          if (ticket?.prev) yield* Deferred.await(ticket.prev)
          const delivering = yield* Delivering
          yield* (ticket
            ? notifying.pipe(Effect.provideService(Delivering, new Set(delivering).add(ticket.aggregateID)))
            : notifying)
        }),
      ).pipe(Effect.ensuring(release(ticket)))

      if (ticket && ((yield* Delivering).has(ticket.aggregateID) || (yield* DeferNotifications))) {
        yield* run.pipe(
          Effect.provideService(Delivering, new Set<string>()),
          Effect.provideService(DeferNotifications, false),
          Effect.forkIn(scope, { startImmediately: true }),
        )
        return
      }
      yield* run
    })

  // Keep commit and worker registration masked; only the wait and notification restore interruption.
  // Deferred and reentrant calls acknowledge commit and scheduling; ordinary calls await their own notification.
  const commit = <C extends { readonly ticket: Ticket | undefined }, A>(
    committing: Effect.Effect<C | undefined>,
    prepare: (committed: C) => {
      readonly value: A
      readonly notifying: Effect.Effect<void>
    },
  ) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const committed = yield* committing
        if (!committed) return undefined
        const prepared = prepare(committed)
        yield* deliver(committed.ticket, prepared.notifying, restore)
        return prepared.value
      }),
    )

  // Pipe a commit transaction through this when its body takes a ticket as the last step: a commit that then fails
  // would otherwise leave the ticket blocking its successors forever.
  const guard =
    (box: { readonly ticket?: Ticket }) =>
    <A, E, R>(transaction: Effect.Effect<A, E, R>) =>
      transaction.pipe(Effect.onExit((exit) => (Exit.isFailure(exit) ? release(box.ticket) : Effect.void)))

  return { take, release, deliver, commit, guard }
}
