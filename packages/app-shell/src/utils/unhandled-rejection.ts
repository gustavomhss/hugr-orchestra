import { describeError } from "./server-errors"

/**
 * Names an unhandled promise rejection in the log. The client rejects with a declared server error's plain body, which
 * the browser prints as "Uncaught (in promise) #<Object>" and electron-log keeps as nothing more, so the reason is
 * written out here and the browser's own print is cancelled.
 */
export function logUnhandledRejection(event: { reason: unknown; preventDefault(): void }) {
  event.preventDefault()
  // A request or stream the app cancelled on purpose rejects with an AbortError; that is not a failure.
  if (typeof event.reason === "object" && event.reason !== null && "name" in event.reason && event.reason.name === "AbortError") return
  console.error(`Unhandled promise rejection: ${describeError(event.reason)}`)
}
