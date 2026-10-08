export * as ToolkitInstall from "./install"

import { Effect, Fiber } from "effect"
import { PinnedArtifact } from "../pinned-artifact"

// Shared with BackendToolkit: failures retry after five minutes, or after an external install completes.
const RETRY_MS = 5 * 60_000

type Attempt = {
  running?: Fiber.Fiber<string | undefined>
  readonly failed?: string
  readonly at: number
  users: number
  closing?: boolean
}

const attempts = new Map<string, Attempt>()

export const attempt = (directory: string) => attempts.get(directory)

/** One installation per directory. Interrupted waiters leave other users' work alive. */
export const once = Effect.fn("ToolkitInstall.once")(function* (
  directory: string,
  work: Effect.Effect<unknown, PinnedArtifact.Failed>,
): Effect.fn.Return<string | undefined> {
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const previous = attempts.get(directory)
      if (previous?.closing && previous.running) {
        yield* restore(Fiber.await(previous.running))
        return yield* restore(once(directory, work))
      }
      if (previous?.failed && Date.now() - previous.at < RETRY_MS && !(yield* restore(PinnedArtifact.installed(directory))))
        return previous.failed
      const current = attempts.get(directory)
      const entry: Attempt = current?.running ? current : { at: Date.now(), users: 0 }
      if (!entry.running) {
        // Publish before starting: synchronous completion must not leave a phantom running entry.
        attempts.set(directory, entry)
        entry.running = Effect.runFork(
          work.pipe(
            Effect.match({
              onSuccess: () => undefined,
              onFailure: (error) => {
                attempts.set(directory, { failed: error.cause, at: Date.now(), users: 0 })
                return error.cause
              },
            }),
            Effect.ensuring(Effect.sync(() => {
              if (attempts.get(directory) === entry) attempts.delete(directory)
            })),
          ),
        )
      }
      const running = entry.running
      entry.users++
      return yield* restore(Fiber.join(running)).pipe(
        Effect.ensuring(Effect.suspend(() => {
          entry.users--
          if (entry.users !== 0 || attempts.get(directory) !== entry) return Effect.void
          // Keep the entry until staging cleanup finishes; new users wait before retrying.
          entry.closing = true
          return Fiber.interrupt(running)
        })),
      )
    }),
  )
})
