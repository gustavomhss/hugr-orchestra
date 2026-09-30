import { describe, expect, test } from "bun:test"
import { FileSystem, Integration, MaestroEvent, Permission, Project, Reference, Session, Workspace } from "../src"
import { EventManifest } from "../src/event-manifest"
import { IdeEvent } from "../src/ide-event"
import { SessionEvent } from "../src/session-event"
import { SessionTodo } from "../src/session-todo"
import { SessionV1 } from "../src/session-v1"
import { WorkspaceEvent } from "../src/workspace-event"

describe("public event manifest", () => {
  test("owns the complete public event surface", () => {
    expect(EventManifest.ServerDefinitions.length).toBe(77)
    expect(EventManifest.Definitions.length).toBe(107)
    expect(SessionV1.Event.Definitions).toEqual([
      SessionV1.Event.Created,
      SessionV1.Event.Updated,
      SessionV1.Event.Deleted,
      SessionV1.Event.MessageUpdated,
      SessionV1.Event.MessageRemoved,
      SessionV1.Event.PartUpdated,
      SessionV1.Event.PartRemoved,
      SessionV1.Event.PartDelta,
      SessionV1.Event.Diff,
      SessionV1.Event.Error,
    ])
    expect(EventManifest.Latest.size).toBe(102)
    expect(EventManifest.Durable.size).toBe(54)
  })

  test("uses canonical definitions for current public events", () => {
    expect(Session.Event).toBe(SessionEvent)
    expect(Session.Event.Definitions).toBe(SessionEvent.Definitions)
    expect(Workspace.Event).toBe(WorkspaceEvent)
    expect(Workspace.Event.Definitions).toBe(WorkspaceEvent.Definitions)
    expect(EventManifest.Latest.get("session.next.step.ended")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Latest.get("todo.updated")).toBe(SessionTodo.Event.Updated)
    expect(EventManifest.Latest.get("maestro.approval.decided")).toBe(MaestroEvent.Approval.Decided)
    expect(EventManifest.Latest.get("maestro.approval.presented")).toBe(MaestroEvent.Approval.Presented)
    expect(EventManifest.Latest.get("maestro.approval.consumed")).toBe(MaestroEvent.Approval.ConsumedV2)
    expect(EventManifest.Latest.get("maestro.approval.reserved")).toBe(MaestroEvent.Approval.ReservedV2)
    expect(EventManifest.Latest.get("maestro.admission.decided")).toBe(MaestroEvent.Admission.Decided)
    expect(EventManifest.Latest.get("maestro.plan_revision.recorded")).toBe(MaestroEvent.PlanRevision.Recorded)
    expect(EventManifest.Latest.get("maestro.context.recorded")).toBe(MaestroEvent.Context.Recorded)
    expect(EventManifest.Latest.get("maestro.clarification.decided")).toBe(MaestroEvent.Clarification.Decided)
    expect(EventManifest.Latest.get("maestro.scope.decided")).toBe(MaestroEvent.Scope.Decided)
    expect(EventManifest.Latest.get("maestro.held.entered")).toBe(MaestroEvent.Held.Entered)
    expect(EventManifest.Latest.get("maestro.validation.recorded")).toBe(MaestroEvent.Validation.RecordedV3)
    expect(EventManifest.Latest.get("maestro.review.received")).toBe(MaestroEvent.Review.Received)
    expect(EventManifest.Latest.get("maestro.authorization.granted")).toBe(MaestroEvent.Authorization.Granted)
    expect(EventManifest.Latest.get("maestro.dispatch.reserved")).toBe(MaestroEvent.Dispatch.ReservedV2)
    expect(EventManifest.Latest.get("project.updated")).toBe(Project.Event.Updated)
    expect(Project.Event.Definitions).toEqual([Project.Event.Updated])
    expect(FileSystem.Event.Definitions).toEqual([FileSystem.Event.Edited])
    expect(Integration.Event.Definitions).toEqual([Integration.Event.Updated, Integration.Event.ConnectionUpdated])
    expect(Permission.Event.Definitions).toEqual([Permission.Event.Asked, Permission.Event.Replied])
    expect(Reference.Event.Definitions).toEqual([Reference.Event.Updated])
    expect(EventManifest.Latest.has("ide.installed")).toBe(false)
    expect(IdeEvent.Definitions).toEqual([IdeEvent.Installed])
    expect(EventManifest.Definitions.slice(62, 65)).toEqual([
      SessionV1.Event.PartDelta,
      SessionV1.Event.Diff,
      SessionV1.Event.Error,
    ])
    expect(EventManifest.Durable.has("session.next.step.ended.1")).toBe(false)
    expect(EventManifest.Durable.get("session.next.step.ended.2")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Durable.get("maestro.plan_revision.recorded.1")).toBe(MaestroEvent.PlanRevision.Recorded)
    expect(EventManifest.Durable.get("maestro.context.recorded.1")).toBe(MaestroEvent.Context.Recorded)
    expect(EventManifest.Durable.get("maestro.validation.recorded.1")).toBe(MaestroEvent.Validation.Recorded)
    expect(EventManifest.Durable.get("maestro.validation.recorded.2")).toBe(MaestroEvent.Validation.RecordedV2)
    expect(EventManifest.Durable.get("maestro.validation.recorded.3")).toBe(MaestroEvent.Validation.RecordedV3)
    expect(EventManifest.Durable.get("maestro.review.received.1")).toBe(MaestroEvent.Review.Received)
    expect(EventManifest.Durable.get("maestro.authorization.granted.1")).toBe(MaestroEvent.Authorization.Granted)
    expect(EventManifest.Durable.get("maestro.dispatch.reserved.1")).toBe(MaestroEvent.Dispatch.Reserved)
    expect(EventManifest.Durable.get("maestro.dispatch.reserved.2")).toBe(MaestroEvent.Dispatch.ReservedV2)
  })
})
