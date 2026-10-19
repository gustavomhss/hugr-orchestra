import type { NotFoundError as StorageNotFoundError } from "@/storage/storage"
import type { Session } from "@/session/session"
import type { ToolSafety } from "@orchestra/core/tool-safety"
import { Effect } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import * as ApiError from "../errors"

export function mapStorageNotFound<A, R>(self: Effect.Effect<A, StorageNotFoundError, R>) {
  return self.pipe(Effect.mapError((error) => ApiError.notFound(error.message)))
}

export function mapBusy<A, R>(self: Effect.Effect<A, Session.BusyError, R>) {
  return self.pipe(
    Effect.catchTag("SessionBusyError", (error) =>
      Effect.fail(
        new ApiError.SessionBusyError({
          sessionID: error.sessionID,
          message: `Session is busy: ${error.sessionID}`,
        }),
      ),
    ),
  )
}

/**
 * What the sender is told when an installed hook (or the hook profile) refused a prompt before it was admitted. The
 * hook's name and its own words travel in `data.hook`; `data.message` is a plain sentence for clients that show only
 * the message.
 */
export function promptBlocked(denied: ToolSafety.Denied) {
  return HttpServerResponse.jsonUnsafe(
    {
      name: "PromptBlockedError",
      data: {
        message: denied.detail ?? `Tool safety HOLD: ${denied.reason}`,
        reason: denied.reason,
        ...(denied.hook ? { hook: denied.hook } : {}),
      },
    },
    { status: 409 },
  )
}
