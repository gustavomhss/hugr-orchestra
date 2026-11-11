// Content protection the user asked to change, and the read when Flight Engineer opens.
// A missing seat is not a failure. A stale request (a newer one already replaced it) is not this request.
// A failed current write does not move the switch. A failed current read does not invent a value.
// Either failure is reported and does not reject.

export function settleProtectionWrite(input: {
  write: Promise<void> | undefined
  current: () => boolean
  apply: () => void
  report: (error: unknown) => void
}) {
  return settle(input.write, input.current, () => input.apply(), input.report)
}

export function settleProtectionRead<T>(input: {
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
