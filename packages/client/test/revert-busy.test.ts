import { expect, test } from "bun:test"
import { isConflictError, Orchestra } from "@orchestra/client"

test.each(["stage", "clear", "commit"] as const)(
  "sessions.%s preserves a declared busy conflict",
  async (operation) => {
    const requests: Request[] = []
    const declared = { _tag: "ConflictError", message: "Session is busy", resource: "session" }
    const client = Orchestra.make({
      baseUrl: "http://localhost:3000",
      fetch: async (input, init) => {
        requests.push(new Request(input, init))
        return Response.json(declared, { status: 409 })
      },
    })

    const request =
      operation === "stage"
        ? client.sessions.stage({ sessionID: "ses_test", messageID: "msg_test" })
        : client.sessions[operation]({ sessionID: "ses_test" })
    await request.then(
      () => {
        throw new Error("Expected a busy conflict")
      },
      (error: unknown) => {
        expect(isConflictError(error)).toBe(true)
        expect(error).toEqual(declared)
      },
    )
    expect(requests.map((request) => [request.method, request.url])).toEqual([
      ["POST", `http://localhost:3000/api/session/ses_test/revert/${operation}`],
    ])
  },
)
