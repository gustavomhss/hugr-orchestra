// A hotkey change the user asked for, and the reload that follows it.
// A missing seat is not a failure. A stale request (a newer one already replaced it) is not this request.
// A failed current write does not pretend the keys changed. A failed current read does not replace the list.
// A returned refusal (conflict or invalid) is the answer, not a transport failure.
// Either failure is reported and does not reject.

export function settleHotkeyWrite<T>(input: {
  write: Promise<T> | undefined
  current: () => boolean
  apply: (value: T) => void
  report: (error: unknown) => void
}) {
  return settle(input.write, input.current, input.apply, input.report)
}

export function settleHotkeyRead<T>(input: {
  read: Promise<T> | undefined
  current: () => boolean
  apply: (value: T) => void
  report: (error: unknown) => void
}) {
  return settle(input.read, input.current, input.apply, input.report)
}

function settle<T>(
  work: Promise<T> | undefined,
  current: () => boolean,
  apply: (value: T) => void,
  report: (error: unknown) => void,
) {
  if (!work) return Promise.resolve(false)
  return work.then(
    (value) => {
      if (!current()) return false
      apply(value)
      return true
    },
    (error: unknown) => {
      if (!current()) return false
      report(error)
      return false
    },
  )
}
