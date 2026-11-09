import { Effect, Schema } from "effect"
import { decode, Failure, type RPC } from "../capability/channel/http"
import { graphPages } from "./communication"
import type { Pulled } from "./types"

export type CalendarEvent = {
  id: string
  title?: string
  start?: string
  end?: string
  location?: string
  join?: string
  href?: string
  cancelled: boolean
  status?: string
  pending: boolean
}

const googleTime = Schema.Struct({
  dateTime: Schema.optionalKey(Schema.NonEmptyString),
  date: Schema.optionalKey(Schema.NonEmptyString),
  timeZone: Schema.optionalKey(Schema.String),
})
const GoogleEvent = Schema.Struct({
  id: Schema.NonEmptyString,
  status: Schema.Literals(["confirmed", "tentative", "cancelled"]),
  summary: Schema.optionalKey(Schema.String),
  start: Schema.optionalKey(googleTime),
  end: Schema.optionalKey(googleTime),
  location: Schema.optionalKey(Schema.String),
  htmlLink: Schema.optionalKey(Schema.String),
  hangoutLink: Schema.optionalKey(Schema.String),
  attendees: Schema.optionalKey(
    Schema.Array(Schema.Struct({ email: Schema.optionalKey(Schema.String), responseStatus: Schema.String })),
  ),
})
const graphTime = Schema.Struct({ dateTime: Schema.NonEmptyString, timeZone: Schema.NonEmptyString })
const GraphEvent = Schema.Struct({
  id: Schema.NonEmptyString,
  subject: Schema.String,
  isCancelled: Schema.Boolean,
  isOrganizer: Schema.Boolean,
  responseStatus: Schema.Struct({ response: Schema.String }),
  start: graphTime,
  end: graphTime,
  location: Schema.optionalKey(Schema.Struct({ displayName: Schema.String })),
  webLink: Schema.optionalKey(Schema.String),
  onlineMeeting: Schema.optionalKey(Schema.NullOr(Schema.Struct({ joinUrl: Schema.optionalKey(Schema.String) }))),
})

export const calendarChoices = Effect.fn("InboxCalendar.choices")(function* (rpc: RPC, provider: "gmail" | "outlook") {
  if (provider === "outlook") {
    const primary = yield* decode(
      Schema.Struct({ id: Schema.NonEmptyString }),
      yield* rpc({ method: "GET", path: "/v1.0/me/calendar" }),
    )
    return (yield* decode(
      Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String })),
      yield* graphPages(rpc, { method: "GET", path: "/v1.0/me/calendars", query: { $top: 100 } }),
    )).map((calendar) => ({ id: calendar.id === primary.id ? "primary" : calendar.id, name: calendar.name }))
  }
  const found = new Map<string, { id: string; name: string }>()
  const progress: { token?: string; seen: Set<string> } = { seen: new Set() }
  for (const _ of Array.from({ length: 100 })) {
    const page = yield* decode(
      Schema.Struct({
        items: Schema.optionalKey(
          Schema.Array(
            Schema.Struct({
              id: Schema.NonEmptyString,
              summary: Schema.String,
              primary: Schema.optionalKey(Schema.Boolean),
              accessRole: Schema.String,
            }),
          ),
        ),
        nextPageToken: Schema.optionalKey(Schema.NonEmptyString),
      }),
      yield* rpc({
        method: "GET",
        path: "/calendar/v3/users/me/calendarList",
        query: { maxResults: 100, pageToken: progress.token },
      }),
    )
    page.items
      ?.filter((calendar) => ["owner", "writer", "reader"].includes(calendar.accessRole))
      .forEach((calendar) =>
        found.set(calendar.id, { id: calendar.primary ? "primary" : calendar.id, name: calendar.summary }),
      )
    if (found.size > 10000) return yield* new Failure({ reason: "response_limit" })
    if (!page.nextPageToken) return [...found.values()]
    if (progress.seen.has(page.nextPageToken)) return yield* new Failure({ reason: "invalid_response" })
    progress.seen.add(page.nextPageToken)
    progress.token = page.nextPageToken
  }
  return yield* new Failure({ reason: "response_limit" })
})

/** Snapshot only: baselines, invitation admission and material-change decisions belong to the durable caller. */
export const calendarSnapshot = Effect.fn("InboxCalendar.snapshot")(function* (
  rpc: RPC,
  provider: "gmail" | "outlook",
  calendar: string,
  identity: string,
  horizon: { start: string; end: string },
) {
  if (
    !calendar ||
    !identity ||
    !Number.isFinite(Date.parse(horizon.start)) ||
    !Number.isFinite(Date.parse(horizon.end)) ||
    Date.parse(horizon.end) <= Date.parse(horizon.start) ||
    Date.parse(horizon.end) - Date.parse(horizon.start) > 100 * 86400000
  )
    return yield* new Failure({ reason: "invalid_response" })
  if (provider === "outlook") {
    const events = yield* decode(
      Schema.Array(GraphEvent),
      yield* graphPages(rpc, {
        method: "GET",
        path:
          calendar === "primary"
            ? "/v1.0/me/calendar/calendarView"
            : `/v1.0/me/calendars/${encodeURIComponent(calendar)}/calendarView`,
        headers: { prefer: 'IdType="ImmutableId", outlook.timezone="UTC"' },
        query: { startDateTime: horizon.start, endDateTime: horizon.end, $top: 100 },
      }),
    )
    return events.map(
      (event): CalendarEvent => ({
        id: event.id,
        title: event.subject,
        start: JSON.stringify(event.start),
        end: JSON.stringify(event.end),
        location: event.location?.displayName,
        join: httpsLink(event.onlineMeeting?.joinUrl),
        href: httpsLink(event.webLink),
        cancelled: event.isCancelled,
        status: event.isCancelled ? "cancelled" : "confirmed",
        // responseStatus is the calendar owner's status: a shared calendar is not proof of this user's invitation.
        pending:
          calendar === "primary" &&
          !event.isCancelled &&
          !event.isOrganizer &&
          event.responseStatus.response === "notResponded",
      }),
    )
  }
  const found = new Map<string, CalendarEvent>()
  const progress: { token?: string; seen: Set<string> } = { seen: new Set() }
  for (const _ of Array.from({ length: 100 })) {
    const page = yield* decode(
      Schema.Struct({
        kind: Schema.Literal("calendar#events"),
        accessRole: Schema.Literals(["owner", "writer", "reader", "freeBusyReader"]),
        items: Schema.optionalKey(Schema.Array(GoogleEvent)),
        nextPageToken: Schema.optionalKey(Schema.NonEmptyString),
      }),
      yield* rpc({
        method: "GET",
        path: `/calendar/v3/calendars/${encodeURIComponent(calendar)}/events`,
        query: {
          timeMin: horizon.start,
          timeMax: horizon.end,
          singleEvents: true,
          showDeleted: true,
          maxResults: 100,
          pageToken: progress.token,
        },
      }),
    )
    if (page.accessRole === "freeBusyReader") return yield* new Failure({ reason: "invalid_response" })
    for (const event of page.items ?? []) {
      if (event.status !== "cancelled" && (!event.start || !event.end))
        return yield* new Failure({ reason: "invalid_response" })
      found.set(event.id, {
        id: event.id,
        title: event.summary,
        start: event.start ? JSON.stringify(event.start) : undefined,
        end: event.end ? JSON.stringify(event.end) : undefined,
        location: event.location,
        join: httpsLink(event.hangoutLink),
        href: httpsLink(event.htmlLink),
        cancelled: event.status === "cancelled",
        status: event.status,
        pending:
          event.status !== "cancelled" &&
          (event.attendees ?? []).some(
            (attendee) =>
              attendee.email?.toLowerCase() === identity.toLowerCase() && attendee.responseStatus === "needsAction",
          ),
      })
    }
    if (found.size > 10000) return yield* new Failure({ reason: "response_limit" })
    if (!page.nextPageToken) return [...found.values()]
    if (progress.seen.has(page.nextPageToken)) return yield* new Failure({ reason: "invalid_response" })
    progress.seen.add(page.nextPageToken)
    progress.token = page.nextPageToken
  }
  return yield* new Failure({ reason: "response_limit" })
})

function httpsLink(value: string | undefined) {
  if (!value || !URL.canParse(value)) return
  const url = new URL(value)
  if (url.protocol === "https:" && !url.username && !url.password) return url.href
}

/** Never infer cancellation from disappearance: a rolling horizon and provider omissions are not tombstones. */
export function reconcileCalendar(
  previous: readonly CalendarEvent[] | undefined,
  current: readonly CalendarEvent[],
  namespace: string,
) {
  const events = new Map(previous?.map((event) => [event.id, event]))
  const items: Pulled[] = []
  current.forEach((event) => {
    const old = events.get(event.id)
    if (event.cancelled && !old) return
    const merged =
      event.cancelled && old
        ? { ...old, ...Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined)) }
        : event
    const material = (value: CalendarEvent) =>
      JSON.stringify([value.title, value.start, value.end, value.location, value.join, value.cancelled, value.status])
    const changed = old
      ? material(old) !== material(merged) || (!old.pending && merged.pending)
      : previous !== undefined
    if ((!merged.cancelled && merged.pending && !old) || changed)
      items.push({
        source: "calendar",
        externalId: `${namespace}:${event.id}`,
        threadId: `${namespace}:${event.id}`,
        actor: "Calendar",
        snippet: [
          merged.title || "Calendar event",
          merged.cancelled ? "Cancelled" : merged.pending ? "Invitation" : "Updated",
          merged.location,
        ]
          .filter(Boolean)
          .join("\n"),
        reply: false,
        revision: material(merged),
        ...(merged.href ? { deepLink: merged.href } : {}),
      })
    events.set(event.id, merged)
  })
  const saved = [...events.values()]
  if (saved.length > 10000 || Buffer.byteLength(JSON.stringify(saved)) > 4 * 1024 * 1024)
    throw new Failure({ reason: "response_limit" })
  return { events: saved, items }
}
