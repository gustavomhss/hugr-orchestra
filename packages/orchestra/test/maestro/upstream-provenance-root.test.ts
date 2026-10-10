import { describe, expect } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { PartTable, SessionTable } from "@orchestra/core/session/sql"
import { ProjectID } from "@orchestra/schema/project-id"
import { eq } from "drizzle-orm"
import { Effect } from "effect"
import { LogicalTask } from "@/maestro/logical-task"
import { UpstreamProvenance } from "@/maestro/upstream-provenance"
import { SessionID } from "@/session/schema"
import { Session } from "@/session/session"
import { provideTmpdirInstance } from "../fixture/fixture"
// Reuse the retained/native fixture and its scoped test layer; Bun registers the imported suite once.
import { corruptBinding, it, refusal, seed, settled, upstreamMemberID } from "./upstream-provenance.test"

describe("UpstreamProvenance.rootAuthority", () => {
  it.instance("observes nested Maestro dispatch with root authority and immediate attribution anchors", () => Effect.gen(function* () {
    const fixture = yield* seed({ nested: true })
    const sessions = yield* Session.Service
    expect(fixture.parent.id).not.toBe(fixture.root.id)
    expect(fixture.parent.parentID).toBe(fixture.root.id)
    expect(fixture.child.parentID).toBe(fixture.parent.id)
    expect(fixture.binding?.authoritySessionID).toBe(fixture.root.id)
    expect(fixture.task.state.metadata.parentSessionId).toBe(fixture.parent.id)
    const before = {
      parent: yield* sessions.messages({ sessionID: fixture.parent.id }),
      child: yield* sessions.messages({ sessionID: fixture.child.id }),
      binding: yield* LogicalTask.read(fixture.child.id),
    }
    const first = yield* UpstreamProvenance.observe(fixture.input)
    expect(first).toEqual({ ...fixture.input, schema: "maestro-upstream-attribution-v1", memberID: upstreamMemberID, profile: "upstream" })
    expect(first.parentSessionID).toBe(fixture.parent.id)
    expect(first.parentMessageID).toBe(fixture.input.parentMessageID)
    expect(first.parentCallID).toBe(fixture.task.callID)
    expect(yield* UpstreamProvenance.observe(fixture.input)).toEqual(first)
    expect({
      parent: yield* sessions.messages({ sessionID: fixture.parent.id }),
      child: yield* sessions.messages({ sessionID: fixture.child.id }),
      binding: yield* LogicalTask.read(fixture.child.id),
    }).toEqual(before)
  }))

  it.instance("observes privately settled nested dispatch with delivery owned by immediate parent", () => Effect.gen(function* () {
    const fixture = yield* settled({ nested: true })
    const sessions = yield* Session.Service
    expect(fixture.binding?.authoritySessionID).toBe(fixture.root.id)
    expect(fixture.delivery.sessionID).toBe(fixture.parent.id)
    const stored = yield* sessions.getPart({ sessionID: fixture.parent.id, messageID: fixture.parentMessage.id, partID: fixture.task.id })
    if (!stored || stored.type !== "tool" || stored.state.status !== "completed") throw new Error("expected privately settled nested Task")
    expect(stored.state.metadata).toMatchObject({ parentSessionId: fixture.parent.id, sessionId: fixture.child.id,
      upstreamSettlement: fixture.upstreamSettlement })
    const attribution = yield* UpstreamProvenance.observe(fixture.input)
    expect(attribution).toEqual({ ...fixture.input, schema: "maestro-upstream-attribution-v1", memberID: upstreamMemberID, profile: "upstream" })
    expect(yield* sessions.messages({ sessionID: fixture.root.id })).toEqual([])
  }))

  it.instance("rejects wrong logical root after accepting stored nested ancestry", () => Effect.gen(function* () {
    const fixture = yield* seed({ nested: true })
    const sessions = yield* Session.Service
    expect((yield* UpstreamProvenance.observe(fixture.input)).parentSessionID).toBe(fixture.parent.id)
    const other = yield* sessions.create({ agent: "maestro", title: "unrelated logical root" })
    yield* corruptBinding(fixture.child.id, { authoritySessionID: other.id })
    expect((yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")).message).toContain("task-authority-mismatch")
  }))

  it.instance("rejects cyclic, missing, and cross-project ancestors as named Task mismatch", () => Effect.gen(function* () {
    const database = yield* Database.Service
    const foreign = yield* provideTmpdirInstance(() => seed(), { git: true })
    yield* Effect.forEach(["cycle", "missing", "project"] as const, (variant) => Effect.gen(function* () {
      const fixture = yield* seed({ nested: true })
      expect(foreign.root.projectID).not.toBe(fixture.root.projectID)
      expect((yield* UpstreamProvenance.observe(fixture.input)).parentSessionID).toBe(fixture.parent.id)
      yield* database.db.update(SessionTable).set({ parent_id: variant === "cycle" ? fixture.parent.id :
        variant === "missing" ? SessionID.make("ses_missing_ancestor") : foreign.root.id })
        .where(eq(SessionTable.id, fixture.root.id)).run().pipe(Effect.orDie)
      expect((yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")).message).toContain(
        variant === "cycle" ? "session-parent-cycle" : variant === "missing" ? "session-unreadable" : "session-project-mismatch",
      )
    }))
  }))

  it.instance("rejects root-spoofed immediate Session, message, call, placement, and delivery anchors", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const database = yield* Database.Service
    const fixture = yield* seed({ nested: true })
    const rootDispatch = yield* seed()
    yield* refusal({ ...fixture.input, parentSessionID: fixture.root.id }, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    yield* refusal({ ...fixture.input, parentMessageID: rootDispatch.input.parentMessageID }, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    yield* refusal({ ...fixture.input, parentCallID: rootDispatch.input.parentCallID }, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    yield* sessions.updatePart({ ...fixture.task, state: { ...fixture.task.state, metadata: {
      ...fixture.task.state.metadata, parentSessionId: fixture.root.id,
    } } })
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_PARENT_MISMATCH")
    const background = yield* settled({ nested: true })
    yield* database.db.update(PartTable).set({ session_id: background.root.id })
      .where(eq(PartTable.id, background.delivery.id)).run().pipe(Effect.orDie)
    yield* refusal(background.input, "UPSTREAM_ATTRIBUTION_PROPOSAL_UNAVAILABLE")
  }))

  it.instance("reconciles expected Project against parent, author, and retained logical Task", () => Effect.gen(function* () {
    const fixture = yield* seed()
    yield* refusal({ ...fixture.input, projectID: ProjectID.make("prj_other") }, "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
    const foreign = yield* provideTmpdirInstance(() => seed(), { git: true })
    expect(foreign.parent.projectID).not.toBe(fixture.parent.projectID)
    yield* refusal({
      ...fixture.input, authorSessionID: foreign.child.id, authorMessageID: foreign.input.authorMessageID,
    }, "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
    const wrongBinding = yield* seed({ binding: { projectID: foreign.parent.projectID } })
    yield* refusal(wrongBinding.input, "UPSTREAM_ATTRIBUTION_PROJECT_MISMATCH")
  }))

  it.instance("reconciles retained logical Task identity, member, authority, and host-selected Task", () => Effect.gen(function* () {
    const sessions = yield* Session.Service
    const fixture = yield* seed()
    yield* refusal({ ...fixture.input, logicalTaskID: fixture.child.id }, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
    const other = yield* sessions.create({ agent: "maestro" })
    yield* Effect.forEach([
      { taskId: "ses_replacement" }, { memberID: "general" }, { authoritySessionID: other.id },
    ], (binding) => Effect.gen(function* () {
      const changed = yield* seed({ binding })
      yield* refusal(changed.input, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
    }))
    yield* sessions.updatePart({ ...fixture.task, state: {
      ...fixture.task.state, metadata: { ...fixture.task.state.metadata, workResult: { ...fixture.task.state.metadata.workResult, taskId: "tsk_other" } },
    } })
    yield* refusal(fixture.input, "UPSTREAM_ATTRIBUTION_TASK_MISMATCH")
  }))
})
