import { expect, test } from "bun:test"
import { Effect } from "effect"
import { request } from "../../src/capability/channel/http"
import { calendarSnapshot, reconcileCalendar } from "../../src/inbox/calendar"

test("Google calendar follows opaque pages and distinguishes the person's invitation from a shared resource", async () => {
  const calls: URL[] = []
  const event = {
    id: "event-1",
    summary: "Planning",
    status: "confirmed",
    updated: "2026-11-05T00:00:00Z",
    start: { dateTime: "2026-11-06T10:00:00Z" },
    end: { dateTime: "2026-11-06T11:00:00Z" },
    attendees: [{ email: "ada@example.com", self: true, responseStatus: "needsAction" }],
    htmlLink: "https://calendar.google.com/calendar/event?eid=one",
  }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      calls.push(url)
      return Response.json({
        kind: "calendar#events",
        accessRole: "owner",
        items: url.searchParams.has("pageToken")
          ? [
              event,
              {
                ...event,
                id: "resource",
                attendees: [{ email: "room@example.com", self: true, responseStatus: "needsAction" }],
              },
            ]
          : [],
        ...(!url.searchParams.has("pageToken") ? { nextPageToken: "opaque+/=" } : {}),
      })
    },
  })
  try {
    const rpc = (input: Parameters<typeof request>[2]) =>
      request("https://www.googleapis.com", "Bearer fixture", input, { fixtureOrigin: server.url.origin })
    const result = await Effect.runPromise(
      calendarSnapshot(rpc, "gmail", "shared", "ada@example.com", {
        start: "2026-11-01T00:00:00Z",
        end: "2027-02-01T00:00:00Z",
      }),
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.pending).toBe(true)
    expect(result[1]?.pending).toBe(false)
    expect(calls.map((url) => url.searchParams.get("pageToken"))).toEqual([null, "opaque+/="])
    expect(
      calls.every(
        (url) => url.searchParams.get("singleEvents") === "true" && url.searchParams.get("showDeleted") === "true",
      ),
    ).toBe(true)
  } finally {
    await server.stop(true)
  }
})

test("Microsoft calendar view preserves the fixed horizon and recognizes only a pending attendee response", async () => {
  const calls: URL[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      const url = new URL(req.url)
      calls.push(url)
      const event = {
        id: "one",
        subject: "Planning",
        isCancelled: false,
        isOrganizer: false,
        responseStatus: { response: "notResponded" },
        start: { dateTime: "2026-11-06T10:00:00", timeZone: "UTC" },
        end: { dateTime: "2026-11-06T11:00:00", timeZone: "UTC" },
      }
      return Response.json({
        value: [
          event,
          { ...event, id: "own", isOrganizer: true },
          { ...event, id: "accepted", responseStatus: { response: "accepted" } },
        ],
      })
    },
  })
  try {
    const result = await Effect.runPromise(
      calendarSnapshot(
        (input) =>
          request("https://graph.microsoft.com", "Bearer fixture", input, { fixtureOrigin: server.url.origin }),
        "outlook",
        "primary",
        "me",
        { start: "2026-11-01T00:00:00Z", end: "2027-02-01T00:00:00Z" },
      ),
    )
    expect(result.map((event) => event.pending)).toEqual([true, false, false])
    expect(calls[0]?.pathname).toBe("/v1.0/me/calendar/calendarView")
    expect(calls[0]?.searchParams.get("startDateTime")).toBe("2026-11-01T00:00:00Z")
  } finally {
    await server.stop(true)
  }
})

test("calendar baselines admit invitations but not ordinary history, retain tombstone context and ignore metadata churn", () => {
  const ordinary = { id: "one", title: "Planning", start: "tomorrow", end: "later", cancelled: false, pending: false }
  const first = reconcileCalendar(undefined, [ordinary, { ...ordinary, id: "invite", pending: true }], "scope")
  expect(first.items.map((item) => item.externalId)).toEqual(["scope:invite"])
  expect(reconcileCalendar(first.events, [ordinary], "scope").items).toEqual([])
  expect(reconcileCalendar(first.events, [], "scope").events).toHaveLength(2)
  const changed = reconcileCalendar(first.events, [{ ...ordinary, title: "Changed" }], "scope")
  expect(changed.items).toHaveLength(1)
  expect(changed.items[0]?.revision).not.toBe(first.items[0]?.revision)
  const cancelled = reconcileCalendar(changed.events, [{ id: "one", cancelled: true, pending: false }], "scope")
  expect(cancelled.items[0]?.snippet).toContain("Changed\nCancelled")
  expect(reconcileCalendar(cancelled.events, [{ id: "one", cancelled: true, pending: false }], "scope").items).toEqual(
    [],
  )
  expect(reconcileCalendar(undefined, [{ id: "unknown", cancelled: true, pending: false }], "scope").items).toEqual([])
})

test("Calendar rejects cyclic Google pages and Graph links that escape the selected calendar or horizon", async () => {
  const state = { google: true, calls: 0 }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      state.calls++
      return Response.json(
        state.google
          ? { kind: "calendar#events", accessRole: "owner", items: [], nextPageToken: "repeat" }
          : {
              value: [],
              "@odata.nextLink":
                "https://graph.microsoft.com/v1.0/me/calendar/calendarView?startDateTime=2020-01-01T00%3A00%3A00Z&$skiptoken=next",
            },
      )
    },
  })
  try {
    const horizon = { start: "2026-11-01T00:00:00Z", end: "2027-02-01T00:00:00Z" }
    const rpc = (input: Parameters<typeof request>[2]) =>
      request("https://www.googleapis.com", "Bearer fixture", input, { fixtureOrigin: server.url.origin })
    expect(
      await Effect.runPromise(calendarSnapshot(rpc, "gmail", "primary", "ada@example.com", horizon).pipe(Effect.flip)),
    ).toMatchObject({ reason: "invalid_response" })
    expect(state.calls).toBe(2)
    state.google = false
    expect(
      await Effect.runPromise(calendarSnapshot(rpc, "outlook", "primary", "me", horizon).pipe(Effect.flip)),
    ).toMatchObject({ reason: "invalid_response" })
    expect(state.calls).toBe(3)
  } finally {
    await server.stop(true)
  }
})
