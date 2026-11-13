// The live seat read when Settings opens, and a content-protection change the user asked for.
// A missing seat is not a failure. A stale request (a newer one already replaced it) is not this request.
// A failed current read does not invent running, a saved key, or protection on, and does not replace the previous values.
// A failed current write does not leave the switch where the user asked.
// Either failure is reported and does not reject.

export function settleLiveRead<T>(input: {
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

export function settleLiveWrite(input: {
  write: Promise<void> | undefined
  current: () => boolean
  revert: () => void
  report: (error: unknown) => void
}) {
  if (!input.write) return Promise.resolve(false)
  return input.write.then(
    () => input.current(),
    (error: unknown) => {
      if (!input.current()) return false
      input.revert()
      input.report(error)
      return false
    },
  )
}

export function liveKnown(value: boolean | undefined) {
  return value !== undefined
}

export function liveOn(value: boolean | undefined) {
  return value === true
}
