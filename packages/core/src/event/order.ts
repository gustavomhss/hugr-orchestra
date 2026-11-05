export * as EventOrder from "./order"

import { Context, Deferred, Effect, Exit } from "effect"

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

// Aggregates whose delivery the current fiber is inside. A listener that publishes to such an aggregate notifies
// inline: waiting for the delivery that is running it would deadlock.
const Delivering = Context.Reference<ReadonlySet<string>>("@orchestra/Event/Delivering", {
  defaultValue: () => new Set(),
})

/** Per-aggregate notify order for one event service. Different aggregates never wait on each other. */
export function make() {
  const tails = new Map<string, Entry>()
  const entries = new WeakMap<Ticket, Entry>()

  const take = (aggregateID: string) =>
    Effect.gen(function* () {
      if ((yield* Delivering).has(aggregateID)) return undefined
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

  // Runs `notifying` once every earlier commit of the aggregate has been delivered, then releases the ticket on any
  // exit, including interruption, so a failed delivery never blocks the aggregate. Callers run it uninterruptibly
  // from the commit on and restore interruption only around this call.
  const deliver = <A>(ticket: Ticket | undefined, notifying: Effect.Effect<A>, restore: Restore) =>
    restore(
      Effect.gen(function* () {
        if (ticket?.prev) yield* Deferred.await(ticket.prev)
        const delivering = yield* Delivering
        return yield* (ticket
          ? notifying.pipe(Effect.provideService(Delivering, new Set(delivering).add(ticket.aggregateID)))
          : notifying)
      }),
    ).pipe(Effect.ensuring(release(ticket)))

  // Commits, then delivers in order. Uninterruptible from the commit on, so a ticket taken at commit is always
  // released; only the wait and the listeners are interruptible. Returns undefined when nothing was committed.
  const commit = <C extends { readonly ticket: Ticket | undefined }, A>(
    committing: Effect.Effect<C | undefined>,
    notifying: (committed: C) => Effect.Effect<A>,
  ) =>
    Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const committed = yield* committing
        if (!committed) return undefined
        return yield* deliver(committed.ticket, notifying(committed), restore)
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
