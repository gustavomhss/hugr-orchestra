export * as ReviewPRConcurrencyV2 from "./review-pr-concurrency"

import { Context, Effect, Semaphore } from "effect"
import { Tool } from "@orchestra/core/tool/tool"

const active = new Map<string, { semaphore: ReturnType<typeof Semaphore.makeUnsafe>; references: number }>()
/** Observes registered candidate admission, not entry into the semaphore wait queue. */
export const AdmissionObserver = Context.Reference<(event: { candidate: string; waiting: boolean }) => void>(
  "@orchestra/ReviewPRConcurrency/AdmissionObserver", { defaultValue: () => () => {} },
)

/** Process-local serialization; this does not claim clustered Session ownership. */
export function withCandidate<A, E, R>(candidate: string, work: (waited: boolean) => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.suspend(() => {
      const existing = active.get(candidate)
      if (!existing && active.size >= 64)
        return Effect.fail(new Tool.Failure({ message: "pr-busy: too many active PR candidates", metadata: { reason: "pr-busy" } }))
      const entry = existing ?? { semaphore: Semaphore.makeUnsafe(1), references: 0 }
      if (!existing) active.set(candidate, entry)
      entry.references += 1
      return Effect.succeed({ entry, waited: existing !== undefined })
    }),
    (held) => Effect.gen(function* () {
      const observer = yield* AdmissionObserver
      yield* Effect.sync(() => observer({ candidate, waiting: held.waited }))
      return yield* held.entry.semaphore.withPermit(Effect.suspend(() => work(held.waited)))
    }),
    (held) => Effect.sync(() => {
      held.entry.references -= 1
      if (held.entry.references === 0) active.delete(candidate)
    }),
  )
}
