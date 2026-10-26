import { Location } from "@orchestra/schema/location"
import { Meeting } from "@orchestra/schema/meeting"
import { Schema } from "effect"
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema, OpenApi } from "effect/unstable/httpapi"
import { LocationQuery, locationQueryOpenApi } from "./location"

// `reason` says why the meeting could not change, so clients can explain it without parsing the message.
export class MeetingError extends Schema.ErrorClass<MeetingError>("MeetingError")(
  {
    name: Schema.Literal("MeetingError"),
    data: Schema.Struct({ reason: Meeting.ErrorReason }),
  },
  { httpApiStatus: 400 },
) {}

const ReadParams = Schema.Struct({ ...LocationQuery.fields, meetingID: Meeting.ID })

export const MeetingGroup = HttpApiGroup.make("server.meeting")
  .add(
    HttpApiEndpoint.post("meeting.start", "/api/meeting/start", {
      query: LocationQuery,
      payload: Meeting.StartInput,
      success: Location.response(Meeting.Info),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.start",
          summary: "Start meeting",
          description:
            "Start the live-seat meeting record of a Session. A Session holds one running meeting at a time.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("meeting.append", "/api/meeting/segments", {
      query: LocationQuery,
      payload: Meeting.AppendInput,
      success: HttpApiSchema.NoContent,
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.append",
          summary: "Append meeting segments",
          description: "Append final transcript segments to a running meeting. Segments already stored are skipped.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("meeting.stop", "/api/meeting/stop", {
      query: LocationQuery,
      payload: Meeting.StopInput,
      success: Location.response(Meeting.Info),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.stop",
          summary: "Stop meeting",
          description: "Stop a running meeting and record its end time.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.get("meeting.read", "/api/meeting", {
      query: ReadParams,
      success: Location.response(Meeting.Detail),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.read",
          summary: "Read meeting",
          description: "Read a meeting record with its final transcript segments in time order.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "meeting",
      description: "Live-seat meeting records and their final transcript segments.",
    }),
  )
