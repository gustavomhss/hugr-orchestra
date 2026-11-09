import { Inbox, InboxHandoff } from "@orchestra/core/inbox"
import { InboxError } from "@orchestra/protocol/groups/inbox"
import { Effect, Option } from "effect"
import { HttpServerRequest } from "effect/unstable/http"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const InboxHandler = HttpApiBuilder.group(Api, "server.inbox", (handlers) =>
  Effect.succeed(
    handlers
      .handle("inbox.list", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.list()
          }),
        ),
      )
      .handle("inbox.upsert", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.upsert(ctx.payload)
          }),
        ),
      )
      .handle("inbox.archive", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.archive(ctx.payload.id).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.read", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.markRead(ctx.payload.id).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.remind", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.remindTomorrow(ctx.payload.id).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.draft", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.saveDraft(ctx.payload.id, ctx.payload.text).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.originDraft", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.originDraft(ctx.payload.id, ctx.payload.text).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.send", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.send(ctx.payload.id, ctx.payload.text).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.handoff", (ctx) =>
        response(
          Effect.gen(function* () {
            const handoff = yield* InboxHandoff.Service
            return yield* handoff.handoff(ctx.payload.ids).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.accounts", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.accounts()
          }),
        ),
      )
      .handle("inbox.connect", (ctx) =>
        Effect.gen(function* () {
          const inbox = yield* Inbox.Service
          yield* inbox.connect(ctx.payload)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("inbox.slackStart", () =>
        response(
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const peer = Option.getOrUndefined(request.remoteAddress)
            if (
              !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(request.headers.host ?? "") ||
              (peer !== undefined && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer))
            )
              return yield* new InboxError({ name: "InboxError", data: { reason: "unavailable" } })
            const inbox = yield* Inbox.Service
            return yield* inbox.slackStart().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.slackStatus", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.slackStatus(ctx.query.id)
          }),
        ),
      )
      .handle("inbox.calendarConfiguration", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.calendarConfiguration().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.calendarConfigure", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.calendarConfiguration(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.calendarDiscover", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.discoverCalendars(ctx.payload.generation).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.feeds", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.feeds().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.addFeed", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.addFeed(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.syncFeed", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.syncFeed(ctx.payload.id).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.removeFeed", (ctx) =>
        Effect.gen(function* () {
          const inbox = yield* Inbox.Service
          yield* inbox.removeFeed(ctx.payload.id).pipe(Effect.mapError(apiError))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("inbox.notificationConfiguration", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.notificationConfiguration(ctx.query.source).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.notificationConfigure", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox
              .notificationConfiguration(ctx.payload.source, ctx.payload)
              .pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.gitlabConfiguration", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.gitlabConfiguration().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.gitlabConfigure", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.gitlabConfiguration(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.communicationConfiguration", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.communicationConfiguration(ctx.query.source).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.communicationConfigure", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox
              .communicationConfiguration(ctx.payload.source, ctx.payload)
              .pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.communicationDiscover", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox
              .discoverCommunication(ctx.payload.source, ctx.payload.generation)
              .pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.syncWork", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.syncWork(ctx.payload.source, ctx.payload.generation).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.disconnectAccount", (ctx) =>
        Effect.gen(function* () {
          const inbox = yield* Inbox.Service
          yield* inbox.disconnectAccount(ctx.payload.source, ctx.payload.generation).pipe(Effect.mapError(apiError))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("inbox.githubPreferences", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.githubPreferences().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.githubConfigure", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.githubPreferences(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.slackCancel", (ctx) =>
        Effect.gen(function* () {
          const inbox = yield* Inbox.Service
          yield* inbox.slackCancel(ctx.payload.id)
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("inbox.slackDisconnect", () =>
        Effect.gen(function* () {
          const inbox = yield* Inbox.Service
          yield* inbox.slackDisconnect().pipe(Effect.mapError(apiError))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("inbox.door", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return inbox.door(ctx.payload)
          }),
        ),
      )
      .handle("inbox.slackScope", () =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.slackScope().pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.slackDiscover", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox
              .slackDiscover(ctx.payload.generation, ctx.payload.cursor)
              .pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.slackSelect", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox
              .slackSelect(ctx.payload.generation, ctx.payload.selected)
              .pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("inbox.slackSync", (ctx) =>
        response(
          Effect.gen(function* () {
            const inbox = yield* Inbox.Service
            return yield* inbox.slackSync(ctx.payload.generation).pipe(Effect.mapError(apiError))
          }),
        ),
      ),
  ),
)

function apiError(error: Inbox.InboxError) {
  return new InboxError({ name: "InboxError", data: { reason: error.reason } })
}
