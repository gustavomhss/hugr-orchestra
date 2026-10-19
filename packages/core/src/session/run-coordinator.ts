export * as SessionRunCoordinator from "./run-coordinator"

import { Deferred, Effect, Exit, Fiber, FiberSet, Option, Scope } from "effect"

export type RunOptions = {
  /** Cancels only the active entry started by this waiter; joining never acquires ownership. */
  readonly interruptOnCancel?: boolean
}

/** Serializes execution for each key while allowing different keys to run concurrently. */
export interface Coordinator<Key, E> {
  /** Snapshots keys with an execution owned by this coordinator. */
  readonly active: Effect.Effect<ReadonlySet<Key>>
  /** Starts execution while idle or joins the active execution. */
  readonly run: (key: Key, options?: RunOptions) => Effect.Effect<void, E>
  /** Registers one coalesced follow-up after newly recorded work. */
  readonly wake: (key: Key) => Effect.Effect<void>
  /** Stops active execution and waits for its cleanup. */
  readonly interrupt: (key: Key) => Effect.Effect<void>
  /**
   * Runs `effect` as the key's active execution, so it never overlaps a drain: a wake meanwhile drains after it and an
   * interrupt stops it. With an active execution it returns `None` at once, or after that execution when `wait` is set.
   */
  readonly exclusive: <A, E2>(
    key: Key,
    effect: Effect.Effect<A, E2>,
    options?: { readonly wait?: boolean },
  ) => Effect.Effect<Option.Option<A>, E2>
}

type Entry<E> = {
  readonly done: Deferred.Deferred<void, E>
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

    const makeEntry = (): Entry<E> => ({
      done: Deferred.makeUnsafe<void, E>(),
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
      exclusiveOptions?: { readonly wait?: boolean },
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
        const next = makeEntry()
        active.set(key, next)
        const result = Deferred.makeUnsafe<A, E2>()
        // The caller hears the effect's own outcome; the entry only settles ownership, so it never fails.
        start(key, next, effect.pipe(Effect.onExit((exit) => Deferred.done(result, exit)), Effect.ignore))
        // An interrupt that lands before the effect starts settles only the entry.
        const stopped = Deferred.await(next.done).pipe(Effect.exit, Effect.andThen(Effect.interrupt))
        return restore(Effect.raceFirst(Deferred.await(result), stopped)).pipe(Effect.map(Option.some))
      })

    const stop = (key: Key, expected?: Entry<E>): Effect.Effect<void> =>
      Effect.suspend(() => {
        const entry = active.get(key)
        // The entry object is process-local ownership. A completed waiter's successor is a different owner.
        if (entry?.owner === undefined || (expected !== undefined && entry !== expected)) return Effect.void
        entry.stopping = true
        entry.pendingWake = false
        return Fiber.interrupt(entry.owner)
      })

    return {
      active: Effect.sync(() => new Set(active.keys())),
      run,
      wake,
      interrupt: (key) => stop(key),
      exclusive,
    }
  })
