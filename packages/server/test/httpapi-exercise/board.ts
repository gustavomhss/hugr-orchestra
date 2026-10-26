import { array, check, object } from "./assertions"
import { http, route } from "./dsl"
import { type Scenario } from "./types"

// Board routes (V2 /api/board). The exercise database holds no board projects, so the list is empty and every route
// that names a project answers BoardNotFoundError; the board's rules are covered by packages/core/test/board.test.ts
// and the owner round trip by packages/server/test/board-http.test.ts.
function notFound(body: unknown) {
  object(body)
  check(body._tag === "BoardNotFoundError", `expected BoardNotFoundError, got ${String(body._tag)}`)
}

const key = "NOPE"
const issue = { key, number: "1" }

function read(path: string, name: string, params: Record<string, string>) {
  return http.protected
    .get(path, name)
    .at((ctx) => ({ path: route(path, params), headers: ctx.headers() }))
    .json(404, notFound, "status")
}

function write(path: string, name: string, params: Record<string, string>, body: Record<string, unknown> = {}) {
  return http.protected
    .post(path, name)
    .at((ctx) => ({
      path: route(path, params),
      headers: { ...ctx.headers(), "content-type": "application/json" },
      body,
    }))
    .json(404, notFound, "status")
}

export const boardScenarios: Scenario[] = [
  http.protected.get("/api/board", "v2.board.list").json(200, array),
  read("/api/board/{key}", "v2.board.get", { key }),
  read("/api/board/{key}/issue/{number}", "v2.board.issue", issue),
  read("/api/board/{key}/activity", "v2.board.activity", { key }),
  write(
    "/api/board/{key}/question/{id}/answer",
    "v2.board.answer",
    { key, id: "q_httpapi_missing" },
    { option: "yes" },
  ),
  write("/api/board/{key}/issue/{number}/note", "v2.board.note", issue, { body: "Exercise note." }),
  write("/api/board/{key}/issue/{number}/attachment", "v2.board.attach", issue, {
    kind: "file",
    name: "notes.txt",
    mime: "text/plain",
    data: "aGVsbG8=",
  }),
  write("/api/board/{key}/activity/{id}/undo", "v2.board.undo", { key, id: "act_httpapi_missing" }),
  write("/api/board/{key}/pause", "v2.board.pause", { key }, { reason: "Exercise." }),
  write("/api/board/{key}/resume", "v2.board.resume", { key }),
  write("/api/board/{key}/github/sync", "v2.board.githubSync", { key }),
  write("/api/board/{key}/issue/{number}/pause", "v2.board.pauseIssue", issue),
  write("/api/board/{key}/issue/{number}/resume", "v2.board.resumeIssue", issue),
  write("/api/board/{key}/issue/{number}/hold", "v2.board.hold", issue, { hold: true }),
  write("/api/board/{key}/intake/{number}/accept", "v2.board.accept", issue),
  write("/api/board/{key}/intake/{number}/decline", "v2.board.decline", issue),
]
