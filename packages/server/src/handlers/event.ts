import { EventV2 } from "@orchestra/core/event"
import { OrchestraEvent } from "@orchestra/protocol/groups/event"
import { Effect, Schema, Stream } from "effect"
import { HttpServerResponse } from "effect/unstable/http"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import * as Sse from "effect/unstable/encoding/Sse"
import { Api } from "../api"

function eventData(data: unknown): Sse.Event {
  return {
    _tag: "Event",
    event: "message",
    id: undefined,
    data: JSON.stringify(Schema.encodeUnknownSync(OrchestraEvent)(data)),
  }
}

// The renderer reads this stream on its main thread. On a loaded machine it can fall seconds behind while a model
// streams token deltas, and a subscriber that overflows is cut and must resync everything. The capacity is large
// enough to ride out such a stall; an event is a few hundred bytes, so a full queue is still small.
export const subscriberCapacity = 4096

export const eventStream = (events: EventV2.Interface) => {
  const connected = {
    id: EventV2.ID.create(),
    type: "server.connected",
    data: {},
  }
  const output = Stream.unwrap(
    Effect.gen(function* () {
      // Acquiring the bounded stream installs its listener before readiness is observable.
      const live = yield* EventV2.allBounded(events, subscriberCapacity)
      return Stream.make(connected).pipe(Stream.concat(live))
    }),
  ).pipe(Stream.map(eventData), Stream.pipeThroughChannel(Sse.encode()))
  // A comment frame keeps idle connections open and tells the client the server is alive.
  const heartbeat = Stream.tick("15 seconds").pipe(Stream.map(() => ": heartbeat\n\n"))
  return output.pipe(Stream.merge(heartbeat, { haltStrategy: "left" }), Stream.encodeText)
}

export const EventHandler = HttpApiBuilder.group(Api, "server.event", (handlers) =>
  Effect.gen(function* () {
    const events = yield* EventV2.Service
    return handlers.handleRaw("event.subscribe", () =>
      Effect.succeed(
        HttpServerResponse.stream(eventStream(events), {
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
