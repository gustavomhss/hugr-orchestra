// The patch load when a diff export needs the text the list only summarizes.
// A missing load is not a failure.
// A stale load (a newer export or version already replaced it) is not this request.
// A failed current load does not invent "no patch text" and does not replace the listed text.
// The failure is reported and does not reject.

export function settlePatchLoad(input: {
  read: Promise<string | undefined> | undefined
  current: () => boolean
  apply: (value: string | undefined) => void
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

// Empty is only a load that confirmed no text. A failed load is not empty.
export function patchClaim(known: boolean, failed: boolean, text: string | undefined) {
  if (failed) return "failed" as const
  if (!known) return "unknown" as const
  if (text?.trim()) return "text" as const
  return "empty" as const
}
