import { Cause, Effect } from "effect"
import type { SessionID } from "./schema"

/** Logs a plugin hook that died instead of failing the caller; interruption still propagates. */
export const logHookFailure =
  (message: string, sessionID: SessionID) =>
  <A, E, R>(self: Effect.Effect<A, E, R>) =>
    self.pipe(
      Effect.catchCauseIf(
        (cause) => !Cause.hasInterruptsOnly(cause),
        (cause) => Effect.logError(message, { sessionID, cause }),
      ),
    )
