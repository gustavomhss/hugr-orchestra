import { describe, expect, test } from "bun:test"
import { SessionEvent } from "@orchestra/core/session/event"
import { PublicEventManifest } from "@orchestra/core/public-event-manifest"
import { OrchestraEvent } from "@orchestra/protocol/groups/event"
import { EventManifest as SchemaEventManifest } from "@orchestra/schema/event-manifest"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { Schema } from "effect"
import { Todo } from "@/session/todo"
import { EventManifest } from "@/event-manifest"

describe("public event manifest", () => {
  test("contains every latest public wire type once", () => {
    expect(EventManifest.Definitions).toBe(SchemaEventManifest.Definitions)
    expect(EventManifest.Latest).toBe(SchemaEventManifest.Latest)
    expect(EventManifest.Durable).toBe(SchemaEventManifest.Durable)
    expect(EventManifest.Latest.size).toBe(108)
    EventManifest.Latest.forEach((definition) => {
      expect(
        EventManifest.Definitions.filter(
          (candidate) =>
            candidate.type === definition.type &&
            (candidate.durable?.version ?? 0) >= (definition.durable?.version ?? 0),
        ),
      ).toEqual([definition])
    })
    expect(EventManifest.Latest.get("session.next.step.ended")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Latest.get("session.next.subagent.models.changed")).toBe(SessionEvent.SubagentModelsChanged)
    expect(EventManifest.Latest.get("todo.updated")).toBe(Todo.Event.Updated)
    expect(EventManifest.Latest.get("relay.hook.decided")).toBe(RelayHook.Decided)
    expect(EventManifest.Latest.has("ide.installed")).toBe(false)
    expect(EventManifest.Latest.has("server.connected")).toBe(true)
    expect(EventManifest.Latest.has("global.disposed")).toBe(true)
  })

  test("keeps the subagent model policy event on Core and Protocol surfaces", () => {
    expect(PublicEventManifest.Definitions).toBe(SchemaEventManifest.ServerDefinitions)
    expect(PublicEventManifest.Latest.get("session.next.subagent.models.changed")).toBe(
      SessionEvent.SubagentModelsChanged,
    )
    expect(OrchestraEvent.members.filter((member) => member === SessionEvent.SubagentModelsChanged)).toEqual([
      SessionEvent.SubagentModelsChanged,
    ])
    const event = {
      id: "evt_subagent_policy",
      type: "session.next.subagent.models.changed",
      durable: { aggregateID: "ses_test", seq: 1, version: 1 },
      data: { sessionID: "ses_test", timestamp: 1_717_171_717_000, policy: { mode: "inherit" } },
    }
    const decode = Schema.decodeUnknownSync(OrchestraEvent)
    expect(Schema.encodeSync(OrchestraEvent)(decode(event))).toEqual(event)
    expect(() => decode({ ...event, type: "session.next.subagent.models.unknown" })).toThrow()
  })

  test("contains only the current step settlement versions", () => {
    expect(EventManifest.Durable.has("session.next.step.ended.1")).toBe(false)
    expect(EventManifest.Durable.get("session.next.step.ended.2")).toBe(SessionEvent.Step.Ended)
  })
})
