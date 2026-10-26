import { SessionMeeting } from "@orchestra/core/session/meeting"
import { MeetingError } from "@orchestra/protocol/groups/meeting"
import { Effect } from "effect"
import { HttpApiBuilder, HttpApiSchema } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const MeetingHandler = HttpApiBuilder.group(Api, "server.meeting", (handlers) =>
  Effect.succeed(
    handlers
      .handle("meeting.start", (ctx) =>
        response(
          Effect.gen(function* () {
            const meeting = yield* SessionMeeting.Service
            return yield* meeting.start(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("meeting.append", (ctx) =>
        Effect.gen(function* () {
          const meeting = yield* SessionMeeting.Service
          yield* meeting.append(ctx.payload).pipe(Effect.mapError(apiError))
          return HttpApiSchema.NoContent.make()
        }),
      )
      .handle("meeting.stop", (ctx) =>
        response(
          Effect.gen(function* () {
            const meeting = yield* SessionMeeting.Service
            return yield* meeting.stop(ctx.payload).pipe(Effect.mapError(apiError))
          }),
        ),
      )
      .handle("meeting.read", (ctx) =>
        response(
          Effect.gen(function* () {
            const meeting = yield* SessionMeeting.Service
            return yield* meeting.get({ meetingID: ctx.query.meetingID }).pipe(Effect.mapError(apiError))
          }),
        ),
      ),
  ),
)

function apiError(error: SessionMeeting.MeetingError) {
  return new MeetingError({ name: "MeetingError", data: { reason: error.reason } })
}
