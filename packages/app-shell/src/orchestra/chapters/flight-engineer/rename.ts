// A title change the user asked for on a running meeting.
// A missing seat is not a failure. A stale rename (a newer one already replaced it) is not this request.
// A failed current rename does not pretend the title changed.
// The failure is reported and does not reject. The title on screen comes from the run state, not from this write.

export function settleRename(input: {
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
