// Check again, and the reload after a permission request or a settings write. A failed read is reported and does
// not reject. Waiting ends, so the dialog does not stay on "Waiting for System Settings". The previous readiness stays.
export function refreshReadiness<T>(input: {
  read: Promise<T> | undefined
  apply: (value: T) => void
  report: (error: unknown) => void
  finish: () => void
}) {
  const read = input.read
  if (!read) {
    input.finish()
    return Promise.resolve(false)
  }
  return read.then(
    (value) => {
      input.apply(value)
      input.finish()
      return true
    },
    (error: unknown) => {
      input.report(error)
      input.finish()
      return false
    },
  )
}

// Opening System Settings failed. A missing seat is not a failure.
export function settlePermissionAsk(input: { request: Promise<unknown> | undefined; report: (error: unknown) => void }) {
  const request = input.request
  if (!request) return Promise.resolve(false)
  return request.then(
    () => true,
    (error: unknown) => {
      input.report(error)
      return false
    },
  )
}
