// The run-state read when Flight Engineer opens, and a stop the user asked for.
// A missing seat is not a failure. A stale request (a newer one already replaced it) is not this request.
// A failed current read does not invent stopped and does not replace the previous state.
// A failed current stop does not pretend the meeting stopped.
// Either failure is reported and does not reject.

export function settleRunRead<T>(input: {
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

export function settleRunStop(input: {
  write: Promise<void> | undefined
  current: () => boolean
  clear: () => void
  report: (error: unknown) => void
}) {
  if (!input.write) return Promise.resolve(false)
  return input.write.then(
    () => {
      if (!input.current()) return false
      input.clear()
      return true
    },
    (error: unknown) => {
      if (!input.current()) return false
      input.report(error)
      return false
    },
  )
}

// Idle is only a read or event that confirmed the meeting is stopped. Unknown is not idle.
export function runClaim(known: boolean, running: boolean) {
  if (!known) return "unknown" as const
  if (running) return "running" as const
  return "idle" as const
}
