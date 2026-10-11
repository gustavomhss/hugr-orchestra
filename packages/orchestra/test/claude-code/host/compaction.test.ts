import { afterEach, expect } from "bun:test"
import path from "node:path"
import { Effect, Layer, Schema } from "effect"
import type { HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Archive } from "@/continuity/archive"
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
    expect(first).toContain("receipt interrupted")
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
