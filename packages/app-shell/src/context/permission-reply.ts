// A failed reply must be retryable, so the id is forgotten. It must not look like the answer landed.
export function noteFailedPermissionReply(input: {
  permissionID: string
  error: unknown
  forget: (id: string) => void
  report: (error: unknown) => void
}) {
  input.forget(input.permissionID)
  console.error(input.error)
  input.report(input.error)
}
