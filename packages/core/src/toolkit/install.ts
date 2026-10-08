export * as ToolkitInstall from "./install"

import path from "path"
import { Effect, Fiber } from "effect"
import { PinnedArtifact } from "../pinned-artifact"

// Shared with BackendToolkit: failures retry after five minutes, or after an external install completes.
const RETRY_MS = 5 * 60_000

type Attempt = {
  running?: Fiber.Fiber<string | undefined>
  readonly failed?: string
  readonly at: number
}

const attempts = new Map<string, Attempt>()

export const attempt = (directory: string) => attempts.get(path.resolve(directory))

/**
 * One installation per directory. Interruption cancels a caller's wait, not the shared install, matching
 * BackendToolkit's original once semantics. PinnedArtifact's transport/extractor promises are not abortable:
 * keep the install (and its concurrency permit) alive until atomic completion instead of orphaning its work.
 */
export const once = Effect.fn("ToolkitInstall.once")(function* (
  installDirectory: string,
  work: Effect.Effect<unknown, PinnedArtifact.Failed>,
) {
  const directory = path.resolve(installDirectory)
  return yield* Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      const previous = attempts.get(directory)
      if (previous?.failed && Date.now() - previous.at < RETRY_MS && !(yield* restore(PinnedArtifact.installed(directory))))
        return previous.failed
      const current = attempts.get(directory)
      const entry: Attempt = current?.running ? current : { at: Date.now() }
      if (!entry.running) {
        // Publish before starting: synchronous completion must not leave a phantom running entry.
        attempts.set(directory, entry)
        entry.running = Effect.runFork(
          work.pipe(
            Effect.match({
              onSuccess: () => undefined,
              onFailure: (error) => {
                attempts.set(directory, { failed: error.cause, at: Date.now() })
                return error.cause
              },
            }),
            Effect.ensuring(
              Effect.sync(() => {
                if (attempts.get(directory) === entry) attempts.delete(directory)
              }),
            ),
          ),
        )
      }
      return yield* restore(Fiber.join(entry.running))
    }),
  )
})
