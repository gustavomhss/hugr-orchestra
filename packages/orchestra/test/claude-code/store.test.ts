import { expect } from "bun:test"
import path from "node:path"
import { Cause, Effect, Exit } from "effect"
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { FSUtil } from "@orchestra/core/fs-util"
import { Database } from "bun:sqlite"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { ClaudeCodeStore } from "@/claude-code/store"
import { Session } from "@/session/session"
import { SessionContinuity } from "@/continuity/service"
import { ContinuityAdmission } from "@/continuity/admission"
import { estimate } from "@/continuity/masking"
import { Archive } from "@/continuity/archive"
import { MessageID, PartID } from "@/session/schema"
import { testEffect } from "../lib/effect"
import { makeHttp } from "../session/prompt.fixture"

const it = testEffect(makeHttp())
const key = { projectKey: "test-project", sessionId: "native-session" }
const base = { version: "2.1.289", sessionId: key.sessionId, isSidechain: false }

const fixture = Effect.gen(function* () {
  const sessions = yield* Session.Service
  const continuity = yield* SessionContinuity.Service
  const fs = yield* FSUtil.Service
  const archive = yield* Archive.Service
  const chat = yield* sessions.create({ title: "Native durability" })
  yield* sessions.setMetadata({ sessionID: chat.id, metadata: { claudeCode: { sessionId: key.sessionId } } })
  const user: SessionV1.User = { id: MessageID.ascending(), sessionID: chat.id, role: "user", agent: "claude", time: { created: 0 },
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") } }
  const assistant: SessionV1.Assistant = { id: MessageID.ascending(), sessionID: chat.id, role: "assistant", parentID: user.id,
    agent: "claude", mode: "claude", path: { cwd: "/repo", root: "/repo" }, time: { created: 1, completed: 2 }, cost: 0,
    providerID: user.model.providerID, modelID: user.model.modelID, finish: "tool-calls",
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } }
  const part: SessionV1.ToolPart = { id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "tool", tool: "read", callID: "mask-me",
    state: { status: "completed", input: { filePath: "huge.txt" }, output: "FULL ORIGINAL OUTPUT ".repeat(1200),
      title: "read", metadata: {}, time: { start: 1, end: 2 } } }
  yield* sessions.updateMessage(user)
  yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: user.id, type: "text", text: "native prompt" })
  yield* sessions.updateMessage(assistant)
  yield* sessions.updatePart(part)
  yield* sessions.updatePart({ id: PartID.ascending(), sessionID: chat.id, messageID: assistant.id, type: "reasoning", text: "opaque signed thinking", time: { start: 1, end: 2 } })
  yield* sessions.updatePart({ ...part, id: PartID.ascending(), callID: "keep-me",
    state: { status: "completed", input: {}, output: "other full output", title: "read", metadata: {}, time: { start: 1, end: 2 } } })
  const context = yield* Effect.context<never>()
  const create = (canRecall = true) => ClaudeCodeStore.create({ sessionID: chat.id, fs, sessions, continuity, userID: user.id, canRecall,
    run: (effect) => Effect.runPromiseWith(context)(effect), rewrite: () => true })
  const entries: SessionStoreEntry[] = [
    { ...base, type: "user", uuid: "u", parentUuid: null, message: { role: "user", content: "native prompt" } },
    { ...base, type: "assistant", uuid: "a", parentUuid: "u", message: { id: "api", role: "assistant", content: [
      { type: "thinking", thinking: "opaque signed thinking", signature: "signature-exact" },
      { type: "tool_use", id: "mask-me", name: "Read", input: { file_path: "huge.txt" } },
      { type: "tool_use", id: "keep-me", name: "Read", input: { file_path: "other.txt" } },
    ] } },
    { ...base, type: "user", uuid: "r", parentUuid: "a", message: { role: "user", content: [
      { type: "tool_result", tool_use_id: "mask-me", content: [{ type: "text", text: part.state.status === "completed" ? part.state.output : "" }, { type: "image", source: { data: "original-base64" } }] },
      { type: "tool_result", tool_use_id: "keep-me", content: "other full output" },
    ] } },
    { ...base, type: "attachment", uuid: "masked-image", parentUuid: "r", attachment: { type: "image", toolUseID: "mask-me", data: "original-base64" } },
    { ...base, type: "attachment", uuid: "kept-image", parentUuid: "masked-image", attachment: { type: "image", toolUseID: "keep-me", data: "kept-base64" } },
  ]
  return { sessions, continuity, fs, archive, chat, user, assistant, part, create, entries }
})

it.instance("native delivery receipts require exact joined admitted user text, not malformed or unrelated users", () => Effect.gen(function* () {
  const f = yield* fixture
  const next = { ...f.user, id: MessageID.ascending() }
  yield* f.sessions.updateMessage(next)
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: next.id, type: "text", text: "second prompt" })
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: next.id, type: "text", text: "ignored", ignored: true })
  const context = yield* Effect.context<never>()
  const deliveries: (readonly MessageID[])[] = []
  const store = ClaudeCodeStore.create({ sessionID: f.chat.id, fs: f.fs, sessions: f.sessions, continuity: f.continuity,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true, userID: next.id, userIDs: [f.user.id, next.id],
    onDelivery: (ids) => Effect.sync(() => { deliveries.push(ids) }) })
  const prompt = "native prompt\n\nsecond prompt"
  yield* store.record({ apiID: "assistant-api", messageID: f.assistant.id })
  const invalid = [undefined, null, 123, {}, [], [null], [{ type: "text" }], [{ type: "text", text: "unrelated" }],
    [{ type: "text", text: prompt }, { type: "image", source: {} }], "native prompt", "unrelated"]
  yield* Effect.promise(() => store.store.append(key, invalid.map((content, index) => ({ ...base, type: "user", uuid: `invalid-${index}`,
    parentUuid: null, message: { id: "assistant-api", role: "user", ...(content === undefined ? {} : { content }) } }))))
  yield* Effect.promise(() => store.store.append(key, [{ ...base, type: "user", uuid: "wrong-role", parentUuid: null,
    message: { role: "assistant", content: prompt } }]))
  const unacknowledged = yield* store.read
  expect(unacknowledged.mapping).toEqual({ "assistant-api": f.assistant.id })
  expect(unacknowledged.members).toEqual({})
  expect(unacknowledged.delivered).toEqual([])
  expect(deliveries).toEqual([])
  yield* Effect.promise(() => store.store.append(key, [{ ...base, type: "user", uuid: "receipt", parentUuid: null,
    message: { role: "user", content: [{ type: "text", text: prompt }] } }]))
  const delivered = yield* store.read
  expect(delivered.mapping.receipt).toBe(next.id)
  expect(delivered.members.receipt).toEqual([f.user.id, next.id])
  expect(delivered.delivered).toEqual([f.user.id, next.id])
  expect(deliveries).toEqual([[f.user.id, next.id]])
}), 60_000)

it.instance("native receipt cannot acknowledge absent or non-user admitted Session message IDs", () => Effect.gen(function* () {
  const f = yield* fixture
  const context = yield* Effect.context<never>()
  for (const id of [MessageID.ascending(), f.assistant.id]) {
    const store = ClaudeCodeStore.create({ sessionID: f.chat.id, fs: f.fs, sessions: f.sessions, continuity: f.continuity,
      run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true, userID: id, userIDs: [f.user.id, id] })
    yield* Effect.promise(() => store.store.append(key, [{ ...f.entries[0], uuid: `receipt-${id}` }]))
    expect((yield* store.read).mapping).toEqual({})
    expect((yield* store.read).members).toEqual({})
    expect((yield* store.read).delivered).toEqual([])
  }
}), 60_000)

it.instance("interruption-only store causes do not call onFailure; real failures still do", () => Effect.gen(function* () {
  const f = yield* fixture
  const context = yield* Effect.context<never>()
  const failures: string[] = []
  const create = (get: Session.Interface["get"]) => ClaudeCodeStore.create({ sessionID: f.chat.id, fs: f.fs, sessions: { ...f.sessions, get },
    continuity: f.continuity, run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true,
    onFailure: () => Effect.sync(() => { failures.push("failed") }) })
  const interrupted = yield* create(() => Effect.interrupt).prepare(key).pipe(Effect.exit)
  expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
  expect(failures).toEqual([])
  const failed = yield* create(() => Effect.die(new Error("archive-failure"))).prepare(key).pipe(Effect.exit)
  expect(Exit.isFailure(failed)).toBe(true)
  expect(failures).toEqual(["failed"])
}), 60_000)

it.instance("unsupported native fallback after explicit clear excludes huge preclear payload and counts exactly returned entries", () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  const later = [{ ...base, type: "user", uuid: "later", parentUuid: null, message: { role: "user", content: "after clear" } },
    { type: "tombstone", uuid: "unsupported", payload: "unsupported payload" }]
  yield* Effect.promise(() => store.store.append(key, [{ ...f.entries[0], message: { role: "user", content: "HUGE_PRECLEAR_PAYLOAD ".repeat(10_000) } },
    { type: "last-prompt", leafUuid: null, explicit: true }, ...later]))
  const result = yield* f.create().prepare(key)
  expect(result?.kind).toBe("fallback")
  expect(result?.reason).toBe("unsupported-native-suppression")
  expect(result?.entries.map((entry) => entry.uuid)).toEqual(later.map((entry) => entry.uuid))
  expect(result?.entries).toEqual(later)
  expect(JSON.stringify(result?.entries)).not.toContain("HUGE_PRECLEAR_PAYLOAD")
  expect(result?.tokens).toBe(estimate(later))
  expect(result?.nativeTokens).toBe(estimate(later))
}), 60_000)

it.instance("healthy native archive does not become sticky-failed after typed admission failure; authoritative followup load succeeds", () => Effect.gen(function* () {
  const f = yield* fixture
  const initial = f.create()
  yield* initial.record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => initial.store.append(key, f.entries))
  const failures: string[] = []
  const context = yield* Effect.context<never>()
  const state = { rewrite: true }
  const store = ClaudeCodeStore.create({ sessionID: f.chat.id, fs: f.fs, sessions: f.sessions, continuity: { ...f.continuity,
    admit: () => Effect.fail(new ContinuityAdmission.AdmissionError({ reason: "complete-prefix-hard-limit" })) }, userID: f.user.id,
    run: (effect) => Effect.runPromiseWith(context)(effect), rewrite: () => state.rewrite, canRecall: true,
    onFailure: () => Effect.sync(() => { failures.push("archive-failed") }) })
  const rejected = yield* store.prepare(key, { admit: true }).pipe(Effect.exit)
  expect(rejected._tag).toBe("Failure")
  expect(failures).toEqual([])
  state.rewrite = false
  const resumed = yield* store.prepare(key, { admit: true })
  expect(resumed?.kind).toBe("ready")
  expect(resumed?.entries).toEqual(f.entries)
  expect(failures).toEqual([])
}), 60_000)

it.instance("full native archive and mapping survive reload; masks remove only the mapped output and its attachments", () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  yield* store.record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => store.store.append(key, f.entries))
  const chunks = yield* f.archive.publish({ sessionID: f.chat.id, messages: yield* f.sessions.messages({ sessionID: f.chat.id }) })
  const reference = chunks.find((chunk) => chunk.first === f.assistant.id)!.id
  yield* f.archive.writeMemory(f.chat.id, () => ({ masks: [[f.part.id, reference]] }))
  const host = yield* f.continuity.prepare({ sessionID: f.chat.id, messages: yield* f.sessions.messages({ sessionID: f.chat.id }), canRecall: true })
  const masked = host.messages.flatMap((message) => message.parts).find((part) => part.id === f.part.id)
  expect(masked?.type === "tool" && masked.state.status === "completed").toBe(true)
  const loaded = yield* Effect.promise(() => f.create().store.load(key))
  expect(loaded?.map((entry) => entry.uuid)).toEqual(["u", "a", "r", "kept-image"])
  const result = loaded?.find((entry) => entry.uuid === "r")?.message as { content: { content: unknown }[] }
  expect(result.content[0].content).toBe(masked?.type === "tool" && masked.state.status === "completed" ? masked.state.output : "missing")
  expect(result.content[1].content).toBe("other full output")
  expect(loaded?.find((entry) => entry.uuid === "a")?.message).toEqual(f.entries[1].message)
  const native = yield* f.create().read
  expect(native.keys[0].entries).toEqual(f.entries)
  expect(native.mapping.api).toBe(f.assistant.id)
  expect(native.mapping.u).toBe(f.user.id)
  // Windows stat exposes synthetic POSIX bits rather than ACL permissions.
  if (process.platform !== "win32") {
    expect((yield* f.fs.stat(path.join(store.directory, "archive.sqlite"))).mode & 0o777).toBe(0o600)
    expect((yield* f.fs.stat(store.directory)).mode & 0o777).toBe(0o700)
  }
}), 60_000)

it.instance("append is serialized, duplicates deduplicate, UUID revisions remain archived, and subkeys stay separate", () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  yield* Effect.promise(() => Promise.all([store.store.append(key, f.entries), f.create().store.append(key, f.entries)]))
  expect((yield* store.read).keys[0].entries).toEqual(f.entries)
  const revision = { ...f.entries[0], message: { role: "user", content: "different" } }
  yield* Effect.tryPromise(() => store.store.append(key, [revision]))
  expect((yield* store.read).keys[0].entries.at(-1)).toEqual(revision)
  expect((yield* store.read).keys[0].entries[0]).toEqual(f.entries[0])
  const subkey = { ...key, subpath: "subagents/agent-1" }
  const side = [{ ...f.entries[0], uuid: "side", isSidechain: true }]
  yield* Effect.promise(() => store.store.append(subkey, side))
  expect(yield* Effect.promise(() => store.store.load(subkey))).toEqual(side)
  expect(yield* Effect.promise(() => store.store.listSubkeys!({ projectKey: key.projectKey, sessionId: key.sessionId }))).toEqual([subkey.subpath])
  expect((yield* store.read).mapping.side).toBeUndefined()
  expect(Exit.isFailure(yield* Effect.tryPromise(() => store.store.append({ ...key, sessionId: "foreign" }, f.entries)).pipe(Effect.exit))).toBe(true)
}), 60_000)

it.instance("without recall capability persisted masks cannot rewrite native tool results", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => f.create().store.append(key, f.entries))
  const chunks = yield* f.archive.publish({ sessionID: f.chat.id, messages: yield* f.sessions.messages({ sessionID: f.chat.id }) })
  yield* f.archive.writeMemory(f.chat.id, () => ({ masks: [[f.part.id, chunks.find((chunk) => chunk.first === f.assistant.id)!.id]] }))
  expect(yield* Effect.promise(() => f.create(false).store.load(key))).toEqual(f.entries)
}), 60_000)

it.instance("a masked short failure preserves its full text but still removes only its own images", () => Effect.gen(function* () {
  const f = yield* fixture
  if (f.part.state.status !== "completed") throw new Error("Expected completed fixture tool")
  const part = { ...f.part, state: { ...f.part.state, output: "exit 75: short failure", metadata: { exit: 75 }, attachments: [{
    id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id, type: "file" as const,
    mime: "image/png", url: "data:image/png;base64,original-base64",
  }] } }
  yield* f.sessions.updatePart(part)
  const entries = f.entries.map((entry) => entry.uuid === "r" ? { ...entry, message: { role: "user", content: [
    { type: "tool_result", tool_use_id: "mask-me", content: [{ type: "text", text: part.state.output }, { type: "image", source: { data: "original-base64" } }] },
    { type: "tool_result", tool_use_id: "keep-me", content: "other full output" },
  ] } } : entry)
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => f.create().store.append(key, entries))
  const chunks = yield* f.archive.publish({ sessionID: f.chat.id, messages: yield* f.sessions.messages({ sessionID: f.chat.id }) })
  yield* f.archive.writeMemory(f.chat.id, () => ({ masks: [[part.id, chunks.find((chunk) => chunk.first === f.assistant.id)!.id]] }))
  const loaded = yield* Effect.promise(() => f.create().store.load(key))
  expect(JSON.stringify(loaded)).not.toContain("original-base64")
  expect(JSON.stringify(loaded)).toContain("kept-base64")
  expect(JSON.stringify(loaded)).toContain("exit 75: short failure")
  expect((yield* f.create().read).keys[0].entries).toEqual(entries)
}), 60_000)

for (const failure of ["corrupt", "foreign"] as const) it.instance(`${failure} storage fails explicitly instead of becoming empty context`, () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  yield* Effect.promise(() => store.store.append(key, f.entries))
  if (failure === "corrupt") yield* f.fs.writeFileString(path.join(store.directory, "archive.sqlite"), "{broken")
  if (failure === "foreign") {
    const db = new Database(path.join(store.directory, "archive.sqlite"))
    db.query("UPDATE native_state SET payload=? WHERE id=1").run(JSON.stringify({ version: 1, sessionID: "foreign", mapping: {}, keys: [] }))
    db.close()
  }
  expect(Exit.isFailure(yield* Effect.tryPromise(() => f.create().store.load(key)).pipe(Effect.exit))).toBe(true)
}), 60_000)

it.instance("a dangling archive symlink is an unsafe path, not a never-written session", () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  yield* Effect.promise(() => store.store.append(key, f.entries))
  expect(yield* Effect.promise(() => store.store.load(key))).toEqual(f.entries)
  yield* f.fs.remove(path.join(store.directory, "archive.sqlite"))
  yield* f.fs.symlink(path.join(store.directory, "missing-target"), path.join(store.directory, "archive.sqlite"))
  const loaded = yield* Effect.tryPromise(() => f.create().store.load(key)).pipe(Effect.exit)
  expect(Exit.isFailure(loaded)).toBe(true)
  if (Exit.isFailure(loaded)) expect(Cause.pretty(loaded.cause)).toContain("claude-code-unsafe-path")
}), 60_000)

it.instance("revert and removed history cannot resume future native turns; immutable archive keeps them", () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  yield* store.record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => store.store.append(key, f.entries))
  yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: f.user.id }, summary: undefined })
  expect(yield* Effect.promise(() => f.create().store.load(key))).toEqual([])
  expect((yield* store.read).keys[0].entries).toEqual(f.entries)
  yield* f.sessions.clearRevert(f.chat.id)
  yield* f.sessions.removeMessage({ sessionID: f.chat.id, messageID: f.assistant.id })
  const loaded = yield* Effect.promise(() => f.create().store.load(key))
  expect(loaded?.map((entry) => entry.uuid)).toEqual(["u"])
}), 60_000)

it.instance("partial revert excludes removed native tool blocks and their descendants on a fresh store", () => Effect.gen(function* () {
  const f = yield* fixture
  const store = f.create()
  yield* store.record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => store.store.append(key, f.entries))
  yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: f.assistant.id, partID: f.part.id }, summary: undefined })
  const loaded = yield* Effect.promise(() => f.create().store.load(key))
  expect(loaded?.map((entry) => entry.uuid)).toEqual(["u"])
  expect((yield* store.read).keys[0].entries).toEqual(f.entries)
}), 60_000)

it.instance("two Orchestra owners sharing a native key never see each other's archives or mapping indexes", () => Effect.gen(function* () {
  const left = yield* fixture
  const right = yield* fixture
  yield* left.create().record({ apiID: "api", uuid: "a", messageID: left.assistant.id })
  yield* Effect.promise(() => left.create().store.append(key, left.entries))
  expect(yield* Effect.promise(() => right.create().store.load(key))).toBeNull()
  yield* right.create().record({ apiID: "api", uuid: "a", messageID: right.assistant.id })
  yield* Effect.promise(() => right.create().store.append(key, [...right.entries, { type: "queue-operation", operation: "owner-sentinel" }]))
  expect((yield* left.create().read).mapping.api).toBe(left.assistant.id)
  expect((yield* right.create().read).mapping.api).toBe(right.assistant.id)
  expect((yield* left.create().read).keys[0].entries).toEqual(left.entries)
  expect((yield* right.create().read).keys[0].entries.at(-1)).toEqual({ type: "queue-operation", operation: "owner-sentinel" })
}), 60_000)

it.instance("revert removes a restarted compact root and its unmapped summary, restoring the earlier authoritative chain", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  const compact = { ...base, type: "system", uuid: "compact", parentUuid: null, logicalParentUuid: "a", subtype: "compact_boundary",
    compactMetadata: { trigger: "manual", preTokens: 100 } }
  const summary = { ...base, type: "user", uuid: "summary", parentUuid: "compact", isCompactSummary: true,
    message: { role: "user", content: "SUMMARIZED_REVERTED_TEXT" } }
  yield* Effect.promise(() => f.create().store.append(key, [...f.entries, compact, summary]))
  yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: f.assistant.id }, summary: undefined })
  const loaded = yield* Effect.promise(() => f.create().store.load(key))
  expect(loaded?.map((entry) => entry.uuid)).toEqual(["u"])
  expect(JSON.stringify(loaded)).not.toContain("SUMMARIZED_REVERTED_TEXT")
  expect((yield* f.create().read).keys[0].entries.at(-1)).toEqual(summary)
}), 60_000)

it.instance("SQLite serializes two fresh store writers and retains both acknowledged unrelated batches", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* Effect.tryPromise(() => Promise.all([f.create().store.append(key, [{ type: "queue-operation", operation: "left-batch" }]),
    f.create().store.append(key, [{ type: "queue-operation", operation: "right-batch" }])]))
  expect((yield* f.create().read).keys[0].entries.map((entry) => entry.operation).toSorted()).toEqual(["left-batch", "right-batch"])
}), 60_000)

it.instance("retained SDK UUID revisions do not erase unrelated acknowledged rows or move the active leaf checkpoint", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => f.create().store.append(key, f.entries))
  const revision = { ...f.entries[1], message: { ...(f.entries[1].message as Record<string, unknown>),
    usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }
  const unrelated = { type: "queue-operation", operation: "acknowledged-batch" }
  yield* Effect.promise(() => f.create().store.append(key, [revision, unrelated]))
  const archive = yield* f.create().read
  expect(archive.keys[0].leaf).toBe("a")
  expect(archive.keys[0].entries.slice(0, f.entries.length)).toEqual(f.entries)
  expect(archive.keys[0].entries.at(-2)).toEqual(revision)
  expect(archive.keys[0].entries.at(-1)).toEqual(unrelated)
  const replay = yield* Effect.promise(() => f.create().store.load(key))
  expect(replay?.find((entry) => entry.uuid === "a")?.message).toEqual(revision.message)
}), 60_000)

it.instance("SDK retraction signals persist across fresh store replay without deleting the original native archive", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.create().record({ apiID: "api", uuid: "wire-block", messageID: f.assistant.id })
  yield* Effect.promise(() => f.create().store.append(key, f.entries))
  yield* f.create().retract(["wire-block"])
  const stored = yield* f.create().read
  expect(stored.retracted).toContain("a")
  expect(stored.keys[0].entries).toEqual(f.entries)
  const replay = yield* Effect.promise(() => f.create().store.load(key))
  expect(replay?.some((entry) => entry.uuid === "a")).toBe(false)
}), 60_000)

it.instance("a historical user revision during H2 admission preserves H1 membership and does not acknowledge H2", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* Effect.promise(() => f.create().store.append(key, [f.entries[0]]))
  const h2 = { ...f.user, id: MessageID.ascending() }
  yield* f.sessions.updateMessage(h2)
  const context = yield* Effect.context<never>()
  const second = ClaudeCodeStore.create({ sessionID: f.chat.id, fs: f.fs, sessions: f.sessions, continuity: f.continuity,
    run: (effect) => Effect.runPromiseWith(context)(effect), canRecall: true, rewrite: () => true, userID: h2.id, userIDs: [h2.id] })
  yield* Effect.promise(() => second.store.append(key, [{ ...f.entries[0], parentUuid: null, isMeta: false, promptId: "replayed-old-prompt" }]))
  const stored = yield* second.read
  expect(stored.mapping.u).toBe(f.user.id)
  expect(stored.members.u).toEqual([f.user.id])
  expect(stored.delivered).not.toContain(h2.id)
  expect(Exit.isFailure(yield* Effect.tryPromise(() => second.store.append(key, [{ ...f.entries[0], uuid: "invalid-session", sessionId: 123 }])).pipe(Effect.exit))).toBe(true)
}), 60_000)

it.instance("an explicit null checkpoint clears durable replay across fresh loads until a later native prompt", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* Effect.promise(() => f.create().store.append(key, [...f.entries, { type: "last-prompt", leafUuid: "r", explicit: true },
    { type: "last-prompt", leafUuid: null, explicit: true }]))
  expect(yield* Effect.promise(() => f.create().store.load(key))).toEqual([])
  expect(yield* Effect.promise(() => f.create().store.load(key))).toEqual([])
  expect((yield* f.create().read).keys[0].leaf).toBeNull()
  const next = { ...f.entries[0], uuid: "later", parentUuid: null, message: { role: "user", content: "later native input" } }
  yield* Effect.promise(() => f.create().store.append(key, [next]))
  expect((yield* Effect.promise(() => f.create().store.load(key)))?.map((entry) => entry.uuid)).toEqual(["later"])
}), 60_000)

it.instance("default fresh Store load promotes an up_to compact summary checkpoint to its preserved tail", () => Effect.gen(function* () {
  const f = yield* fixture
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  const compact = { ...base, type: "system", subtype: "compact_boundary", uuid: "partial", parentUuid: null, logicalParentUuid: "a",
    compactMetadata: { trigger: "manual", preTokens: 100, preservedMessages: { anchorUuid: "summary", uuids: ["a", "r", "masked-image", "kept-image"] } } }
  const summary = { ...base, type: "user", uuid: "summary", parentUuid: "partial", isCompactSummary: true, timestamp: "2026-10-08T00:00:00.000Z",
    message: { role: "user", content: "summary before retained tail" } }
  yield* Effect.promise(() => f.create().store.append(key, [...f.entries, compact, summary, { type: "last-prompt", leafUuid: "summary" }]))
  const loaded = yield* Effect.promise(() => f.create(false).store.load(key))
  expect(loaded?.map((entry) => entry.uuid)).toEqual(["partial", "summary", "a", "r", "masked-image", "kept-image"])
  expect(loaded?.find((entry) => entry.uuid === "a")?.parentUuid).toBe("summary")
}), 60_000)

it.instance("changed sibling UUID last write becomes the implicit active branch on fresh Store load", () => Effect.gen(function* () {
  const f = yield* fixture
  const b = { ...f.assistant, id: MessageID.ascending(), finish: "stop" }
  yield* f.sessions.updateMessage(b)
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: b.id, type: "text", text: "B" })
  yield* f.create().record({ apiID: "api", uuid: "a", messageID: f.assistant.id })
  yield* f.create().record({ apiID: "b-api", uuid: "b", messageID: b.id })
  const branch = { ...base, type: "assistant", uuid: "b", parentUuid: "u", message: { id: "b-api", role: "assistant", content: [{ type: "text", text: "B" }] } }
  yield* Effect.promise(() => f.create().store.append(key, [...f.entries, branch]))
  expect((yield* Effect.promise(() => f.create(false).store.load(key)))?.some((entry) => entry.uuid === "b")).toBe(true)
  yield* Effect.promise(() => f.create().store.append(key, [{ ...f.entries[1], message: { ...(f.entries[1].message as Record<string, unknown>), usage: { input_tokens: 0 } } }]))
  const loaded = yield* Effect.promise(() => f.create(false).store.load(key))
  expect(loaded?.some((entry) => entry.uuid === "a")).toBe(true)
  expect(loaded?.some((entry) => entry.uuid === "b")).toBe(false)
}), 60_000)
