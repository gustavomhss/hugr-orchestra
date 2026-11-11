# S1 native construction control — pinned source packet

These are captured source data, not evaluation answers or execution receipts.


## packages/core/src/session/input.ts lines 44–94

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d945b00cf43d03b923cc90d51970d47e2dd3a9c2`; complete-source SHA256 `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`.

```typescript
export class LifecycleConflict extends Schema.TaggedErrorClass<LifecycleConflict>()("SessionInput.LifecycleConflict", {
  id: SessionMessage.ID,
}) {}

export const admit = Effect.fn("SessionInput.admit")(function* (
  db: DatabaseService,
  events: EventV2.Interface,
  input: {
    readonly id: SessionMessage.ID
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly promptContext?: PromptContext.Info
    readonly delivery: Delivery
  },
) {
  const existing = yield* find(db, input.id)
  if (existing !== undefined) {
    if (!equivalent(existing, input)) return yield* Effect.die(new LifecycleConflict({ id: input.id }))
    return existing
  }
  const historical = yield* reconcileHistorical(db, input)
  if (historical !== undefined) return historical
  const timestamp = yield* DateTime.now
  return yield* events
    .publish(SessionEvent.PromptAdmitted, {
      messageID: input.id,
      sessionID: input.sessionID,
      timestamp,
      prompt: input.prompt,
      promptContext: input.promptContext,
      delivery: input.delivery,
    })
    .pipe(
      Effect.flatMap((event) =>
        event.durable === undefined
          ? Effect.die("Prompt admission event is missing aggregate sequence")
          : find(db, input.id).pipe(
              Effect.flatMap((stored) =>
                stored === undefined ? Effect.die("Prompt admission projection is missing") : Effect.succeed(stored),
              ),
            ),
      ),
      Effect.catchDefect((defect) =>
        find(db, input.id).pipe(
          Effect.flatMap((stored) =>
            stored && equivalent(stored, input) ? Effect.succeed(stored) : Effect.die(defect),
          ),
        ),
      ),
    )
})
```


## packages/core/src/session/input.ts lines 291–303

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `d945b00cf43d03b923cc90d51970d47e2dd3a9c2`; complete-source SHA256 `c5c418685f90aac45034890e2f8a2e2ee9787505e0134b9331a7edbb6be6e7bc`.

```typescript
export const equivalent = (
  input: Admitted,
  expected: {
    readonly sessionID: SessionSchema.ID
    readonly prompt: Prompt
    readonly delivery: Delivery
  },
) => input.delivery === expected.delivery && matchesPrompt(input, expected)

const matchesPrompt = (input: Admitted, expected: { readonly sessionID: SessionSchema.ID; readonly prompt: Prompt }) =>
  input.sessionID === expected.sessionID &&
  JSON.stringify(encodePrompt(input.prompt)) === JSON.stringify(encodePrompt(expected.prompt))

```


## packages/core/src/session.ts lines 491–521

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `402a192a69bcad6a4b08c695657e24ff5e335f93`; complete-source SHA256 `d8c38d46bc6b78ec23d7dae7525fa2ad4c4f07f3f6b5963248e0a0e96d1fbe58`.

```typescript
      prompt: Effect.fn("V2Session.prompt")((input) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const messageID = input.id ?? SessionMessage.ID.create()
            const notes = yield* restore(promptHooks({ ...input, id: messageID }))
            const prompt = resolvePrompt(input.prompt)
            const delivery = input.delivery ?? "steer"
            const expected = { sessionID: input.sessionID, messageID, prompt, delivery }
            const admitted = yield* SessionInput.admit(db, events, {
              id: messageID,
              sessionID: input.sessionID,
              prompt,
              ...(notes.length === 0 ? {} : { promptContext: { reminders: [...notes] } }),
              delivery,
            }).pipe(
              Effect.catchDefect((defect) =>
                defect instanceof SessionInput.LifecycleConflict
                  ? new PromptConflictError({ sessionID: input.sessionID, messageID })
                  : Effect.die(defect),
              ),
            )
            if (!SessionInput.equivalent(admitted, expected))
              return yield* new PromptConflictError({ sessionID: input.sessionID, messageID })
            if (input.resume !== false) yield* execution.wake(admitted.sessionID)
            return admitted
          }),
        ),
      ),
      fork: Effect.fn("V2Session.fork")(function* (input) {
        const source = yield* result.get(input.sessionID)
        const rows = yield* db
```


## packages/core/src/session/run-coordinator.ts lines 1–153

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `526a1e28f6027d744a95f145159be9cc59109ac2`; complete-source SHA256 `369d3e9a2f8769b363b50937c628a291dab3f874b6a2d5f31b9a307fbf349cfa`.

```typescript
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
```


## packages/core/src/session/execution/local.ts lines 1–57

Commit `1cde2ff7a71bcf7aecb5d030917b577165135d38`; Git blob `e7b758462abfd388f937fb18b79f82f2733dffad`; complete-source SHA256 `74621798a88cf5f9cb05306616d1896b752b4f4f001c3ae03bafc2e0b3910f97`.

```typescript
import { Cause, Effect, Layer } from "effect"
import { LocationServiceMap } from "../../location-service-map"
import { makeGlobalNode } from "../../effect/app-node"
import { SessionRunCoordinator } from "../run-coordinator"
import { SessionRunner } from "../runner"
import { SessionSchema } from "../schema"
import { SessionStore } from "../store"
import { SessionExecution } from "../execution"

/** Current-process routing for implicit-local Locations. Future remote placement belongs here. */
const layer = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionSchema.ID, SessionRunner.RunError>({
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) => runner.run({ sessionID, force })).pipe(
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as SessionRunner.RunError),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
        )
      }),
    })

    return SessionExecution.Service.of({
      active: coordinator.active,
      interrupt: coordinator.interrupt,
      resume: (sessionID, options) => coordinator.run(sessionID, options),
      wake: coordinator.wake,
      exclusive: coordinator.exclusive,
      withRunner: <A, E>(sessionID: SessionSchema.ID, use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          const session = yield* store.get(sessionID)
          if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
          return yield* SessionRunner.Service.use(use).pipe(
            Effect.provide(locations.get(session.location)),
            Effect.mapError((error) => error as E),
          )
        }) as Effect.Effect<A, E, never>,
    })
  }),
)

export const node = makeGlobalNode({
  service: SessionExecution.Service,
  layer,
  deps: [SessionStore.node, LocationServiceMap.node],
})

export * as SessionExecutionLocal from "./local"
```
