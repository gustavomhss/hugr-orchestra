import { afterEach, expect, test } from "bun:test"
import { meetingClient } from "./live-meeting-client"

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(() => servers.splice(0).forEach((server) => server.stop(true)))

// A stand-in meeting API that fails the first `failures` appends and records every request.
function fakeServer(failures: number) {
  const seen = { requests: [] as { path: string; auth: string; directory: string; body: { segments?: { id: string }[] } }[] }
  const state = { failures }
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const body = await request.json()
      seen.requests.push({
        path: url.pathname,
        auth: request.headers.get("authorization") ?? "",
        directory: url.searchParams.get("location[directory]") ?? "",
        body,
      })
      if (url.pathname === "/api/meeting/start") return Response.json({ data: { id: "mtg_1", timeStarted: 1000 } })
      if (url.pathname === "/api/meeting/segments" && state.failures-- > 0) return new Response("down", { status: 503 })
      return new Response(null, { status: 204 })
    },
  })
  servers.push(server)
  return { url: `http://127.0.0.1:${server.port}`, seen }
}

const segment = (id: string) => ({ id, track: "me" as const, text: id, startMs: 0, endMs: 100 })

test("starts, appends with Basic auth and location, and stops", async () => {
  const fake = fakeServer(0)
  const client = meetingClient({ url: fake.url, password: "pw", directory: "/work" })
  const meeting = await client.start("ses_1", "Standup")
  client.append(meeting.id, segment("a"))
  expect(await client.stop(meeting.id)).toEqual({ unsent: 0 })
  expect(meeting).toEqual({ id: "mtg_1", timeStarted: 1000 })
  expect(fake.seen.requests.map((request) => request.path)).toEqual([
    "/api/meeting/start",
    "/api/meeting/segments",
    "/api/meeting/stop",
  ])
  expect(fake.seen.requests[0].auth).toBe(`Basic ${Buffer.from("orchestra:pw").toString("base64")}`)
  expect(fake.seen.requests.every((request) => request.directory === "/work")).toBe(true)
})

test("a failed append is retried with the same segment ids and reports the outage", async () => {
  const fake = fakeServer(1)
  const failed: number[] = []
  const recovered: true[] = []
  const client = meetingClient(
    { url: fake.url },
    { failed: (_, pending) => failed.push(pending), recovered: () => recovered.push(true) },
  )
  client.append("mtg_1", segment("a"))
  client.append("mtg_1", segment("b"))
  const deadline = Date.now() + 5000
  while (recovered.length === 0 && Date.now() < deadline) await Bun.sleep(20)
  expect(failed.length).toBeGreaterThanOrEqual(1)
  expect(recovered).toEqual([true])
  const appends = fake.seen.requests.filter((request) => request.path === "/api/meeting/segments")
  const ids = appends.flatMap((request) => request.body.segments?.map((item) => item.id) ?? [])
  // "a" went out, failed and went out again; every id reached the server and none was invented.
  expect(new Set(ids)).toEqual(new Set(["a", "b"]))
  expect(ids.filter((id) => id === "a").length).toBe(2)
  expect(await client.stop("mtg_1")).toEqual({ unsent: 0 })
})
