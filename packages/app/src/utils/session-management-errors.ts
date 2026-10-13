export class SessionManagementUnsupported extends Error {
  override readonly name = "SessionManagementUnsupported"
}

/** Only missing-operation statuses imply an old V2 server. Auth and transport errors remain failures. */
export function sessionManagementUnsupported(error: unknown): boolean {
  if (error instanceof SessionManagementUnsupported) return true
  if (!(error instanceof Error) || !error.cause || typeof error.cause !== "object") return false
  if (error.cause instanceof SessionManagementUnsupported) return true
  if (!("status" in error.cause)) return false
  return error.cause.status === 404 || error.cause.status === 405 || error.cause.status === 501
}
