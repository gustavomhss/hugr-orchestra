import { expect, test } from "bun:test"
import path from "node:path"
import { Effect, Option, Schema } from "effect"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { ResearchEvent } from "@orchestra/schema/research-event"
import { ClaudeHostResearch } from "@/claude-code/host/research"
import { PartID, SessionID } from "@/session/schema"
import { ClaudeResearchFixture } from "./jimmy-fixture"

// `tool_response` values recorded from a real SDK 0.3.289 session: a subagent with Read, Grep, Glob and WebSearch, observed
// by an in-process PostToolUse hook (2026-10-18). Only the absolute directory is replaced by `<dir>`, and the WebSearch
// summary text is shortened. The hook received structured objects, not text, for all four tools.
const SAMPLE = "alpha\nbeta needle\ngamma\ndelta needle\nepsilon\n"
const recorded = (dir: string) => ({
  Read: { type: "text", file: { filePath: path.join(dir, "sample.txt"), content: "beta needle\ngamma\ndelta needle",
    numLines: 3, startLine: 2, totalLines: 6 } },
  Grep: { mode: "content", numFiles: 0, filenames: [], content: "sample.txt:2:beta needle\nsample.txt:4:delta needle",
    numLines: 2, totalLines: 2 },
  Glob: { filenames: ["sample.txt"], durationMs: 40, numFiles: 1, truncated: false, totalMatches: 1, countIsComplete: true },
  WebSearch: { query: "bun runtime", results: [{ tool_use_id: "srvtoolu_01Sr3dQYsq5SA6QfqcRCpsVq", content: [
    { title: "Bun — A fast all-in-one JavaScript runtime", url: "https://bun.sh/" },
    { title: "Bun Runtime", url: "https://bun.sh/docs/runtime" },
  ] }, "Based on the search results, Bun is a fast JavaScript runtime."], durationSeconds: 7.646122535999999, searchCount: 1 },
})

const rows = Effect.fn("JimmyCapture.rows")(function* (sessionID: string, type: string) {
  const database = yield* Database.Service
  const all = yield* database.db.select().from(EventTable).where(eq(EventTable.aggregate_id, sessionID)).all().pipe(Effect.orDie)
  return all.filter((row) => row.type === EventV2.versionedType(type, 1)).map((row) => row.data)
})
const admissions = (sessionID: string) => rows(sessionID, ResearchEvent.SourceAdmitted.type).pipe(
  Effect.map((data) => data.map((row) => Schema.decodeUnknownSync(ResearchEvent.SourceAdmitted.data)(row).receipt)))
const attempts = (sessionID: string) => rows(sessionID, ResearchEvent.SourceAttempted.type).pipe(
  Effect.map((data) => data.map((row) => Schema.decodeUnknownSync(ResearchEvent.SourceAttempted.data)(row).receipt)))

test("each recorded built-in output maps to its retained representation; any other shape is refused", () => {
  const output = recorded("/repo")
  const sessionID = SessionID.descending()
  const map = (tool: string, response: unknown) => ClaudeHostResearch.retained({ sessionID, callID: "toolu_1", tool, response })
  expect(Option.getOrThrow(map("Read", output.Read))).toEqual({
    source: { origin: { kind: "file", uri: "/repo/sample.txt" }, representation: "text", mediaType: "text/plain",
      content: "beta needle\ngamma\ndelta needle", complete: false },
    lines: { start: 2, end: 4 },
  })
  expect(Option.getOrThrow(map("Grep", output.Grep)).source).toMatchObject({ origin: { kind: "tool-output",
    uri: `native:${sessionID}/toolu_1/Grep` }, content: output.Grep.content, complete: true })
  expect(Option.getOrThrow(map("Grep", { ...output.Grep, appliedLimit: 1 })).source.complete).toBe(false)
  expect(Option.getOrThrow(map("Glob", output.Glob)).source).toMatchObject({ content: "sample.txt", complete: true })
  const search = Option.getOrThrow(map("WebSearch", output.WebSearch)).source
  expect(search).toMatchObject({ representation: "structured-json", mediaType: "application/json" })
  expect(search.content).toContain("https://bun.sh/docs/runtime")
  expect(Option.isNone(map("Read", { type: "image", file: { base64: "", type: "image/png" } }))).toBe(true)
  expect(Option.isNone(map("Read", "beta needle"))).toBe(true)
  expect(Option.isNone(map("WebFetch", { result: "summary" }))).toBe(true)
})

// JE-AC-E5 with the efficiency rule: Read, Grep, Glob and WebSearch are retained through PostToolUse; Read keeps its
// original lines; a reread of an unchanged span is a counted duplicate whose output is left as Claude Code returned it.
ClaudeResearchFixture.it.instance("jimmy's native reads and searches are retained, and an unchanged reread is counted, not copied", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  yield* Effect.promise(() => Bun.write(path.join(fixture.parent.directory, "sample.txt"), SAMPLE))
  const output = recorded(fixture.parent.directory)
  const post = (tool: keyof typeof output, callID: string, response: unknown = output[tool]) => Effect.gen(function* () {
    const part = yield* fixture.sessions.updatePart({ id: PartID.ascending(), sessionID: dispatch.child, messageID: dispatch.message.id,
      callID, type: "tool", tool: tool === "Read" ? "read" : tool, state: { status: "running", input: {}, time: { start: Date.now() } } })
    if (part.type === "tool") fixture.mirrored.set(callID, part)
    return yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: dispatch.taskID, hook_event_name: "PostToolUse",
      tool_name: tool, tool_use_id: callID, tool_input: {}, tool_response: response })
  })
  expect(yield* post("Read", "read-1")).toEqual({})
  for (const tool of ["Grep", "Glob", "WebSearch"] as const) expect(yield* post(tool, `${tool}-1`)).toEqual({})
  const admitted = yield* admissions(dispatch.child)
  expect(admitted.map((receipt) => receipt.origin)).toEqual([
    { kind: "file", uri: path.join(fixture.parent.directory, "sample.txt") },
    { kind: "tool-output", uri: `native:${dispatch.child}/Grep-1/Grep` },
    { kind: "tool-output", uri: `native:${dispatch.child}/Glob-1/Glob` },
    { kind: "tool-output", uri: `native:${dispatch.child}/WebSearch-1/WebSearch` },
  ])
  // "alpha\n" is 6 bytes, so line 2 starts at byte 6.
  expect(admitted[0]).toMatchObject({ complete: false, observed: { byteStart: 6, lineStart: 2, lineEnd: 4 } })

  const reread = yield* post("Read", "read-2")
  expect(reread).toMatchObject({ hookSpecificOutput: { hookEventName: "PostToolUse",
    additionalContext: expect.stringContaining("already retained this span unchanged") } })
  expect(reread).not.toHaveProperty("hookSpecificOutput.updatedToolOutput")
  expect(yield* admissions(dispatch.child)).toHaveLength(4)
  const duplicates = (yield* attempts(dispatch.child))
    .filter((receipt) => receipt.reason === ClaudeHostResearch.DUPLICATE)
  expect(duplicates).toEqual([expect.objectContaining({ outcome: "captured", source: admitted[0].ref, returned: true })])

  // Changed bytes in the same span are new evidence, not a duplicate.
  const changed = yield* post("Read", "read-3", { ...output.Read, file: { ...output.Read.file, content: "beta needle\nGAMMA\ndelta needle" } })
  expect(changed).toEqual({})
  expect(yield* admissions(dispatch.child)).toHaveLength(5)

  const unknown = yield* post("Read", "read-image", { type: "image", file: { base64: "", type: "image/png" } })
  expect(unknown).toMatchObject({ hookSpecificOutput: { updatedToolOutput: expect.stringContaining("Orchestra withheld this output") } })
}), 30_000)

// The mutation control of JE-AC-E5: a host without the capture port withholds the output instead of passing it through.
ClaudeResearchFixture.it.instance("without the capture port, jimmy's native Read output is withheld", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup({ capture: false })
  const dispatch = yield* fixture.nativeDispatch()
  expect(yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: dispatch.taskID, hook_event_name: "PostToolUse",
    tool_name: "Read", tool_use_id: "read-uncaptured", tool_input: {}, tool_response: recorded(fixture.parent.directory).Read }))
    .toMatchObject({ hookSpecificOutput: { updatedToolOutput: expect.stringContaining("provenance capture is not available") } })
}), 30_000)

// J5.5: after a successful inquiry close, every later call of the seat is refused and its loop stops.
ClaudeResearchFixture.it.instance("a closed inquiry refuses every later jimmy call; a refused close does not", () => Effect.gen(function* () {
  const fixture = yield* ClaudeResearchFixture.setup()
  const dispatch = yield* fixture.nativeDispatch()
  const close = { action: "close", sufficiency: "partial", answer: "Partial answer" }
  yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: dispatch.taskID, hook_event_name: "PostToolUseFailure",
    tool_name: "mcp__orchestra__inquiry", tool_use_id: "close-refused", tool_input: close, error: "inquiry_state: no check" })
  expect(yield* dispatch.pre("mcp__orchestra__research_view", "before-close", { action: "corpus" }))
    .toMatchObject({ hookSpecificOutput: { permissionDecision: "allow" } })
  yield* fixture.fire({ ...ClaudeResearchFixture.base, agent_id: dispatch.taskID, hook_event_name: "PostToolUse",
    tool_name: "mcp__orchestra__inquiry", tool_use_id: "close-accepted", tool_input: close,
    tool_response: [{ type: "text", text: "closed" }] })
  for (const [name, input] of [["mcp__orchestra__research_view", { action: "corpus" }], ["Read", { file_path: "sample.txt" }]] as const)
    expect(yield* dispatch.pre(name, `after-close-${name}`, input)).toMatchObject({ continue: false, stopReason: "inquiry closed",
      hookSpecificOutput: { permissionDecision: "deny" } })
}), 30_000)
