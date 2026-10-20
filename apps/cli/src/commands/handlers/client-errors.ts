import { ClientError } from "@orchestra/client"

// Verifies a client failure is a missing session: a declared-status error body
// (the server serializes SessionNotFoundError) or an undeclared 404.
export function isSessionNotFound(error: unknown) {
  return (
    (error instanceof ClientError &&
      error.reason === "UnexpectedStatus" &&
      (error.cause as { status?: number } | undefined)?.status === 404) ||
    (typeof error === "object" && error !== null && (error as { _tag?: unknown })._tag === "SessionNotFoundError")
  )
}