import { describe, expect, test } from "bun:test"
import { EventV2 } from "@orchestra/core/event"
import { Effect, Stream } from "effect"
import { encodeEvent, eventFrames, eventStream } from "../src/handlers/event"

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
  // The real bus hands every listener the same payload object.
  const broadcast = (id: string) => {
    const event = { id, type: "server.connected", data: {} } as never
    return Effect.forEach(listeners, (listener) => listener(event), { discard: true })
  }
  return { service, publish, broadcast }
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

  test("encodes an event once for every subscriber and gives them the same frame", () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const events = bus()
          // The real encoder behind a counter: how often each event id was encoded.
          const encoded = new Map<string, number>()
          const frame = eventFrames((data) => {
            const id = (data as { id: string }).id
            encoded.set(id, (encoded.get(id) ?? 0) + 1)
            return encodeEvent(data)
          })
          const pulls = yield* Effect.forEach([1, 2, 3], () => Stream.toPull(eventStream(events.service, frame)))
          const decoder = new TextDecoder()
          // Each subscriber first sees its own connected event and heartbeat; the frame under test is the one with `id`.
          const frameOf = Effect.fnUntraced(function* (pull: (typeof pulls)[number], id: string) {
            let text = ""
            while (!text.includes(id)) text += (yield* pull).map((bytes) => decoder.decode(bytes)).join("")
            return text.split("\n\n").find((part) => part.includes(id))
          })
          // Install every subscriber's listener before the event is published.
          yield* Effect.forEach(pulls, (pull) => frameOf(pull, "server.connected"))

          const id = EventV2.ID.create()
          yield* events.broadcast(id)
          const received = yield* Effect.forEach(pulls, (pull) => frameOf(pull, id))

          expect(received[0]).toContain(id)
          expect(received[1]).toBe(received[0])
          expect(received[2]).toBe(received[0])
          expect(encoded.get(id)).toBe(1)
        }),
      ),
    ))
})
