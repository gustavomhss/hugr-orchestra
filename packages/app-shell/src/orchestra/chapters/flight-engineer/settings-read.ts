// The settings and speech-to-text key read when Flight Engineer settings open.
// A missing seat is not a failure. A stale read (a newer one already replaced it) is not this request.
// A failed current read does not invent a value and does not replace the previous one.
// A key the read has not confirmed is not saved.
// The failure is reported and does not reject.

export function settleSettingsRead<T>(input: {
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

export function savedKeyShown(saved: boolean | undefined) {
  return saved === true
}
