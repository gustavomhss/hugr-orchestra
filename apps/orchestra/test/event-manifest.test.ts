import { describe, expect, test } from "bun:test"
import { SessionEvent } from "@orchestra/core/session/event"
import { EventManifest as SchemaEventManifest } from "@orchestra/schema/event-manifest"
import { RelayHook } from "@orchestra/schema/relay-hook"
import { Todo } from "@/session/todo"
import { EventManifest } from "@/event-manifest"

describe("public event manifest", () => {
  test("contains every latest public wire type once", () => {
    expect(EventManifest.Definitions).toBe(SchemaEventManifest.Definitions)
    expect(EventManifest.Latest).toBe(SchemaEventManifest.Latest)
    expect(EventManifest.Durable).toBe(SchemaEventManifest.Durable)
    expect(EventManifest.Latest.size).toBe(110)
    expect(EventManifest.Latest.get("session.next.step.ended")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Latest.get("todo.updated")).toBe(Todo.Event.Updated)
    expect(EventManifest.Latest.get("relay.hook.decided")).toBe(RelayHook.Decided)
    expect(EventManifest.Latest.has("ide.installed")).toBe(false)
    expect(EventManifest.Latest.has("server.connected")).toBe(true)
    expect(EventManifest.Latest.has("global.disposed")).toBe(true)
    expect(EventManifest.Latest.has("mcp.status.changed")).toBe(true)
  })

  test("native policy and archive events retain exact public and durable identity", () => {
    expect(SessionEvent.SubagentModelsChanged.type).toBe("session.next.subagent.models.changed")
    expect(SessionEvent.ArchiveChanged.type).toBe("session.next.archive.changed")
    expect(EventManifest.Latest.get("session.next.subagent.models.changed")).toBe(SessionEvent.SubagentModelsChanged)
    expect(EventManifest.Latest.get("session.next.archive.changed")).toBe(SessionEvent.ArchiveChanged)
    expect(EventManifest.Durable.get("session.next.subagent.models.changed.1")).toBe(SessionEvent.SubagentModelsChanged)
    expect(EventManifest.Durable.get("session.next.archive.changed.1")).toBe(SessionEvent.ArchiveChanged)
  })

  test("contains only the current step settlement versions", () => {
    expect(EventManifest.Durable.has("session.next.step.ended.1")).toBe(false)
    expect(EventManifest.Durable.get("session.next.step.ended.2")).toBe(SessionEvent.Step.Ended)
  })
})
