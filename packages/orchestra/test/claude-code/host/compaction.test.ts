import { afterEach, expect } from "bun:test"
import path from "node:path"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { Effect, Layer, Schema } from "effect"
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Archive } from "@/continuity/archive"
import { ContinuityChecklist } from "@/continuity/checklist"
import { completeSnapshot } from "@/continuity/fork"
import { decode } from "@/continuity/memory"
import { LogicalTask } from "@/maestro/logical-task"
import { readPlanRevision } from "@/maestro/plan-revision"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { ContextRecallTool } from "@/tool/context-recall"
import { Tool } from "@/tool/tool"
import { disposeAllInstances } from "../../fixture/fixture"
import { CompactionFixture } from "./compaction-fixture"

afterEach(disposeAllInstances)

function memory(output: HookJSONOutput) {
  if (!("hookSpecificOutput" in output) || output.hookSpecificOutput?.hookEventName !== "SessionStart")
    return undefined
  return output.hookSpecificOutput.additionalContext
}

CompactionFixture.it.instance("compact hooks are registered at the documented native boundary; empty state injects nothing", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    expect(f.hooks.SessionStart).toHaveLength(1)
    expect(f.hooks.SessionStart?.[0]?.matcher).toBe("compact")
    expect(f.hooks.PostCompact).toHaveLength(1)
    expect(yield* f.compact()).toEqual({})
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
  }))

CompactionFixture.it.instance("compact-hook replay returns one durable working-memory block without duplicating Session history", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.todos.update({ sessionID: f.chat.id, todos: [
      { content: "KEEP-EXACT 🦴 next action", status: "in_progress", priority: "high" },
      { content: "finished must not reappear", status: "completed", priority: "low" },
      { content: "cancelled must not reappear", status: "cancelled", priority: "low" },
    ] })
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const first = memory(yield* f.compact())
    expect(first).toContain("KEEP-EXACT 🦴 next action")
    expect(first).not.toContain("finished must not reappear")
    expect(first).not.toContain("cancelled must not reappear")
    expect(first?.match(/# Orchestra working memory/g)).toHaveLength(1)
    expect(memory(yield* f.compact())).toBe(first)
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
  }))

CompactionFixture.it.instance("a fresh hook context reconstructs the same memory from retained logical Task receipts", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.task("T-PENDING")
    yield* f.task("T-ENDED", true)
    const first = memory(yield* f.compact())
    expect(first).toContain("T-PENDING")
    expect(first).toContain('"reason":"interrupted"')
    expect(first).toContain("grant-T-PENDING")
    expect(first).toContain('["src/task"]')
    expect(first).not.toContain("T-ENDED")
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    expect(memory(yield* reopened.compact())).toBe(first)
  }))

CompactionFixture.it.instance("parent, child seat and unrelated Session contexts read only their own durable memory", () =>
  Effect.gen(function* () {
    const parent = yield* CompactionFixture.make()
    const child = yield* CompactionFixture.make({ parentID: parent.chat.id, agent: "backend" })
    const foreign = yield* CompactionFixture.make()
    yield* parent.todos.update({ sessionID: parent.chat.id,
      todos: [{ content: "PARENT-ONLY", status: "pending", priority: "high" }] })
    yield* child.todos.update({ sessionID: child.chat.id,
      todos: [{ content: "CHILD-ONLY", status: "in_progress", priority: "high" }] })
    yield* foreign.todos.update({ sessionID: foreign.chat.id,
      todos: [{ content: "FOREIGN-ONLY", status: "pending", priority: "high" }] })
    const main = memory(yield* parent.compact())
    const nested = memory(yield* child.compact())
    expect(main).toContain("PARENT-ONLY")
    expect(main).not.toContain("CHILD-ONLY")
    expect(main).not.toContain("FOREIGN-ONLY")
    expect(nested).toContain("CHILD-ONLY")
    expect(nested).not.toContain("PARENT-ONLY")
    expect(nested).not.toContain("FOREIGN-ONLY")
  }))

CompactionFixture.it.instance("a new compact callback rereads durable edits instead of replaying stale generated memory", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.todos.update({ sessionID: f.chat.id,
      todos: [{ content: "OLD-ACTION", status: "pending", priority: "high" }] })
    expect(memory(yield* f.compact())).toContain("OLD-ACTION")
    yield* f.todos.update({ sessionID: f.chat.id,
      todos: [{ content: "NEW-ACTION", status: "pending", priority: "high" }] })
    const latest = memory(yield* f.compact())
    expect(latest).toContain("NEW-ACTION")
    expect(latest).not.toContain("OLD-ACTION")
  }))

for (const trigger of ["auto", "manual"] as const) {
  CompactionFixture.it.instance(`${trigger} PostCompact archives exact summary text without projecting a new user/model turn`, () =>
    Effect.gen(function* () {
      const f = yield* CompactionFixture.make()
      const before = yield* f.sessions.messages({ sessionID: f.chat.id })
      const text = "NATIVE-SUMMARY 🦴\nKeep exact value ZX-19 and unfinished operation."
      expect(yield* f.summary(text, trigger)).toEqual({})
      expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
      const refs = yield* f.archive.list(f.chat.id)
      expect(refs.length).toBeGreaterThan(0)
      const chunks = yield* Effect.forEach(refs, (ref) => f.archive.read({ sessionID: f.chat.id, id: ref.id }))
      expect(chunks.some((chunk) => chunk?.markdown.includes(`Claude Code compaction summary (${trigger}):`))).toBe(true)
      expect(chunks.some((chunk) => chunk?.markdown.includes(text))).toBe(true)
      const fresh = yield* Archive.Service.pipe(Effect.provide(Layer.fresh(Archive.layer)))
      expect(yield* fresh.list(f.chat.id)).toEqual(refs)
      const reopened = yield* Effect.forEach(refs, (ref) => fresh.read({ sessionID: f.chat.id, id: ref.id }))
      expect(reopened).toEqual(chunks)
    }))
}

CompactionFixture.it.instance("native summary is reachable through real context_recall and cannot be read from another Session", () =>
  Effect.gen(function* () {
    const own = yield* CompactionFixture.make()
    const foreign = yield* CompactionFixture.make()
    if (!own.assistant || !foreign.assistant) throw new Error("Missing recall fixture assistant")
    yield* own.summary("RECALL-EXACT native archive content 🦴")
    const refs = yield* own.archive.list(own.chat.id)
    const ref = refs[0]
    if (!ref) throw new Error("No native summary reference")
    const definition = yield* ContextRecallTool
    const tool = yield* Tool.init(definition)
    const asked: string[] = []
    const context = (f: typeof own, messageID: typeof own.assistant.id): Tool.Context => ({
      sessionID: f.chat.id, messageID, agent: f.ctx.agent, abort: f.ctx.abort.signal, messages: [],
      metadata: () => Effect.void,
      ask: (input) => Effect.sync(() => { asked.push(input.patterns[0]) }),
    })
    const decode = Schema.decodeUnknownSync(Schema.UnknownFromJsonString)
    const found = decode((yield* tool.execute({ reference: ref.id }, context(own, own.assistant.id))).output)
    expect(found).toMatchObject({ status: "found", extent: "archived_markdown", original_extent: "unknown" })
    expect(JSON.stringify(found)).toContain("RECALL-EXACT native archive content 🦴")
    const denied = decode((yield* tool.execute({ reference: ref.id }, context(foreign, foreign.assistant.id))).output)
    expect(denied).toMatchObject({ status: "unavailable" })
    expect(JSON.stringify(denied)).not.toContain("RECALL-EXACT")
    expect(asked).toEqual([own.chat.id, foreign.chat.id])
  }))

CompactionFixture.it.instance("PostCompact with no retained user publishes no fabricated archive context", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make({ user: false })
    expect(yield* f.summary("no source user", "auto")).toEqual({})
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual([])
  }))

CompactionFixture.it.instance("an actual corrupt archive makes PostCompact fail closed and abort the owning query", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.summary("verified positive archive control")
    expect((yield* f.archive.list(f.chat.id)).length).toBeGreaterThan(0)
    yield* f.fs.writeFileString(path.join(f.archiveDirectory, "index.json"), "{corrupt-index-control")
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const output = yield* f.summary("must not silently publish")
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("PostCompact failed closed") })
    expect(f.ctx.abort.signal.aborted).toBe(true)
    expect(yield* f.fs.readFileString(path.join(f.archiveDirectory, "index.json"))).toBe("{corrupt-index-control")
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
  }))

CompactionFixture.it.instance("required critical content beyond 6000 code units is returned whole with no invented recall reference", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const content = `${"whole record ".repeat(700)}CRITICAL-END grant ROOT-19 do not deploy 🦴`
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content, status: "pending", priority: "high" }] })
    const text = memory(yield* f.compact())
    expect(text).toContain(content)
    expect(text!.length).toBeGreaterThan(6000)
    expect(text).not.toContain("truncated")
    expect(text).not.toContain("context_recall for more")
  }))

CompactionFixture.it.instance("the last native task snapshot preserves exact IDs and a later empty ordinary snapshot clears stale side todos", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.assistant) throw new Error("Missing native todo fixture")
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "SIDE-TODO-FUTURE", status: "pending", priority: "high" }] })
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "tool", tool: "TaskList", callID: "native-task-list", state: { status: "completed", input: {}, output: "native task snapshot",
        title: "Tasks", metadata: { todos: [{ id: "EXACT-NATIVE-ID", content: "NATIVE-TODO-KEPT", status: "pending", priority: "high" }] },
        time: { start: 1, end: 2 } } })
    const native = memory(yield* f.compact())
    expect(native).toContain("NATIVE-TODO-KEPT")
    expect(native).toContain("EXACT-NATIVE-ID")
    expect(native).not.toContain("SIDE-TODO-FUTURE")
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "tool", tool: "todowrite", callID: "empty-task-snapshot", state: { status: "completed", input: {}, output: "cleared",
        title: "Todos", metadata: { todos: [] }, time: { start: 3, end: 4 } } })
    expect(yield* f.compact()).toEqual({})
  }))

CompactionFixture.it.instance("equal PostCompact summaries remain distinct observations with exact bytes, trigger and native owner", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const text = "DUPLICATE-OBSERVATION\r\n🦴 keep trailing blanks  "
    yield* f.summary(text, "manual")
    const first = yield* f.archive.list(f.chat.id)
    yield* f.summary(text, "manual")
    const both = yield* f.archive.list(f.chat.id)
    expect(both.length).toBe(first.length * 2)
    expect(new Set(both.map((ref) => ref.id)).size).toBe(both.length)
    const chunks = yield* Effect.forEach(both, (ref) => f.archive.read({ sessionID: f.chat.id, id: ref.id }))
    expect(chunks.every((chunk) => chunk?.markdown.includes(text))).toBe(true)
    expect(chunks.every((chunk) => chunk?.markdown.includes(f.base.session_id))).toBe(true)
    expect(chunks.every((chunk) => chunk?.markdown.includes("observed native summary only"))).toBe(true)
  }))

CompactionFixture.it.instance("owned v5 memory is read cold and withheld after covered source edits or a retained-view cut", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing continuity history")
    const part = yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "text", text: "Retained boundary evidence." })
    const history = yield* f.sessions.messages({ sessionID: f.chat.id })
    const snapshot = completeSnapshot(f.chat.id, history)
    if (!snapshot) throw new Error("No safe complete snapshot")
    const decoded = decode({ text: JSON.stringify({ now: { doing: "Verification pending", next: "OWNED-V5-NEXT", src: ["a1"] }, ops: [] }),
      snapshot, producerID: SessionID.descending(), host: { history, delegations: {}, member: false }, budget: 20000 })
    if ("check" in decoded) throw new Error(JSON.stringify(decoded))
    const checked = ContinuityChecklist.check(decoded, snapshot, { history, delegations: {}, member: false })
    if ("check" in checked) throw new Error(JSON.stringify(checked))
    yield* f.archive.writeMemory(f.chat.id, () => ({ context: { sessionID: f.chat.id, boundary: checked.artifact.boundary,
      text: checked.artifact.text, artifact: checked.artifact }, masks: [] }))
    const bytes = yield* f.fs.readFileString(path.join(f.archiveDirectory, "memory.json"))
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    expect(memory(yield* reopened.compact())).toContain(checked.artifact.text)
    expect(yield* f.fs.readFileString(path.join(f.archiveDirectory, "memory.json"))).toBe(bytes)
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
    yield* f.sessions.updatePart({ ...part, text: "Changed source invalidates fingerprint." })
    expect(memory(yield* f.compact())).not.toContain("OWNED-V5-NEXT")
    yield* f.sessions.updatePart(part)
    expect(memory(yield* f.compact())).toContain("OWNED-V5-NEXT")
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: f.user.id }, summary: undefined })
    expect(memory(yield* f.compact())).not.toContain("OWNED-V5-NEXT")
  }))

CompactionFixture.it.instance("foreign stored memory fails closed rather than adopting guessed owner metadata", () =>
  Effect.gen(function* () {
    const own = yield* CompactionFixture.make()
    const foreign = yield* CompactionFixture.make()
    yield* own.summary("archive directory positive control")
    yield* own.fs.writeFileString(path.join(own.archiveDirectory, "memory.json"), JSON.stringify({
      version: 1, sessionID: foreign.chat.id, entry: null, masks: [],
    }))
    const result = yield* own.compact()
    expect(result).toMatchObject({ continue: false, stopReason: expect.stringContaining("archive-corrupt-memory") })
    expect(own.ctx.abort.signal.aborted).toBe(true)
  }))

CompactionFixture.it.instance("latest own-project/member Atlas Admission survives whole and foreign or reverted Admissions stay absent", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make({ agent: "backend" })
    if (!f.user) throw new Error("Missing Atlas history")
    const admission: AtlasMemory.Admission = { schema: "atlas-resume-admission-v1", residency: "admitted",
      key: { projectID: f.chat.projectID, memoryOwner: "backend", logicalResumeID: "parent/resume-call", kind: "task", id: "T-atlas" },
      verdict: { ok: true, ref: { eventId: "ATLAS-REF-EXACT", contentHash: "atlas-content-hash" } },
      text: `${"historical fold ".repeat(500)}ATLAS-OWN-CRITICAL-END` }
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.user.id,
      type: "text", text: admission.text, synthetic: true, metadata: { [AtlasMemory.ADMISSION_KEY]: admission } })
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.user.id,
      type: "text", text: "FOREIGN-ATLAS", metadata: { [AtlasMemory.ADMISSION_KEY]: {
        ...admission, key: { ...admission.key, projectID: "foreign-project" }, text: "FOREIGN-ATLAS" } } })
    const later = yield* f.sessions.updateMessage({ ...f.user, id: MessageID.ascending() })
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: later.id,
      type: "text", text: "FUTURE-ATLAS", metadata: { [AtlasMemory.ADMISSION_KEY]: { ...admission, text: "FUTURE-ATLAS" } } })
    expect(memory(yield* f.compact())).toContain("FUTURE-ATLAS")
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: later.id }, summary: undefined })
    const text = memory(yield* f.compact())
    expect(text).toContain(admission.text)
    expect(text).toContain("ATLAS-REF-EXACT")
    expect(text).toContain("atlas-content-hash")
    expect(text).toContain("historical evidence; not new permission")
    expect(text).not.toContain("FUTURE-ATLAS")
    expect(text).not.toContain("FOREIGN-ATLAS")
  }))

CompactionFixture.it.instance("owned v4 Archive memory is applicable only while its exact covered/tail/boundary IDs remain retained", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing v4 history")
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.user.id,
      type: "text", text: "Retained user evidence." })
    const second = yield* f.sessions.updateMessage({ ...f.user, id: MessageID.ascending() })
    const boundary = yield* f.sessions.updateMessage({ ...f.assistant, id: MessageID.ascending(), parentID: second.id })
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: boundary.id,
      type: "text", text: "Retained completed boundary." })
    const history = yield* f.sessions.messages({ sessionID: f.chat.id })
    const snapshot = { sessionID: f.chat.id, boundary: boundary.id, tailStart: second.id, head: history.slice(0, 2),
      tail: history.slice(2), canRecall: true }
    const decoded = decode({ text: JSON.stringify({ ops: [{ op: "add", section: "findings", src: ["u1"], fields: {
      finding: "OWNED-V4-MEMORY", why: "Historical observation", status: "hypothesis", check: "Verify the retained receipt" } }] }),
      snapshot, producerID: SessionID.descending(), host: { history, delegations: {}, member: false }, budget: 20000 })
    if ("check" in decoded || decoded.artifact.version !== 4) throw new Error(JSON.stringify(decoded))
    const artifact = decoded.artifact
    yield* f.archive.writeMemory(f.chat.id, () => ({ context: { sessionID: f.chat.id, boundary: artifact.boundary,
      tailStart: artifact.tailStart, text: artifact.text, artifact }, masks: [] }))
    expect(memory(yield* f.compact())).toContain("OWNED-V4-MEMORY")
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: second.id }, summary: undefined })
    expect(memory(yield* f.compact())).not.toContain("OWNED-V4-MEMORY")
  }))

CompactionFixture.it.instance("plan is anchored to a visible producer/admission and retains acceptance beyond item eight across a cut", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing plan history")
    yield* f.plan("KEPT-PLAN")
    expect(memory(yield* f.compact())).toContain("KEPT-PLAN-ACCEPT-9")
    const later = yield* f.sessions.updateMessage({ ...f.user, id: MessageID.ascending() })
    const after = yield* f.sessions.updateMessage({ ...f.assistant, id: MessageID.ascending(), parentID: later.id })
    yield* f.plan("FUTURE-PLAN", later, after)
    expect(memory(yield* f.compact())).toContain("FUTURE-PLAN")
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: later.id }, summary: undefined })
    const text = memory(yield* f.compact())
    expect(text).toContain("KEPT-PLAN-ACCEPT-9")
    expect(text).toContain("DO-NOT-DEPLOY")
    expect(text).not.toContain("FUTURE-PLAN")
  }))

CompactionFixture.it.instance("a later Atlas refusal revokes an admitted fold even when its old restored copy is last", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make({ agent: "backend" })
    if (!f.user) throw new Error("Missing Atlas anchor")
    yield* LogicalTask.ensure({ executionSessionID: f.chat.id, authoritySessionID: f.chat.id,
      projectID: f.chat.projectID, memberID: "backend", source: "user", taskId: "T-current" })
    const admission: AtlasMemory.Admission = { schema: "atlas-resume-admission-v1", residency: "admitted",
      key: { projectID: f.chat.projectID, memoryOwner: "backend", logicalResumeID: "parent/current-call", kind: "task", id: "T-current" },
      verdict: { ok: true, ref: { eventId: "EXACT-REVOKED-REF", contentHash: "exact-revoked-hash" } }, text: "EXACT-REVOKED-FOLD" }
    const part = { sessionID: f.chat.id, messageID: f.user.id, type: "text" as const, synthetic: true }
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: admission.text, metadata: { [AtlasMemory.ADMISSION_KEY]: admission } })
    expect(memory(yield* f.compact())).toContain(admission.text)
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: "WRONG-UNIT", metadata: { [AtlasMemory.ADMISSION_KEY]: {
      ...admission, key: { ...admission.key, id: "T-foreign" }, text: "WRONG-UNIT" } } })
    expect(memory(yield* f.compact())).toContain(admission.text)
    expect(memory(yield* f.compact())).not.toContain("WRONG-UNIT")
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: "REVOKED", metadata: { [AtlasMemory.ADMISSION_KEY]: {
      ...admission, verdict: { ok: false, refusal: "store-unavailable" }, text: "REVOKED" } } })
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: admission.text, metadata: { [AtlasMemory.ADMISSION_KEY]: {
      ...admission, residency: "restored" } } })
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    const text = memory(yield* reopened.compact())
    expect(text).not.toContain(admission.text)
    expect(text).not.toContain("EXACT-REVOKED-REF")
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
  }))

CompactionFixture.it.instance("real typed logical binding conflict stops compact memory; genuine absence remains benign", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    expect(yield* f.compact()).toEqual({})
    const child = yield* f.task("T-CONFLICT")
    expect(memory(yield* f.compact())).toContain("T-CONFLICT")
    const database = yield* Database.Service
    const id = EventV2.ID.make(`evt_maestro_task_bound_${createHash("sha256").update(child.id).digest("hex")}`)
    const row = yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie)
    if (!row) throw new Error("Missing actual logical task event")
    yield* database.db.update(EventTable).set({ data: { ...row.data, executionSessionID: f.chat.id } })
      .where(eq(EventTable.id, id)).run().pipe(Effect.orDie)
    const rejected = yield* LogicalTask.read(child.id).pipe(Effect.flip)
    expect(rejected).toBeInstanceOf(LogicalTask.Denied)
    expect(rejected.reason).toBe("task-binding-mismatch")
    const output = yield* f.compact()
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("task-binding-mismatch") })
    expect(JSON.stringify(output)).not.toContain("T-CONFLICT")
    expect(f.ctx.abort.signal.aborted).toBe(true)
    expect((yield* database.db.select().from(EventTable).where(eq(EventTable.id, id)).get().pipe(Effect.orDie))?.data)
      .toEqual({ ...row.data, executionSessionID: f.chat.id })
  }))

CompactionFixture.it.instance("the actual V3 plan reader's typed hash refusal is preserved at the compact boundary", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const plan = yield* f.plan("PLAN-HASH-POSITIVE")
    expect(memory(yield* f.compact())).toContain("PLAN-HASH-POSITIVE-ACCEPT-9")
    const database = yield* Database.Service
    // Mutate the persisted fixture into schema-valid V3 with an invalid canonical hash; use the actual reader.
    yield* database.db.update(EventTable).set({ type: EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3),
      data: { ...plan.revision, revision: "v3", goal: { ...plan.revision.goal, value: "INVALID-HASH-BYTES" } } })
      .where(eq(EventTable.id, EventV2.ID.make(plan.revision.id))).run().pipe(Effect.orDie)
    const refused = yield* readPlanRevision(plan.revision.id).pipe(Effect.flip)
    expect(refused.reason).toBe("WORKFLOW_PLAN_HASH_MISMATCH")
    const output = yield* f.compact()
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("WORKFLOW_PLAN_HASH_MISMATCH") })
    expect(JSON.stringify(output)).not.toContain("INVALID-HASH-BYTES")
    expect(f.ctx.abort.signal.aborted).toBe(true)
  }))

CompactionFixture.it.instance("retained plan admission is revalidated durably without changing valid event or source bytes", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const plan = yield* f.plan("EXACT-PLAN")
    const database = yield* Database.Service
    const events = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, f.chat.id)).all().pipe(Effect.orDie)
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const output = memory(yield* f.compact())
    expect(output).toContain(JSON.stringify(plan.revision))
    expect(yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, f.chat.id)).all().pipe(Effect.orDie)).toEqual(events)
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
    const admission = events.find((row) => row.type === EventV2.versionedType(MaestroEvent.Admission.Decided.type, 1))
    if (!admission) throw new Error("Missing durable plan admission")
    yield* database.db.update(EventTable).set({ data: { ...admission.data, outcome: "CLARIFY", reason: "revoked fixture" } })
      .where(eq(EventTable.id, admission.id)).run().pipe(Effect.orDie)
    expect(yield* f.compact()).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_PLAN_ADMISSION_UNAVAILABLE") })
  }))
