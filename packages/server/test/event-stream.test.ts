import { describe, expect, test } from "bun:test"
import { EventV2 } from "@orchestra/core/event"
import { Effect, Stream } from "effect"
import { eventStream } from "../src/handlers/event"

type Subscriber = Parameters<EventV2.Interface["listen"]>[0]

// Only the event bus is a stand-in: it hands the stream's listener back so the test can publish while nothing reads.
function bus() {
  const listeners: Subscriber[] = []
  const service = {
    listen: (listener: Subscriber) =>
      Effect.sync(() => {
        listeners.push(listener)
        return Effect.void
      }),
  } as unknown as EventV2.Interface
  const publish = (count: number) =>
    Effect.forEach(
      Array.from({ length: count }),
      () =>
        Effect.forEach(
          listeners,
          (listener) => listener({ id: EventV2.ID.create(), type: "server.connected", data: {} } as never),
          { discard: true },
        ),
      { discard: true },
    )
  return { service, publish }
}

describe("event stream", () => {
  test("keeps a reader that falls behind by a burst of events", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events = bus()
          const pull = yield* Stream.toPull(eventStream(events.service))
          const decoder = new TextDecoder()
          const frames = (chunk: ReadonlyArray<Uint8Array>) =>
            chunk
              .map((bytes) => decoder.decode(bytes))
              .join("")
              .split("data:").length - 1

          // The first pull installs the subscriber and delivers the connected event.
          let received = frames(yield* pull)
          // A slow renderer reads nothing while a model streams: the queue has to hold the whole burst.
          yield* events.publish(1000)
          while (received < 1001) received += frames(yield* pull)

          expect(received).toBe(1001)
        }),
      ),
    ))
})
