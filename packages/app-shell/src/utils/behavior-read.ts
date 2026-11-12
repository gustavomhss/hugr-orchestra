// The behavior read when Plugins opens a profile.
// A missing read is not a failure.
// A stale read (a newer profile already replaced it) is not this request.
// A failed current read does not invent "nothing saved" and does not replace a previous set.
// The failure is reported and does not reject.

export function settleBehaviorRead<T>(input: {
  read: Promise<T | null> | undefined
  current: () => boolean
  apply: (value: T | null) => void
  report: (error: unknown) => void
}) {
  if (!input.read) return Promise.resolve(false)
  return input.read.then(
    (value) => {
      if (!input.current()) return false
      input.apply(value)
      return true
    },
    (error: unknown) => {
      if (!input.current()) return false
      input.report(error)
      return false
    },
  )
}

// Ready is only a read that settled. A failed read is not the default set.
export function behaviorClaim(known: boolean, failed: boolean) {
  if (failed) return "failed" as const
  if (!known) return "unknown" as const
  return "ready" as const
}
