import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { eq } from "drizzle-orm"
import { LLMEvent } from "@orchestra/llm"
import { ActivityMonitor } from "@orchestra/core/activity-monitor"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { Flag } from "@orchestra/core/flag/flag"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Omni } from "@orchestra/core/omni"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { createLLMEventPublisher } from "@orchestra/core/session/runner/publish-llm-event"
import { WorkspaceV2 } from "@orchestra/core/workspace"
import { expectSpawn } from "./fixture/omni-expect"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make("project"), workspaceID: WorkspaceV2.ID.make("wrk_test") })),
)
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, EventV2.node, Location.node]), [[Location.node, locationLayer]]),
)

it.live.skipIf(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off")(
  "durable tool success marks only the matching tree's work finished",
  () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    const binding = yield* Effect.promise(() => Omni.load())
    const child = binding.spawn(process.execPath, ["-e", "process.stdin.resume()"], { stdin: "pipe" })
    Omni.count("spawns")
    yield* Effect.addFinalizer(() => Effect.promise(() => child.stop({ graceMs: 0 })).pipe(Effect.asVoid))
    const sample = { bytes: 100 }
    const observed = new Proxy(child, {
      get(target, key) {
        if (key === "observeTree") return async () => ({
          members: [{ pid: target.pid, parentPid: null, name: "runtime" }],
          physicalFootprintBytes: sample.bytes,
          footprintIdentity: "stable-test-tree",
        })
        const value: unknown = Reflect.get(target, key, target)
        return typeof value === "function" ? value.bind(target) : value
      },
    })
    const events = yield* EventV2.Service
    const database = yield* Database.Service
    const sessionID = SessionV2.ID.create()
    const publisher = createLLMEventPublisher(events, {
      sessionID,
      agent: "backend",
      model: { id: ModelV2.ID.make("model"), providerID: ProviderV2.ID.make("provider") },
    })
    yield* publisher.publish(LLMEvent.toolCall({ id: "call-matched", name: "bash", input: {} }))
    const assistantMessageID = yield* publisher.assistantMessageID("call-matched")
    const provenance = { sessionID, assistantMessageID, agentID: "backend", tool: "bash", callID: "call-matched" }
    const held = [observed]
    const matched = ActivityMonitor.observe(held[0], "runtime", "", provenance)
    const unmatched = ActivityMonitor.observe(held[0], "runtime", "", { ...provenance, callID: "call-other" })
    yield* Effect.promise(() => Promise.all([ActivityMonitor.inspect(matched), ActivityMonitor.inspect(unmatched)]))
    yield* Effect.promise(() => waitForClock())
    yield* publisher.publish(LLMEvent.toolResult({
      id: "call-matched", name: "bash", result: { type: "text", value: "done" },
    }))
    const persisted = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
    expect(persisted.find((event) => event.type === "session.next.tool.success.1")?.data).toMatchObject({
      sessionID, assistantMessageID, callID: "call-matched",
    })
    for (const bytes of [200, 300, 400]) {
      yield* Effect.promise(() => waitForClock())
      sample.bytes = bytes
      yield* Effect.promise(() => Promise.all([ActivityMonitor.inspect(matched), ActivityMonitor.inspect(unmatched)]))
    }
    const records = ActivityMonitor.snapshot().records
    expect(records.find((record) => record.recordID === matched)?.footprint?.hypothesis).toBe("compatible-with-logical-leak")
    expect(records.find((record) => record.recordID === unmatched)?.footprint?.hypothesis).toBe("insufficient")
    const tree = yield* Effect.promise(() => {
      const read = Reflect.get(held[0], "observeTree") as () => Promise<{ footprintIdentity?: string }>
      return read()
    })
    expect(tree.footprintIdentity).toBe("stable-test-tree")
  }),
  30_000,
)

async function waitForClock() {
  const seen = Date.now()
  while (Date.now() <= seen) await Bun.sleep(5)
}
