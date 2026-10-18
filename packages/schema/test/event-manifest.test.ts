import { describe, expect, test } from "bun:test"
import { FileSystem, Integration, MaestroEvent, Permission, Project, Reference, Session, Workspace } from "../src"
import { EventManifest } from "../src/event-manifest"
import { IdeEvent } from "../src/ide-event"
import { RelayHook } from "../src/relay-hook"
import { ResearchEvent } from "../src/research-event"
import { SessionEvent } from "../src/session-event"
import { SessionTodo } from "../src/session-todo"
import { SessionV1 } from "../src/session-v1"
import { WorkspaceEvent } from "../src/workspace-event"

// Deliberate public-name oracle for the joined contract, independent of the implementation's inventory assembly.
const publicEventTypes = [
  "models-dev.refreshed",
  "integration.updated",
  "integration.connection.updated",
  "catalog.updated",
  "session.created",
  "session.updated",
  "session.deleted",
  "session.v1.prompt.admitted",
  "message.updated",
  "message.removed",
  "message.part.updated",
  "message.part.removed",
  "session.next.agent.switched",
  "session.next.model.switched",
  "session.next.subagent.models.changed",
  "session.next.archive.changed",
  "session.next.moved",
  "session.next.prompted",
  "session.next.prompt.admitted",
  "session.next.context.updated",
  "session.next.synthetic",
  "session.next.shell.started",
  "session.next.shell.ended",
  "session.next.step.started",
  "session.next.step.ended",
  "session.next.step.failed",
  "session.next.text.started",
  "session.next.text.delta",
  "session.next.text.ended",
  "session.next.reasoning.started",
  "session.next.reasoning.delta",
  "session.next.reasoning.ended",
  "session.next.tool.input.started",
  "session.next.tool.input.delta",
  "session.next.tool.input.ended",
  "session.next.tool.called",
  "session.next.tool.progress",
  "session.next.tool.success",
  "session.next.tool.failed",
  "session.next.retried",
  "session.next.compaction.started",
  "session.next.compaction.delta",
  "session.next.compaction.ended",
  "session.next.revert.staged",
  "session.next.revert.cleared",
  "session.next.revert.committed",
  "maestro.approval.presented",
  "maestro.approval.decided",
  "maestro.approval.consumed",
  "maestro.approval.reserved",
  "maestro.admission.decided",
  "maestro.plan_revision.recorded",
  "maestro.context.recorded",
  "maestro.clarification.decided",
  "maestro.scope.decided",
  "maestro.held.entered",
  "maestro.validation.recorded",
  "maestro.review.received",
  "maestro.authorization.granted",
  "maestro.dispatch.reserved",
  "maestro.task.bound",
  "maestro.task.workflow_bound",
  "maestro.work_result.decided",
  "message.part.delta",
  "session.diff",
  "session.error",
  "installation.updated",
  "installation.update-available",
  "file.edited",
  "reference.updated",
  "permission.v2.asked",
  "permission.v2.replied",
  "plugin.added",
  "project.directories.updated",
  "file.watcher.updated",
  "pty.created",
  "pty.updated",
  "pty.exited",
  "pty.deleted",
  "question.v2.asked",
  "question.v2.replied",
  "question.v2.rejected",
  "relay.hook.decided",
  "todo.updated",
  "lsp.updated",
  "permission.asked",
  "permission.replied",
  "tui.prompt.append",
  "tui.command.execute",
  "tui.toast.show",
  "tui.session.select",
  "mcp.tools.changed",
  "mcp.status.changed",
  "mcp.browser.open.failed",
  "command.executed",
  "project.updated",
  "session.status",
  "session.idle",
  "question.asked",
  "question.replied",
  "question.rejected",
  "session.compacted",
  "vcs.branch.updated",
  "workspace.ready",
  "workspace.failed",
  "workspace.status",
  "worktree.ready",
  "worktree.failed",
  "server.connected",
  "global.disposed",
]

describe("public event manifest", () => {
  test("owns the complete public event surface", () => {
    expect(EventManifest.ServerDefinitions.length).toBe(88)
    expect(EventManifest.Definitions.length).toBe(119)
    expect(SessionV1.Event.Definitions).toEqual([
      SessionV1.Event.Created,
      SessionV1.Event.Updated,
      SessionV1.Event.Deleted,
      SessionV1.Event.PromptAdmitted,
      SessionV1.Event.MessageUpdated,
      SessionV1.Event.MessageRemoved,
      SessionV1.Event.PartUpdated,
      SessionV1.Event.PartRemoved,
      SessionV1.Event.PartDelta,
      SessionV1.Event.Diff,
      SessionV1.Event.Error,
    ])
    expectPublicTypes([...EventManifest.Latest.keys()])
    expectPublicTypes([...new Set(EventManifest.Definitions.map((event) => event.type))])
    expect(EventManifest.Latest.size).toBe(publicEventTypes.length)
    // Research's seven durable-only definitions are already canonical; the two Session settings events add two more,
    // and Maestro's durable-only workflow review hold one.
    expect(EventManifest.Durable.size).toBe(73)
    expect(EventManifest.Durable.get("maestro.task.workflow_review_held.1")).toBe(MaestroEvent.Task.WorkflowReviewHeld)
    expect(EventManifest.Latest.has("maestro.task.workflow_review_held")).toBe(false)
  })

  test("owns canonical research definitions only on the durable surface", () => {
    const research = [
      ["research.source.admitted", ResearchEvent.SourceAdmitted],
      ["research.source.requested", ResearchEvent.SourceRequested],
      ["research.source.attempted", ResearchEvent.SourceAttempted],
      ["research.record.committed", ResearchEvent.RecordCommitted],
      ["research.document.published", ResearchEvent.DocumentPublished],
      ["research.allowance.bound", ResearchEvent.AllowanceBound],
      ["research.allowance.charged", ResearchEvent.AllowanceCharged],
    ] as const
    expect([...ResearchEvent.Definitions]).toEqual(research.map((event) => event[1]))
    expect([...EventManifest.Durable.keys()].filter((key) => key.startsWith("research.")).sort()).toEqual(
      research.map((event) => `${event[0]}.1`).sort(),
    )
    research.forEach((event) => {
      expect(event[1].type, event[0]).toBe(event[0])
      expect(event[1].durable, event[0]).toEqual({ version: 1, aggregate: "sessionID" })
      expect(EventManifest.Durable.get(`${event[0]}.1`), event[0]).toBe(event[1])
      expect(EventManifest.ServerDefinitions, event[0]).not.toContain(event[1])
      expect(EventManifest.Definitions, event[0]).not.toContain(event[1])
      expect(EventManifest.Latest.has(event[0]), event[0]).toBe(false)
    })
  })

  test("public-name pin rejects missing, unknown and same-count replacement events", () => {
    const actual = [...EventManifest.Latest.keys()]
    expectPublicTypes(actual)
    expect(() => expectPublicTypes(actual.filter((type) => type !== SessionEvent.ArchiveChanged.type))).toThrow(
      SessionEvent.ArchiveChanged.type,
    )
    expect(() => expectPublicTypes([...actual, "unknown.event.join"])).toThrow("unknown.event.join")
    expect(() =>
      expectPublicTypes(
        actual.map((type) => (type === SessionEvent.ArchiveChanged.type ? "unknown.event.join" : type)),
      ),
    ).toThrow("unknown.event.join")
  })

  test.each([
    ["session.next.subagent.models.changed", SessionEvent.SubagentModelsChanged],
    ["session.next.archive.changed", SessionEvent.ArchiveChanged],
  ] as const)("includes canonical current and durable definition %s", (type, definition) => {
    expect(definition.type).toBe(type)
    expect(definition.durable).toEqual({ aggregate: "sessionID", version: 1 })
    expect(EventManifest.ServerDefinitions.filter((event) => event.type === type)).toEqual([definition])
    expect(EventManifest.Definitions.filter((event) => event.type === type)).toEqual([definition])
    expect(EventManifest.ServerDefinitions).toContain(definition)
    expect(EventManifest.Definitions).toContain(definition)
    expect(EventManifest.Latest.get(type)).toBe(definition)
    expect(EventManifest.Durable.get(`${type}.1`)).toBe(definition)
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
    expect(EventManifest.Latest.get("maestro.plan_revision.recorded")).toBe(MaestroEvent.PlanRevision.RecordedV3)
    expect(EventManifest.Latest.get("maestro.context.recorded")).toBe(MaestroEvent.Context.RecordedV2)
    expect(EventManifest.Latest.get("maestro.clarification.decided")).toBe(MaestroEvent.Clarification.Decided)
    expect(EventManifest.Latest.get("maestro.scope.decided")).toBe(MaestroEvent.Scope.Decided)
    expect(EventManifest.Latest.get("maestro.held.entered")).toBe(MaestroEvent.Held.Entered)
    expect(EventManifest.Latest.get("maestro.validation.recorded")).toBe(MaestroEvent.Validation.RecordedV3)
    expect(EventManifest.Latest.get("maestro.review.received")).toBe(MaestroEvent.Review.ReceivedV2)
    expect(EventManifest.Latest.get("maestro.authorization.granted")).toBe(MaestroEvent.Authorization.Granted)
    expect(EventManifest.Latest.get("maestro.dispatch.reserved")).toBe(MaestroEvent.Dispatch.ReservedV2)
    expect(EventManifest.Latest.get("maestro.task.bound")).toBe(MaestroEvent.Task.Bound)
    expect(EventManifest.Latest.get("maestro.work_result.decided")).toBe(MaestroEvent.WorkResult.Decided)
    expect(EventManifest.ServerDefinitions).toContain(MaestroEvent.WorkResult.Decided)
    expect(EventManifest.Latest.get("project.updated")).toBe(Project.Event.Updated)
    expect(Project.Event.Definitions).toEqual([Project.Event.Updated])
    expect(FileSystem.Event.Definitions).toEqual([FileSystem.Event.Edited])
    expect(Integration.Event.Definitions).toEqual([Integration.Event.Updated, Integration.Event.ConnectionUpdated])
    expect(Permission.Event.Definitions).toEqual([Permission.Event.Asked, Permission.Event.Replied])
    expect(Reference.Event.Definitions).toEqual([Reference.Event.Updated])
    expect(EventManifest.Latest.has("ide.installed")).toBe(false)
    expect(IdeEvent.Definitions).toEqual([IdeEvent.Installed])
    const legacyParts = EventManifest.Definitions.indexOf(SessionV1.Event.PartDelta)
    expect(legacyParts).toBeGreaterThanOrEqual(0)
    expect(EventManifest.Definitions.slice(legacyParts, legacyParts + 3)).toEqual([
      SessionV1.Event.PartDelta,
      SessionV1.Event.Diff,
      SessionV1.Event.Error,
    ])
    expect(EventManifest.Durable.has("session.next.step.ended.1")).toBe(false)
    expect(EventManifest.Durable.get("session.next.step.ended.2")).toBe(SessionEvent.Step.Ended)
    expect(EventManifest.Durable.get("maestro.plan_revision.recorded.1")).toBe(MaestroEvent.PlanRevision.Recorded)
    expect(EventManifest.Durable.get("maestro.context.recorded.1")).toBe(MaestroEvent.Context.Recorded)
    expect(EventManifest.Durable.get("maestro.plan_revision.recorded.2")).toBe(MaestroEvent.PlanRevision.RecordedV2)
    expect(EventManifest.Durable.get("maestro.context.recorded.2")).toBe(MaestroEvent.Context.RecordedV2)
    expect(EventManifest.Durable.get("maestro.validation.recorded.1")).toBe(MaestroEvent.Validation.Recorded)
    expect(EventManifest.Durable.get("maestro.validation.recorded.2")).toBe(MaestroEvent.Validation.RecordedV2)
    expect(EventManifest.Durable.get("maestro.validation.recorded.3")).toBe(MaestroEvent.Validation.RecordedV3)
    expect(EventManifest.Durable.get("maestro.review.received.1")).toBe(MaestroEvent.Review.Received)
    expect(EventManifest.Durable.get("maestro.review.received.2")).toBe(MaestroEvent.Review.ReceivedV2)
    expect(EventManifest.Durable.get("maestro.authorization.granted.1")).toBe(MaestroEvent.Authorization.Granted)
    expect(EventManifest.Durable.get("maestro.dispatch.reserved.1")).toBe(MaestroEvent.Dispatch.Reserved)
    expect(EventManifest.Durable.get("maestro.dispatch.reserved.2")).toBe(MaestroEvent.Dispatch.ReservedV2)
    expect(EventManifest.Durable.get("maestro.task.bound.1")).toBe(MaestroEvent.Task.Bound)
    expect(EventManifest.Durable.get("maestro.work_result.decided.1")).toBe(MaestroEvent.WorkResult.Decided)
    expect(EventManifest.Latest.get("relay.hook.decided")).toBe(RelayHook.Decided)
    expect(EventManifest.Durable.get("relay.hook.decided.1")).toBe(RelayHook.Decided)
  })
})

function expectPublicTypes(actual: readonly string[]) {
  expect(actual.toSorted()).toEqual(publicEventTypes.toSorted())
}
