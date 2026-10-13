import { afterEach, expect } from "bun:test"
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Effect } from "effect"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { LogicalTask } from "@/maestro/logical-task"
import { PartID } from "@/session/schema"
import { disposeAllInstances } from "../../fixture/fixture"
import { CompactionFixture } from "./compaction-fixture"

afterEach(disposeAllInstances)

function memory(output: HookJSONOutput) {
  if (!("hookSpecificOutput" in output) || output.hookSpecificOutput?.hookEventName !== "SessionStart")
    return undefined
  return output.hookSpecificOutput.additionalContext
}

CompactionFixture.it.instance("latest own-project/member Atlas Admission survives whole and foreign or reverted Admissions stay absent", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make({ agent: "backend" })
    if (!f.user) throw new Error("Missing Atlas history")
    const binding = yield* LogicalTask.ensure({ executionSessionID: f.chat.id, authoritySessionID: f.chat.id,
      projectID: f.chat.projectID, memberID: "backend", source: "host" })
    const admission: AtlasMemory.Admission = { schema: "atlas-resume-admission-v1", residency: "admitted",
      key: { projectID: f.chat.projectID, memoryOwner: "backend", logicalResumeID: "parent/resume-call", kind: "task", id: "T-atlas" },
      verdict: { ok: true, ref: { eventId: "ATLAS-REF-EXACT", contentHash: "atlas-content-hash" } },
      text: `${"historical fold ".repeat(500)}ATLAS-OWN-CRITICAL-END` }
    expect(binding.taskId).not.toBe(admission.key.id)
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.user.id,
      type: "text", text: admission.text, synthetic: true, metadata: { [AtlasMemory.ADMISSION_KEY]: admission } })
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.user.id,
      type: "text", synthetic: true, text: "FOREIGN-ATLAS", metadata: { [AtlasMemory.ADMISSION_KEY]: {
        ...admission, key: { ...admission.key, projectID: "foreign-project" }, text: "FOREIGN-ATLAS" } } })
    const later = yield* f.nextUser()
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: later.id,
      type: "text", synthetic: true, text: "FUTURE-ATLAS", metadata: { [AtlasMemory.ADMISSION_KEY]: { ...admission, text: "FUTURE-ATLAS" } } })
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

CompactionFixture.it.instance("a later Atlas refusal revokes an admitted fold even when its old restored copy is last", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make({ agent: "backend" })
    if (!f.user) throw new Error("Missing Atlas anchor")
    const binding = yield* LogicalTask.ensure({ executionSessionID: f.chat.id, authoritySessionID: f.chat.id,
      projectID: f.chat.projectID, memberID: "backend", source: "host" })
    const admission: AtlasMemory.Admission = { schema: "atlas-resume-admission-v1", residency: "admitted",
      key: { projectID: f.chat.projectID, memoryOwner: "backend", logicalResumeID: "parent/current-call", kind: "task", id: "issue-42" },
      verdict: { ok: true, ref: { eventId: "EXACT-REVOKED-REF", contentHash: "exact-revoked-hash" } }, text: "EXACT-REVOKED-FOLD" }
    expect(binding.taskId).not.toBe(admission.key.id)
    const part = { sessionID: f.chat.id, messageID: f.user.id, type: "text" as const, synthetic: true }
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: admission.text, metadata: { [AtlasMemory.ADMISSION_KEY]: admission } })
    expect(memory(yield* f.compact())).toContain(admission.text)
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: "WRONG-UNIT", metadata: { [AtlasMemory.ADMISSION_KEY]: {
      ...admission, residency: "restored", key: { ...admission.key, id: "T-foreign" }, text: "WRONG-UNIT" } } })
    expect(memory(yield* f.compact())).toContain(admission.text)
    expect(memory(yield* f.compact())).not.toContain("WRONG-UNIT")
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: "REVOKED", metadata: { [AtlasMemory.ADMISSION_KEY]: {
      ...admission, verdict: { ok: false, refusal: "store-unavailable" }, text: "REVOKED" } } })
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: admission.text, metadata: { [AtlasMemory.ADMISSION_KEY]: {
      ...admission, residency: "restored" } } })
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    const text = memory(yield* reopened.compact())
    expect(text).toContain("REVOKED")
    expect(text).toContain(JSON.stringify({ key: admission.key, residency: "admitted", verdict: { ok: false, refusal: "store-unavailable" } }))
    expect(text).not.toContain(admission.text)
    expect(text).not.toContain("EXACT-REVOKED-REF")
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
  }))
