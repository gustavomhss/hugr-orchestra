import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { Effect, Option, Stream } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"

const eventID = EventV2.ID.make("evt_maestro_restart_proof")
const sessionID = "ses_maestro_restart_proof"
const eventData = {
  sessionID,
  projectID: "prj_maestro_restart_proof",
  mode: "maestro" as const,
  predecessorID: "msg_maestro_restart_proof",
  reason: "restart-proof",
}

const layer = LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node]))

const mode = process.argv.at(2)
if (mode !== "write" && mode !== "read") throw new Error("Expected restart-proof mode: write or read")

await Effect.runPromise(
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    if (mode === "write") {
      const event = yield* events.publish(MaestroEvent.Held.Entered, eventData, { id: eventID })
      if (event.id !== eventID || JSON.stringify(event.data) !== JSON.stringify(eventData)) {
        return yield* Effect.die("MAESTRO_RESTART_WRITE_MISMATCH")
      }
      console.log("MAESTRO_RESTART_WRITE_OK")
      return
    }

    const event = yield* events
      .durable({ aggregateID: sessionID })
      .pipe(Stream.take(1), Stream.runHead, Effect.map(Option.getOrThrow))
    if (
      event.id !== eventID ||
      event.type !== MaestroEvent.Held.Entered.type ||
      JSON.stringify(event.data) !== JSON.stringify(eventData)
    ) {
      return yield* Effect.die("MAESTRO_RESTART_READ_MISMATCH")
    }
    console.log("MAESTRO_RESTART_READ_OK")
  }).pipe(Effect.provide(layer)),
)
