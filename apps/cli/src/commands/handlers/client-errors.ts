// Verifies a client failure is a missing session: the declared error body the server serializes for
// SessionNotFoundError. An undeclared 404 (an older daemon without the route) is not a missing session.
export function isSessionNotFound(error: unknown) {
  return typeof error === "object" && error !== null && (error as { _tag?: unknown })._tag === "SessionNotFoundError"
}
