import { Cause, Effect } from "effect"
import type { SessionID } from "./schema"

/** Logs a plugin hook that failed or died instead of failing the caller; interruption still propagates. */
export const logHookFailure =
  (message: string, sessionID: SessionID) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause) ? Effect.interrupt : Effect.logError(message, { sessionID, cause }),
      ),
    )
