export class SessionManagementUnsupported extends Error {
  override readonly name = "SessionManagementUnsupported"
}

/** Classification happens before the generated runtime decodes HTTP errors. */
export function sessionManagementUnsupported(error: unknown): boolean {
  if (error instanceof SessionManagementUnsupported) return true
  return error instanceof Error && error.cause instanceof SessionManagementUnsupported
}
