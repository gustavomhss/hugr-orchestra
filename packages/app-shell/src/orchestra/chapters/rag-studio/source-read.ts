// The source read after Ask returns a span.
// A missing read (no span) is not a failure.
// A stale read (a newer ask or directory already replaced it) is not this request.
// A failed current read does not invent "Not recorded" and does not replace the previous source.
// The failure is reported and does not reject.

export function settleSourceRead<T>(input: {
  read: Promise<T> | undefined
  current: () => boolean
  apply: (value: T) => void
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

// Recorded is only a read that returned the source. A failed read is not "Not recorded".
export function sourceClaim(known: boolean, failed: boolean) {
  if (failed) return "failed" as const
  if (known) return "recorded" as const
  return "empty" as const
}
