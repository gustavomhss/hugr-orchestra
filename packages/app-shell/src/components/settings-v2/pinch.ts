// Pinch zoom the user asked to change, and the read when Settings opens.
// A missing control is not a failure. A stale request (a newer one already replaced it) is not this request.
// A failed current write does not leave the switch where the user asked. A failed current read does not invent off.
// Either failure is reported and does not reject.

export function settlePinchWrite(input: {
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

export function settlePinchRead<T>(input: {
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

export function pinchKnown(value: boolean | undefined) {
  return value !== undefined
}
