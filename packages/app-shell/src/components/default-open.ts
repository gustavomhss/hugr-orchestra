// The default-server read when Servers, the home menu, or the status popover opens.
// A missing read is not a failure.
// A stale read (a newer open already replaced it) is not this request.
// A failed current read does not invent "no default" and does not replace a previous answer.
// The failure is reported and does not reject.

export function settleDefaultOpen<T>(input: {
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

// Known is only a read that settled. A failed read is not "no default".
export function defaultOpenClaim(known: boolean, failed: boolean) {
  if (failed) return "failed" as const
  if (!known) return "unknown" as const
  return "known" as const
}
