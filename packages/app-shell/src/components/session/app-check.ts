// Whether an app is installed, read when the open menu is built.
// A missing check is not a failure. A stale check (a newer list already replaced it) is not this request.
// A failed current check does not invent "not installed" and does not replace a previous answer.
// The failure is reported and does not reject.

export function settleAppCheck(input: {
  read: Promise<boolean> | undefined
  current: () => boolean
  apply: (value: boolean) => void
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

// Present is only a check that confirmed the app. Unknown is not installed.
export function appPresent(value: boolean | undefined) {
  return value === true
}
