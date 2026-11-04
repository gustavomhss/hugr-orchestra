import { Context, Effect } from "effect"

/** Scoped IO boundary for writes to a review snapshot, including their undo. */
export const Writer = Context.Reference<(file: string, content: string | Uint8Array) => Promise<void>>("@orchestra/ReviewSnapshot/Writer", {
  defaultValue: () => async (file, content) => { await Bun.write(file, content) },
})

export const writeSnapshot = Effect.fn("ReviewSnapshot.write")(function* (file: string, content: string | Uint8Array) {
  const writer = yield* Writer
  yield* Effect.promise(() => writer(file, content))
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
    () => undo,
  )
