import { check, isRecord, object } from "./assertions"
import { http } from "./dsl"
import type { Scenario } from "./types"

// Meeting routes (V2 /api/meeting). The exercise database holds no meetings or Sessions, so each route answers its
// typed MeetingError with the reason for that refusal; the recording lifecycle is covered by core tests.
function refused(reason: string) {
  return (body: unknown) => {
    object(body)
    check(body.name === "MeetingError", `expected MeetingError, got ${String(body.name)}`)
    check(isRecord(body.data) && body.data.reason === reason, `a meeting route should answer reason ${reason}`)
  }
}

const meetingID = "mtg_httpapi_meeting_missing"
const segment = { id: "seg_httpapi_meeting", track: "me", text: "hello", startMs: 0, endMs: 10 }

export const meetingScenarios: Scenario[] = [
  http.protected
    .post("/api/meeting/start", "v2.meeting.start")
    .at((ctx) => ({
      path: "/api/meeting/start",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { sessionID: "ses_httpapi_meeting_missing", title: "Exercise" },
    }))
    .json(400, refused("missing_session"), "status"),
  http.protected
    .post("/api/meeting/segments", "v2.meeting.append")
    .at((ctx) => ({
      path: "/api/meeting/segments",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { meetingID, segments: [segment] },
    }))
    .json(400, refused("missing_meeting"), "status"),
  http.protected
    .post("/api/meeting/stop", "v2.meeting.stop")
    .at((ctx) => ({
      path: "/api/meeting/stop",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { meetingID },
    }))
    .json(400, refused("missing_meeting"), "status"),
  http.protected
    .get("/api/meeting", "v2.meeting.read")
    .at((ctx) => ({ path: `/api/meeting?meetingID=${meetingID}`, headers: ctx.headers() }))
    .json(400, refused("missing_meeting"), "status"),
]
