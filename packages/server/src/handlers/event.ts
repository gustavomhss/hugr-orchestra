import { EventV2 } from "@orchestra/core/event"
import { OrchestraEvent } from "@orchestra/protocol/groups/event"
import { Effect, Schema, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { Api } from "../api"

export const encodeEvent = (data: unknown) => JSON.stringify(Schema.encodeUnknownSync(OrchestraEvent)(data))

// The bus hands every subscriber the same payload object, so the encoded JSON is memoized on it: N open streams pay
// one schema encode and one stringify per event instead of N. The entry dies with the payload.
export const eventFrames = (encode: (data: unknown) => string = encodeEvent) => {
  const frames = new WeakMap<object, string>()
  return (data: object): Sse.Event => {
    const cached = frames.get(data)
    const json = cached ?? encode(data)
    if (cached === undefined) frames.set(data, json)
    return { _tag: "Event", event: "message", id: undefined, data: json }
  }
}

// The renderer reads this stream on its main thread. On a loaded machine it can fall seconds behind while a model
// streams token deltas, and a subscriber that overflows is cut and must resync everything. The capacity is large
// intended to ride out short stalls. This bounds queued items, not bytes: payload sizes vary, and large events can
// still retain substantial memory per slow subscriber.
export const subscriberCapacity = 4096

function eventType(data: object) {
  const type = "type" in data ? data.type : undefined
  return typeof type === "string" ? type : "unknown"
}

export const eventStream = (events: EventV2.Interface, frame = eventFrames()) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  // Research, LSP and project events are published on this bus and are not in the public schema. Encoding
  // them used to throw and end every open subscription. Skip the event and say so once per type.
  const skipped = new Set<string>()
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(
    Stream.mapEffect((data) =>
      Effect.try({
        try: () => frame(data),
        catch: () => eventType(data),
      }).pipe(
        Effect.catch((type) =>
          skipped.has(type)
            ? Effect.succeed(undefined)
            : Effect.logWarning("event stream skipped an event the public schema cannot name", { type }).pipe(
                Effect.andThen(Effect.sync(() => skipped.add(type))),
                Effect.as(undefined),
              ),
        ),
      ),
    ),
    Stream.filter((event): event is Sse.Event => event !== undefined),
    Stream.pipeThroughChannel(Sse.encode()),
  )
  // A comment frame keeps idle connections open and tells the client the server is alive.
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
}

export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    // One memo for the whole server, so every subscriber reuses the first one's encode.
    const frame = eventFrames()
    return handlers.handleRaw("event.subscribe", () =>
      Effect.succeed(
        HttpServerResponse.stream(eventStream(events, frame), {
          contentType: "text/event-stream",
          headers: {
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
          },
        }),
      ),
    )
  }),
)
