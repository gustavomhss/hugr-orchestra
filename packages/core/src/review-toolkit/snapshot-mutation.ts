import { Context, Effect } from "effect"

/** Scoped IO boundary for writes to a review snapshot, including their undo. */
export const Writer = Context.Reference<(file: string, content: string | Uint8Array) => Promise<void>>("@orchestra/ReviewSnapshot/Writer", {
  defaultValue: () => async (file, content) => { await Bun.write(file, content) },
})

export const writeSnapshot = Effect.fn("ReviewSnapshot.write")(function* (file: string, content: string | Uint8Array) {
  const writer = yield* Writer
  yield* Effect.promise(() => writer(file, content))
})

/** Fires when release has finished `undo`, not when kernel IO or the probe permit is released. Default does nothing. */
export const ReleaseObserver = Context.Reference<() => void>("@orchestra/ReviewSnapshot/ReleaseObserver", {
  defaultValue: () => () => {},
})

/** Await an in-flight copy write and install its undo before cancellation can release the probe's permit. */
export const withSnapshotMutation = <A, E, R, E2, R2>(
  change: Effect.Effect<void, E2, R2>,
  undo: Effect.Effect<void>,
  use: Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    change,
    () => use,
    () => Effect.gen(function* () {
      const observer = yield* ReleaseObserver
      // Negative control, do not apply: replace only the next line with
      // yield* Effect.forkDetach(undo, { startImmediately: true }).pipe(Effect.asVoid)
      yield* undo
      yield* Effect.sync(observer)
    }),
  )
