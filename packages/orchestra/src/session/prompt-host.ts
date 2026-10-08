import { PermissionV1 } from "@orchestra/core/v1/permission"
import { SessionV1 } from "@orchestra/core/v1/session"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { AbsolutePath } from "@orchestra/core/schema"
import { LocationServiceMap } from "@orchestra/core/location-services"
import type { PromptContext } from "@orchestra/schema/prompt-context"
import { Context, Effect, Exit, Layer, Option, Schema } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { WriteRoots } from "@/maestro/write-roots"
import type { SessionContinuity } from "@/continuity/service"
import type { Image } from "@/image/image"
import type { SessionPrompt } from "./prompt"
import type { Session } from "./session"
import { MessageID, SessionID } from "./schema"
import { PromptIdentity } from "./prompt-identity"
import { PromptAdmission } from "@orchestra/core/v1/prompt-admission"
import type { Database } from "@orchestra/core/database/database"
import type { EventV2 } from "@orchestra/core/event"

/** Publish through the native bridge; only the tagged exact winner may turn a losing publication into a retry. */
export const admit = Effect.fn("PromptHost.publishAdmission")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  payload: PromptAdmission.Payload,
  commitCache?: Effect.Effect<void>,
) {
  const created = yield* events
    .publish(SessionV1.Event.PromptAdmitted, payload, {
      ...(commitCache ? { commit: () => commitCache } : {}),
    })
    .pipe(
      Effect.as(true),
      Effect.catchDefect((defect) => {
        if (defect instanceof PromptAdmission.AlreadyAdmitted) return Effect.succeed(false)
        if (defect instanceof PromptAdmission.Conflict) return Effect.fail(defect)
        return Effect.die(defect)
      }),
    )
  const message = yield* PromptAdmission.reconcile(db, payload)
  if (!message) return yield* Effect.die(new Error("Committed V1 prompt admission receipt is missing"))
  return { created, message }
})

/** Host authority is restored after the mutable plugin boundary; rendered notes never belong to the plugin. */
export function protectUser(
  source: { messageID: MessageID; sessionID: SessionID },
  message: SessionV1.User,
  promptContext: PromptContext.Info | undefined,
): SessionV1.User {
  const { promptContext: _, ...content } = message
  return {
    ...content,
    id: source.messageID,
    sessionID: source.sessionID,
    role: "user",
    ...(promptContext ? { promptContext: { reminders: [...promptContext.reminders] } } : {}),
  }
}

/** V1 creation boundary: original request identity, native hooks, atomic admission and winner-only mutations. */
export const make = Effect.fn("PromptHost.make")(function* (dependencies: {
  sessions: Session.Interface
  continuity: Pick<SessionContinuity.Interface, "advance" | "invalidate">
  schema: typeof SessionPrompt.PromptInput
  build: (
    input: SessionPrompt.PromptInput & { messageID: MessageID },
    promptContext: PromptContext.Info | undefined,
    history?: SessionV1.WithParts[],
  ) => Effect.Effect<{ info: SessionV1.User; parts: SessionV1.Part[] }, Image.Error>
  loop: SessionPrompt.Interface["loop"]
}) {
  const safety = yield* ToolSafety.make
  const locations = yield* LocationServiceMap.Service

  return Effect.fn("PromptHost.admit")(function* (input: SessionPrompt.PromptInput) {
    const messageID = input.messageID ?? MessageID.ascending()
    // Schema.Any metadata can retain caller references; detach before identity and any asynchronous hook.
    const original = structuredClone(Schema.encodeSync(dependencies.schema)(input))
    const identity = PromptIdentity.fromEncoded(original)
    const request = Schema.decodeUnknownSync(dependencies.schema)(original)
    const existing = yield* dependencies.sessions.reconcilePrompt({ sessionID: request.sessionID, messageID, identity })
    if (existing)
      return request.noReply === true ? existing : yield* dependencies.loop({ sessionID: request.sessionID })

    const session = yield* dependencies.sessions.get(request.sessionID).pipe(Effect.orDie)
    const ctx = yield* InstanceState.context
    const promptScope = yield* Effect.scope
    const { ToolSafetyHooks } = yield* Effect.promise(() => import("@orchestra/core/tool-safety-hooks"))
    const location = {
      directory: AbsolutePath.make(session.directory),
      ...(session.workspaceID ? { workspaceID: session.workspaceID } : {}),
    }
    const notes = Object.freeze([
      ...(yield* safety
        .session({
          operation: "prompt",
          sessionID: session.id,
          messageID,
          text: request.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
          agent: request.agent ?? session.agent,
          directory: session.directory,
          projectID: session.projectID,
          projectDirectory: ctx.worktree === "/" ? ctx.directory : ctx.worktree,
        })
        .pipe(
          Effect.provideService(ToolSafetyHooks.Placement, {
            location,
            relay: Effect.gen(function* () {
              const { Relay } = yield* Effect.promise(() => import("@orchestra/core/relay"))
              const services = yield* Layer.buildWithScope(locations.get(location), promptScope).pipe(Effect.exit)
              if (Exit.isFailure(services)) return undefined
              return Option.getOrUndefined(Context.getOption(services.value, Relay.Service))
            }),
          }),
        )),
    ])

    // Capture only old revert targets: cleanup's live-history query after admission would delete the new prompt.
    const history = session.revert
      ? yield* dependencies.sessions.messages({ sessionID: session.id }).pipe(Effect.orDie)
      : undefined
    const boundary = history?.findIndex((message) => message.info.id === session.revert?.messageID) ?? -1
    const draft = yield* dependencies.build(
      { ...Schema.decodeUnknownSync(dependencies.schema)(structuredClone(original)), messageID },
      notes.length ? { reminders: notes } : undefined,
      history && boundary >= 0 ? history.slice(0, boundary + (session.revert?.partID ? 1 : 0)) : history,
    )
    const target = history?.[boundary]
    const partBoundary = target?.parts.findIndex((part) => part.id === session.revert?.partID) ?? -1
    const permissions = Object.entries(request.tools ?? {}).map(
      ([t, enabled]): PermissionV1.Rule => ({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" }),
    )
    const admitted = yield* dependencies.sessions.admitPrompt(
      {
        sessionID: session.id,
        messageID,
        identityVersion: 1,
        identity,
        ...draft,
        transition: {
          expectedRevert: session.revert
            ? Schema.decodeUnknownSync(SessionV1.SessionRevert)(
                Schema.encodeSync(SessionV1.SessionRevert)(session.revert),
              )
            : null,
          removeMessageIDs:
            boundary < 0
              ? []
              : (history ?? []).slice(boundary + (session.revert?.partID ? 1 : 0)).map((message) => message.info.id),
          removePartIDs:
            session.revert?.partID && target && partBoundary >= 0
              ? target.parts.slice(partBoundary).map((part) => part.id)
              : [],
          ...(permissions.length
            ? {
                permission: WriteRoots.keep(session.permission, permissions),
                expectedPermission: session.permission ?? null,
              }
            : {}),
          timeUpdated: Date.now(),
        },
      },
      Effect.gen(function* () {
        // Operational cache/file I/O only: EventV2 runs this after the winner projector and before visibility.
        if (session.revert) yield* dependencies.continuity.invalidate(session.id)
        yield* dependencies.continuity.advance(session.id)
      }),
    )
    const message = admitted.message
    if (!admitted.created)
      return request.noReply === true ? message : yield* dependencies.loop({ sessionID: session.id })

    if (request.noReply === true) return message
    return yield* dependencies.loop({ sessionID: session.id })
  }, Effect.scoped)
})

export * as PromptHost from "./prompt-host"
