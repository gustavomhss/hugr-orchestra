// The last meeting on the Flight Engineer home card.
// A missing source is not a failure. A stale read (a newer one already replaced it, or it was aborted) is not this request.
// A failed current read does not replace the meeting already shown and does not invent "no meetings".
// "No meetings yet" is only a read that came back empty. The failure is reported and does not reject.

export function settleLastMeeting<T>(input: {
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

export function homeLastClaim(input: { meeting: boolean; confirmed: boolean; failed: boolean }) {
  if (input.meeting) return "meeting" as const
  if (input.failed) return "failed" as const
  if (input.confirmed) return "none" as const
  return "unknown" as const
}
