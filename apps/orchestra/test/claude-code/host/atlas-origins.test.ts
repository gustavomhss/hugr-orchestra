import { afterEach, expect } from "bun:test"
import { Effect } from "effect"
import { ClaudeHostBoundary } from "@/claude-code/host/boundary"
import { AtlasMemory } from "@/maestro/atlas-memory"
import { MessageID, PartID } from "@/session/schema"
import { disposeAllInstances } from "../../fixture/fixture"
import { CompactionFixture } from "./compaction-fixture"

afterEach(disposeAllInstances)

CompactionFixture.it.instance("repeated same-Session revert keeps one full plan origin after resumeAt clears", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing revert fixture")
    const plan = yield* f.plan("RETAINED-EXACT")
    const cut = yield* f.nextUser()
    yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { claudeCode: {
      sessionId: f.base.session_id, starts: { [cut.id]: "retained-native-boundary" },
    } } })
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: cut.id }, summary: undefined })
    const source = yield* f.sessions.get(f.chat.id)
    const history = yield* f.sessions.messages({ sessionID: f.chat.id })
    const reverted = ClaudeHostBoundary.revert(source, history, source.metadata?.claudeCode ?? {})
    const view = ClaudeHostBoundary.retained({ ...source, metadata: { claudeCode: reverted } }, history)
    expect(view.history.map((message) => message.info.id)).toEqual([f.user.id, f.assistant.id])
    expect(ClaudeHostBoundary.reference(view, { projectID: source.projectID, sessionID: source.id,
      admissionMessageID: plan.revision.admissionMessageID, producerMessageID: plan.part.messageID }))
      .toMatchObject({ admission: { info: { id: f.user.id } }, producer: { info: { id: f.assistant.id } } })
    const ids = new Map(view.history.map((message) => [message.info.id, message.info.id]))
    const repeated = ClaudeHostBoundary.retain(view.session, history, ids, "revert")
    expect(repeated.messages[plan.part.messageID]).toEqual([
      { projectID: source.projectID, sessionID: source.id, messageID: plan.part.messageID },
    ])
    expect(repeated.messages[plan.revision.admissionMessageID]).toEqual([
      { projectID: source.projectID, sessionID: source.id, messageID: f.user.id },
    ])
    yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { claudeCode: {
      ...reverted, retainedView: repeated, resumeAt: undefined,
    } } })
    yield* f.sessions.clearRevert(f.chat.id)
    expect(JSON.stringify(yield* f.compact())).toContain("RETAINED-EXACT-ACCEPT-9")
    expect(f.ctx.abort.signal.aborted).toBe(false)
    const cleared = yield* f.sessions.get(f.chat.id)
    expect(cleared.revert).toBeUndefined()
    expect(cleared.metadata?.claudeCode?.resumeAt).toBeUndefined()
    const retained = ClaudeHostBoundary.retained(cleared, history)
    expect(ClaudeHostBoundary.origins(retained, plan.part.messageID)).toHaveLength(1)
    // Same Session with a different source message remains ambiguous, never collapsed by Session ID.
    yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { claudeCode: {
      ...cleared.metadata?.claudeCode, retainedView: { ...repeated, messages: { ...repeated.messages,
        [plan.part.messageID]: [...repeated.messages[plan.part.messageID]!,
          { projectID: source.projectID, sessionID: source.id, messageID: f.user.id }],
      } },
    } } })
    expect(yield* f.compact()).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_PLAN_OWNER_MISMATCH") })
  }))

CompactionFixture.it.instance("origin dedup compares complete triples and retains distinct source Sessions", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user) throw new Error("Missing origin fixture")
    const history = yield* f.sessions.messages({ sessionID: f.chat.id })
    const own = { projectID: f.chat.projectID, sessionID: f.chat.id, messageID: f.user.id }
    const foreign = yield* CompactionFixture.make()
    if (!foreign.user) throw new Error("Missing distinct source message")
    const other = { projectID: foreign.chat.projectID, sessionID: foreign.chat.id, messageID: foreign.user.id }
    const view = ClaudeHostBoundary.retained({ ...f.chat, metadata: { claudeCode: { retainedView: {
      schema: "native-retained-view-v1", projectID: f.chat.projectID, kind: "revert",
      messages: { [f.user.id]: [own, own, other, other] },
    } } } }, history)
    expect(ClaudeHostBoundary.origins(view, f.user.id)).toEqual([own, other])
    const clone = MessageID.ascending()
    const retained = ClaudeHostBoundary.retain(view.session, history, new Map([[f.user.id, clone]]), "fork")
    expect(retained.messages[clone]).toEqual([own, other])
  }))

CompactionFixture.it.instance("Atlas selection follows retained host admission keys across units, kinds and logical resumes", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make({ agent: "backend" })
    if (!f.user) throw new Error("Missing Atlas fixture")
    const admission: AtlasMemory.Admission = { schema: "atlas-resume-admission-v1", residency: "admitted",
      key: { projectID: f.chat.projectID, memoryOwner: "backend", logicalResumeID: "parent/first", kind: "task", id: "issue-42" },
      verdict: { ok: true, ref: { eventId: "FIRST-REF", contentHash: "first-hash" } }, text: "FIRST 🦴\r\nexact  " }
    const part = { sessionID: f.chat.id, messageID: f.user.id, type: "text" as const, synthetic: true }
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: admission.text, metadata: { [AtlasMemory.ADMISSION_KEY]: admission } })
    const first = yield* f.compact()
    if (!("hookSpecificOutput" in first) || first.hookSpecificOutput?.hookEventName !== "SessionStart")
      throw new Error("Missing actual compact context")
    expect(first.hookSpecificOutput.additionalContext).toContain(admission.text)
    expect(first.hookSpecificOutput.additionalContext).toContain(JSON.stringify(admission.verdict))
    const latest: AtlasMemory.Admission = { ...admission,
      key: { ...admission.key, logicalResumeID: "parent/second", kind: "pr", id: "42" },
      verdict: { ok: false, refusal: "store-unavailable" }, text: "EXACT PR REFUSAL 🦴\r\nno checkpoint  " }
    yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: latest.text, metadata: { [AtlasMemory.ADMISSION_KEY]: latest } })
    for (const invalid of [
      { ...admission, key: { ...admission.key, projectID: "foreign-project" } },
      { ...admission, key: { ...admission.key, memoryOwner: "jimmy" } },
      { ...admission, key: { ...admission.key, logicalResumeID: "" } },
      { ...admission, key: { ...admission.key, id: "" } },
      { ...admission, residency: "restored" },
    ]) yield* f.sessions.updatePart({ ...part, id: PartID.ascending(), text: admission.text,
      metadata: { [AtlasMemory.ADMISSION_KEY]: invalid } })
    yield* f.sessions.updatePart({ ...part, synthetic: false, id: PartID.ascending(), text: "MODEL-TEXT",
      metadata: { [AtlasMemory.ADMISSION_KEY]: { ...admission, text: "MODEL-TEXT" } } })
    const before = yield* f.sessions.messages({ sessionID: f.chat.id })
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    const result = yield* reopened.compact()
    if (!("hookSpecificOutput" in result) || result.hookSpecificOutput?.hookEventName !== "SessionStart")
      throw new Error("Missing refusal context")
    const text = result.hookSpecificOutput.additionalContext
    expect(text).toContain(latest.text)
    expect(text).toContain(JSON.stringify(latest.key))
    expect(text).toContain(JSON.stringify(latest.verdict))
    expect(text).toContain("historical evidence; not new permission")
    expect(text).not.toContain(admission.text)
    expect(text).not.toContain("FIRST-REF")
    expect(text).not.toContain("MODEL-TEXT")
    expect(yield* f.sessions.messages({ sessionID: f.chat.id })).toEqual(before)
  }))
