import { check, isRecord, object } from "./assertions"
import { http } from "./dsl"
import type { Scenario } from "./types"

// Meeting routes (V2 /api/meeting). The exercise database holds no meetings or Sessions, so each route answers its
// typed MeetingError with the reason for that refusal, and the list is empty; the lifecycle is covered by core tests.
// confirm and commitment answer missing_meeting and missing_item for unknown ids. Handoff answers "unavailable" until
// the live seat handoff lands.
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
      body: { sessionID: "ses_httpapi_meeting_missing", title: "Exercise", consent: "unknown" },
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
  http.protected
    .get("/api/meeting/list", "v2.meeting.list")
    .at((ctx) => ({ path: "/api/meeting/list", headers: ctx.headers() }))
    .json(
      200,
      (body) => {
        object(body)
        check(isRecord(body.data) && Array.isArray(body.data.items), "meeting list should answer an items array")
      },
      "status",
    ),
  http.protected
    .patch("/api/meeting", "v2.meeting.rename")
    .at((ctx) => ({
      path: "/api/meeting",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { meetingID, title: "Renamed" },
    }))
    .json(400, refused("missing_meeting"), "status"),
  http.protected
    .delete("/api/meeting", "v2.meeting.delete")
    .at((ctx) => ({ path: `/api/meeting?meetingID=${meetingID}`, headers: ctx.headers() }))
    .json(400, refused("missing_meeting"), "status"),
  http.protected
    .post("/api/meeting/confirm", "v2.meeting.confirm")
    .at((ctx) => ({
      path: "/api/meeting/confirm",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { meetingID },
    }))
    .json(400, refused("missing_meeting"), "status"),
  http.protected
    .post("/api/meeting/commitment", "v2.meeting.commitment")
    .at((ctx) => ({
      path: "/api/meeting/commitment",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { id: "cmt_httpapi_meeting", state: "done" },
    }))
    .json(400, refused("missing_item"), "status"),
  http.protected
    .post("/api/meeting/handoff", "v2.meeting.handoff")
    .at((ctx) => ({
      path: "/api/meeting/handoff",
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body: { meetingID, itemIDs: [] },
    }))
    .json(400, refused("unavailable"), "status"),
]
