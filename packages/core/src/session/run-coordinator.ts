export * as SessionRunCoordinator from "./run-coordinator"

import { Deferred, Effect, Exit, Fiber, FiberSet, Option, Scope } from "effect"

export type InterruptOptions = {
  /**
   * Drops the wake recorded while the interrupted execution ran. By default that wake survives: it reports durable
   * work admitted after the drain began, and nothing else would promote it once the Session goes idle.
   */
  readonly discardPending?: boolean
}

export type RunOptions = {
  /** Cancels only the active entry started by this waiter; joining never acquires ownership. */
  readonly interruptOnCancel?: boolean
}

export type ExclusiveOptions = {
  readonly wait?: boolean
  /** Opt-in discards wakes during this exclusive operation; the default retains them. */
  readonly discardPending?: boolean
}

/** Serializes execution for each key while allowing different keys to run concurrently. */
export interface Coordinator<Key, E> {
  /** Snapshots keys with an execution owned by this coordinator. */
  readonly active: Effect.Effect<ReadonlySet<Key>>
  /** Starts execution while idle or joins the active execution. */
  readonly run: (key: Key, options?: RunOptions) => Effect.Effect<void, E>
  /** Registers one coalesced follow-up after newly recorded work. */
  readonly wake: (key: Key) => Effect.Effect<void>
  /** Stops active execution and waits for its cleanup. A wake recorded meanwhile still runs one follow-up. */
  readonly interrupt: (key: Key, options?: InterruptOptions) => Effect.Effect<void>
  /**
   * Runs `effect` as the key's active execution, so it never overlaps a drain: a wake meanwhile drains after it unless
   * `discardPending` is set, and an interrupt stops it. When busy it returns `None`, or waits when `wait` is set.
   */
  readonly exclusive: <A, E2>(
    key: Key,
    effect: Effect.Effect<A, E2>,
    options?: ExclusiveOptions,
  ) => Effect.Effect<Option.Option<A>, E2>
}

type Entry<E> = {
  readonly done: Deferred.Deferred<void, E>
  readonly discardPending: boolean
  owner?: Fiber.Fiber<void, never>
  pendingWake: boolean
  stopping: boolean
}

export const make = <Key, E>(options: {
  readonly drain: (key: Key, force: boolean) => Effect.Effect<void, E>
}): Effect.Effect<Coordinator<Key, E>, never, Scope.Scope> =>
  Effect.gen(function* () {
    const active = new Map<Key, Entry<E>>()
    const fork = yield* FiberSet.makeRuntime<never, void, never>()

    const drain = (key: Key, force: boolean) => Effect.suspend(() => options.drain(key, force))

    const makeEntry = (discardPending = false): Entry<E> => ({
      done: Deferred.makeUnsafe<void, E>(),
      discardPending,
      pendingWake: false,
      stopping: false,
    })

    const start = (key: Key, entry: Entry<E>, work: Effect.Effect<void, E>, successor = false) => {
      const ready = Deferred.makeUnsafe<void>()
      const owner = fork(
        (successor ? Effect.yieldNow : Deferred.await(ready)).pipe(
          Effect.andThen(work),
          Effect.onExit((exit) => Effect.sync(() => settle(key, entry, exit))),
          Effect.exit,
          Effect.asVoid,
        ),
      )
      entry.owner = owner
      if (!successor) Deferred.doneUnsafe(ready, Effect.void)
      return owner
    }

    const settle = (key: Key, entry: Entry<E>, exit: Exit.Exit<void, E>) => {
      if (Exit.isSuccess(exit) && !entry.stopping && entry.pendingWake) {
        entry.pendingWake = false
        start(key, entry, drain(key, false), true)
        return
      }

      const successor = entry.pendingWake ? makeEntry() : undefined
      if (successor === undefined) active.delete(key)
      else {
        active.set(key, successor)
        start(key, successor, drain(key, false), true)
      }
      Deferred.doneUnsafe(entry.done, exit)
    }

    const run = (key: Key, runOptions?: RunOptions): Effect.Effect<void, E> =>
      Effect.uninterruptibleMask((restore) => {
        const entry = active.get(key)
        if (entry !== undefined) {
          if (entry.stopping) return restore(Deferred.await(entry.done).pipe(Effect.andThen(run(key, runOptions))))
          return restore(Deferred.await(entry.done))
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, drain(key, true))
        return restore(Deferred.await(next.done)).pipe(
          Effect.onInterrupt(() => runOptions?.interruptOnCancel ? stop(key, next) : Effect.void),
        )
      })

    const wake = (key: Key) =>
      Effect.sync(() => {
        const entry = active.get(key)
        if (entry !== undefined) {
          if (entry.discardPending) return
          entry.pendingWake = true
          return
        }

        const next = makeEntry()
        active.set(key, next)
        start(key, next, drain(key, false))
      })

    const exclusive = <A, E2>(
      key: Key,
      effect: Effect.Effect<A, E2>,
      exclusiveOptions?: ExclusiveOptions,
    ): Effect.Effect<Option.Option<A>, E2> =>
      Effect.uninterruptibleMask((restore) => {
        const entry = active.get(key)
        if (entry !== undefined) {
          if (!exclusiveOptions?.wait) return Effect.succeedNone
          return restore(Deferred.await(entry.done)).pipe(
            Effect.exit,
            Effect.andThen(exclusive(key, effect, exclusiveOptions)),
          )
        }
        const next = makeEntry(exclusiveOptions?.discardPending ?? false)
        active.set(key, next)
        const result = Deferred.makeUnsafe<A, E2>()
        // The caller hears the effect's own outcome; the entry only settles ownership, so it never fails.
        const owner = start(key, next, effect.pipe(Effect.onExit((exit) => Deferred.done(result, exit)), Effect.ignore))
        // Join this owner, not its entry: a pending wake can reuse the entry for a held successor drain.
        return restore(Fiber.await(owner)).pipe(
          Effect.andThen(Deferred.isDone(result)),
          // An interrupt before work starts completes the owner without publishing a result.
          Effect.flatMap((done) => done ? Deferred.await(result) : Effect.interrupt),
          Effect.map(Option.some),
        )
      })

    const stop = (key: Key, expected?: Entry<E>, stopOptions?: InterruptOptions): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        // The entry object is process-local ownership. A completed waiter's successor is a different owner.
        if (entry?.owner === undefined || (expected !== undefined && entry !== expected)) return Effect.void
        entry.stopping = true
        // Interrupting drops the drain, not the inbox: a wake recorded meanwhile promotes at the follow-up, as a wake
        // registered during cleanup already does.
        if (stopOptions?.discardPending) entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return {
      active: Effect.sync(() => new Set(active.keys())),
      run,
      wake,
      interrupt: (key, interruptOptions) => stop(key, undefined, interruptOptions),
      exclusive,
    }
  })
