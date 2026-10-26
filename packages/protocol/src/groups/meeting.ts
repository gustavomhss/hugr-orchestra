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
const ListParams = Schema.Struct({ ...LocationQuery.fields, ...Meeting.ListQuery.fields })

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
  .add(
    HttpApiEndpoint.get("meeting.list", "/api/meeting/list", {
      query: ListParams,
      success: Location.response(Meeting.ListResult),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.list",
          summary: "List meetings",
          description: "List meetings newest first, optionally searched by text or filtered by person.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.patch("meeting.rename", "/api/meeting", {
      query: LocationQuery,
      payload: Meeting.RenameInput,
      success: Location.response(Meeting.Summary),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.rename",
          summary: "Rename meeting",
          description: "Rename a meeting, while it runs or after it stopped.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.delete("meeting.delete", "/api/meeting", {
      query: ReadParams,
      success: Location.response(Meeting.DeleteReceipt),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.delete",
          summary: "Delete meeting",
          description:
            "Delete a stopped meeting with its segments and every memory record whose only source is that meeting.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("meeting.confirm", "/api/meeting/confirm", {
      query: LocationQuery,
      payload: Meeting.ConfirmInput,
      success: Location.response(Meeting.Card),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.confirm",
          summary: "Confirm meeting card",
          description: "Record the owner's verdicts on card items and proposed people.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("meeting.commitment", "/api/meeting/commitment", {
      query: LocationQuery,
      payload: Meeting.CommitmentInput,
      success: Location.response(Meeting.Commitment),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.commitment",
          summary: "Update commitment",
          description: "Move a commitment to accepted, done or dropped.",
        }),
      ),
  )
  .add(
    HttpApiEndpoint.post("meeting.handoff", "/api/meeting/handoff", {
      query: LocationQuery,
      payload: Meeting.HandoffInput,
      success: Location.response(Meeting.HandoffResult),
      error: MeetingError,
    })
      .annotateMerge(locationQueryOpenApi)
      .annotateMerge(
        OpenApi.annotations({
          identifier: "v2.meeting.handoff",
          summary: "Send items to Maestro",
          description: "Send card items to Maestro through team_message, with their source and no transcript.",
        }),
      ),
  )
  .annotateMerge(
    OpenApi.annotations({
      title: "meeting",
      description: "Live-seat meeting records and their final transcript segments.",
    }),
  )
