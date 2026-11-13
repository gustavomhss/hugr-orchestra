// The session search when the person types in the command palette.
// A missing search is not a failure.
// A stale search (a newer query already replaced it) is not this request.
// A failed current search does not invent "no results" and does not replace a previous list.
// The failure is reported and does not reject.

export function settleSessionSearch<T>(input: {
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
