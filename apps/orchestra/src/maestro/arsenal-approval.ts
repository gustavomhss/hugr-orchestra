export * as ArsenalApproval from "./arsenal-approval"

import { Effect, Schema } from "effect"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { PermissionV1 } from "@orchestra/core/v1/permission"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { MessageID, SessionID } from "@/session/schema"
import { Permission } from "@/permission"

/** V1 wrappers capture their actual V1 permission queue and Instance placement. */
export const makeApprovalHost = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const instances = yield* InstanceStore.Service
  const permission = yield* Permission.Service
  return {
    ask: (request: ToolSafety.Approval) => Effect.gen(function* () {
      const session = yield* sessions.get(SessionID.make(request.invocation.sessionID)).pipe(
        Effect.mapError(() => new ToolSafety.Denied({ reason: "approval-session-missing" })),
      )
      // Only the host's pre-admission prompt event has no native tool call to bind.
      const prompt = request.action === "relay_hook" && request.trigger === "prompt.before" &&
        request.invocation.tool === "" && request.invocation.callID === "" &&
        request.resources.length === 1 && request.resources[0] === "prompt" &&
        typeof request.messageID === "string" && request.messageID.trim().length > 0 &&
        !request.messageID.includes("\0") && Schema.is(MessageID)(request.messageID)
      if (request.invocation.projectID !== session.projectID ||
        request.invocation.directory !== session.directory ||
        (!request.invocation.callID && !prompt) || !request.resources.length)
        return yield* new ToolSafety.Denied({ reason: "approval-native-placement-mismatch" })
      return yield* instances.provide({ directory: session.directory }, permission.ask({
        permission: `arsenal-safety:${PermissionV1.ID.ascending()}`,
        sessionID: session.id,
        patterns: [...request.resources],
        always: [],
        metadata: {
          nativeSafety: true,
          action: request.action,
          ...(request.invocation.callID ? { callID: request.invocation.callID } : {}),
          ...(request.trigger === undefined ? {} : { trigger: request.trigger }),
          ...(request.messageID === undefined ? {} : { messageID: request.messageID }),
          projectID: session.projectID,
          ...(request.message === undefined ? {} : { message: request.message }),
        },
        ruleset: [{ permission: "*", pattern: "*", action: "ask" }],
      })).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "approval-native-rejected" })))
    }),
  }
})
