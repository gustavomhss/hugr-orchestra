import { afterEach, expect } from "bun:test"
import type { HookInput, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Deferred, Effect, Fiber, Tracer } from "effect"
import { getEventListeners } from "node:events"
import { Database } from "@orchestra/core/database/database"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { awaitWithTimeout } from "../../lib/effect"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { LogicalTask } from "@/maestro/logical-task"
import { MessageID, PartID } from "@/session/schema"
import { disposeAllInstances } from "../../fixture/fixture"
import { CompactionFixture } from "./compaction-fixture"

afterEach(disposeAllInstances)

function memory(output: HookJSONOutput) {
  return JSON.stringify(output)
}

// Two dispatches of the same read-only seat use the actual gate/delegation/join and real persisted Agent parts.
const joined = Effect.fnUntraced(function* (f: Effect.Success<ReturnType<typeof CompactionFixture.make>>, id: string) {
  if (!f.assistant) throw new Error("Missing parent assistant")
  yield* f.sessions.setPermission({ sessionID: f.chat.id, permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  const args = { description: id, subagent_type: "orchestra:patty", run_in_background: false, prompt: "Inspect the bounded task." }
  yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
    type: "tool", tool: "Agent", callID: id, state: { status: "running", input: args, time: { start: Date.now() } } })
  const dispatched = yield* f.fire({ ...f.base, hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: id, tool_input: args })
  expect(ClaudeHostGate.denied(dispatched)).toBe(false)
  const child = f.ctx.join.child(id)
  if (!child) throw new Error(`Dispatch ${id} did not create its child`)
  f.ctx.join.taskStarted({ toolUseID: id, taskID: `agent-${id}` })
  const native = `child-native-${id}`
  yield* f.fire({ ...f.base, session_id: native, hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: `read-${id}`,
    tool_input: { file_path: "bounded.txt" }, agent_id: `agent-${id}`, agent_type: "orchestra:patty" })
  return { child, native }
})

CompactionFixture.it.instance("one actual hooks context scopes parent and two same-seat native children by joined identity", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.fs.writeFileString(`${f.chat.directory}/bounded.txt`, "bounded fixture")
    const first = yield* joined(f, "first")
    const second = yield* joined(f, "second")
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "ROOT-ONLY", status: "pending", priority: "high" }] })
    yield* f.todos.update({ sessionID: first.child, todos: [{ content: "FIRST-ONLY", status: "pending", priority: "high" }] })
    yield* f.todos.update({ sessionID: second.child, todos: [{ content: "SECOND-ONLY", status: "pending", priority: "high" }] })
    const root = memory(yield* f.compact())
    const child = memory(yield* f.compact(first.native))
    const sibling = memory(yield* f.compact(second.native))
    expect(root).toContain("ROOT-ONLY")
    expect(root).not.toContain("FIRST-ONLY")
    expect(child).toContain("FIRST-ONLY")
    expect(child).not.toContain("ROOT-ONLY")
    expect(child).not.toContain("SECOND-ONLY")
    expect(sibling).toContain("SECOND-ONLY")
    expect(sibling).not.toContain("FIRST-ONLY")
    yield* f.summary("CHILD-SUMMARY-EXACT", "manual", first.native)
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
    expect(yield* f.archive.list(second.child)).toEqual([])
    const refs = yield* f.archive.list(first.child)
    expect(refs.length).toBeGreaterThan(0)
    const chunks = yield* Effect.forEach(refs, (ref) => f.archive.read({ sessionID: first.child, id: ref.id }))
    expect(JSON.stringify(chunks)).toContain("CHILD-SUMMARY-EXACT")
    expect(JSON.stringify(chunks)).toContain(first.native)
  }))

CompactionFixture.it.instance("foreign native compact identity with a matching agent_type receives no root state", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "ROOT-SECRET-CONTROL", status: "pending", priority: "high" }] })
    const output = yield* f.fire({ ...f.base, session_id: "foreign-native", hook_event_name: "SessionStart",
      source: "compact", agent_type: "maestro" })
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
    expect(JSON.stringify(output)).not.toContain("ROOT-SECRET-CONTROL")
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
  }))

CompactionFixture.it.instance("query restart refuses a child identity without an observed join; display name supplies no recovery", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const child = yield* joined(f, "restart")
    expect(JSON.stringify(yield* f.compact(child.native))).not.toContain("failed closed")
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    expect(yield* reopened.compact(child.native)).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
  }))

CompactionFixture.it.instance("conflicting observed native session pairs poison the identity instead of selecting a same-seat child", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const first = yield* joined(f, "one")
    const second = yield* joined(f, "two")
    const conflict = yield* f.fire({ ...f.base, session_id: first.native, hook_event_name: "PreToolUse", tool_name: "Read",
      tool_use_id: "conflict", tool_input: { file_path: "bounded.txt" }, agent_id: "agent-two", agent_type: "orchestra:patty" })
    expect(ClaudeHostGate.denied(conflict)).toBe(true)
    expect(yield* f.compact(first.native)).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_CONFLICT") })
    expect(yield* f.archive.list(second.child)).toEqual([])
  }))

CompactionFixture.it.instance("a retained-view cut omits later todos and orphan child bindings while preserving the earlier snapshot", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing history fixture")
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "tool", tool: "todowrite", callID: "old-todos", state: { status: "completed", input: {}, output: "saved", title: "Todos",
        metadata: { todos: [{ content: "KEPT-ACTION", status: "pending", priority: "high" }] }, time: { start: 1, end: 2 } } })
    const cut = yield* f.sessions.updateMessage({ ...f.user, id: MessageID.ascending() })
    const after = yield* f.sessions.updateMessage({ ...f.assistant, id: MessageID.ascending(), parentID: cut.id })
    const orphan = yield* f.task("ORPHAN-TASK")
    const call = (yield* f.sessions.messages({ sessionID: f.chat.id })).flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.callID === "call-ORPHAN-TASK")
    if (!call) throw new Error("Missing orphan call")
    yield* f.sessions.removePart({ sessionID: f.chat.id, messageID: f.assistant.id, partID: call.id })
    yield* f.sessions.updatePart({ ...call, messageID: after.id })
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "FUTURE-ACTION", status: "pending", priority: "high" }] })
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: cut.id }, summary: undefined })
    const text = memory(yield* f.compact())
    expect(text).toContain("KEPT-ACTION")
    expect(text).not.toContain("FUTURE-ACTION")
    expect(text).not.toContain("ORPHAN-TASK")
    expect((yield* f.sessions.children(f.chat.id)).some((child) => child.id === orphan.id)).toBe(true)
  }))

CompactionFixture.it.instance("real Session.fork reads its copied todo snapshot and excludes unanchored child bindings and future side state", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing fork fixture")
    yield* f.sessions.updatePart({ id: PartID.ascending(), sessionID: f.chat.id, messageID: f.assistant.id,
      type: "tool", tool: "todowrite", callID: "fork-kept", state: { status: "completed", input: {}, output: "saved", title: "Todos",
        metadata: { todos: [{ content: "FORK-KEPT", status: "pending", priority: "high", id: "EXACT-TODO-ID" }] }, time: { start: 1, end: 2 } } })
    const boundary = yield* f.sessions.updateMessage({ ...f.user, id: MessageID.ascending() })
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "SOURCE-FUTURE", status: "pending", priority: "high" }] })
    const fork = yield* f.sessions.fork({ sessionID: f.chat.id, messageID: boundary.id })
    yield* f.sessions.setMetadata({ sessionID: fork.id, metadata: { ...fork.metadata, claudeCode: {
      ...fork.metadata?.claudeCode, sessionId: `native-${fork.id}` } } })
    const orphan = yield* f.sessions.create({ parentID: fork.id, agent: "backend", title: "FORK-ORPHAN" })
    yield* LogicalTask.ensure({ executionSessionID: orphan.id, authoritySessionID: fork.id,
      projectID: fork.projectID, memberID: "backend", source: "user", taskId: "FORK-ORPHAN" })
    yield* f.todos.update({ sessionID: fork.id, todos: [{ content: "FORK-SIDE-FUTURE", status: "pending", priority: "high" }] })
    const reopened = yield* CompactionFixture.make({ sessionID: fork.id })
    const text = memory(yield* reopened.compact())
    expect(text).toContain("FORK-KEPT")
    expect(text).toContain("EXACT-TODO-ID")
    expect(text).not.toContain("SOURCE-FUTURE")
    expect(text).not.toContain("FORK-SIDE-FUTURE")
    expect(text).not.toContain("FORK-ORPHAN")
  }))

CompactionFixture.it.instance("a joined child's compact hook is refused when its producing Agent part is outside the parent view", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user) throw new Error("Missing cut fixture")
    const child = yield* joined(f, "cut-child")
    expect(JSON.stringify(yield* f.compact(child.native))).not.toContain("failed closed")
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: f.user.id }, summary: undefined })
    expect(yield* f.compact(child.native)).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNRETAINED") })
    expect(yield* f.archive.list(child.child)).toEqual([])
  }))

for (const event of ["SessionStart", "PostCompact"] as const) {
  for (const source of ["sdk", "host"] as const) {
    CompactionFixture.it.instance(`${event} refuses a pre-aborted ${source} signal without injection or archive writes`, () =>
      Effect.gen(function* () {
        const f = yield* CompactionFixture.make()
        const sdk = new AbortController()
        yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "CANCELLED-MEMORY", status: "pending", priority: "high" }] })
        if (source === "sdk") sdk.abort()
        if (source === "host") f.ctx.abort.abort()
        const output = yield* (event === "SessionStart" ? f.compact(f.base.session_id, sdk.signal)
          : f.summary("CANCELLED-SUMMARY", "manual", f.base.session_id, sdk.signal))
        expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_HOOK_CANCELLED") })
        expect(JSON.stringify(output)).not.toContain("CANCELLED-MEMORY")
        expect(yield* f.archive.list(f.chat.id)).toEqual([])
      }))

    CompactionFixture.it.instance(`${event} interrupts real database work at a reserved-connection barrier on ${source} abort`, () =>
      Effect.gen(function* () {
        const f = yield* CompactionFixture.make()
        const database = yield* Database.Service
        const tracer = yield* Effect.tracer
        const entered = yield* Deferred.make<void>()
        const locked = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const sdk = new AbortController()
        // A tracer observes the actual Session.get entry; it delegates every span to the real tracer.
        // The real SQLite transaction holds its only connection, so that read cannot finish until release.
        const observed = Tracer.make({ ...tracer, span: (options) => {
          if (options.name === "Session.get") Deferred.doneUnsafe(entered, Effect.void)
          return tracer.span(options)
        } })
        const hooks = ClaudeHostHooks.create({ ...f.ctx, run: (effect) => f.ctx.run(effect.pipe(Effect.withTracer(observed))) })
        const callback = hooks[event]?.[0]?.hooks[0]
        if (!callback) throw new Error("Missing cancellation hook")
        const input: HookInput = event === "SessionStart"
          ? { ...f.base, hook_event_name: "SessionStart", source: "compact" }
          : { ...f.base, hook_event_name: "PostCompact", compact_summary: "NO-LATE-PUBLICATION", trigger: "manual" }
        const holder = yield* database.db.transaction(() => Deferred.succeed(locked, undefined).pipe(
          Effect.andThen(Deferred.await(release)))).pipe(Effect.forkChild)
        yield* awaitWithTimeout(Deferred.await(locked), "database connection was not reserved")
        const running = yield* Effect.promise(() => callback(input, undefined, { signal: sdk.signal })).pipe(Effect.forkChild)
        yield* awaitWithTimeout(Deferred.await(entered), "actual Session.get was never reached")
        if (source === "sdk") sdk.abort()
        if (source === "host") f.ctx.abort.abort()
        // Require cancellation to finish while the DB is still locked. A Promise-only/post-hoc signal check deadlocks here.
        const output = yield* awaitWithTimeout(Fiber.join(running), "cancelled hook kept waiting for the real database")
        expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_HOOK_CANCELLED") })
        yield* Deferred.succeed(release, undefined)
        yield* Fiber.join(holder)
        expect(yield* f.archive.list(f.chat.id)).toEqual([])
        expect(getEventListeners(sdk.signal, "abort")).toHaveLength(0)
      }))
  }
}

CompactionFixture.it.instance("SDK abort at the real Archive.publish entry prevents late successful observation publication", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const tracer = yield* Effect.tracer
    const sdk = new AbortController()
    const entered = yield* Deferred.make<void>()
    const observed = Tracer.make({ ...tracer, span: (options) => {
      if (options.name === "ContinuityArchive.publish") {
        Deferred.doneUnsafe(entered, Effect.void)
        sdk.abort()
      }
      return tracer.span(options)
    } })
    const hooks = ClaudeHostHooks.create({ ...f.ctx, run: (effect) => f.ctx.run(effect.pipe(Effect.withTracer(observed))) })
    const callback = hooks.PostCompact?.[0]?.hooks[0]
    if (!callback) throw new Error("Missing PostCompact hook")
    const result = yield* Effect.promise(() => callback({ ...f.base, hook_event_name: "PostCompact", trigger: "auto",
      compact_summary: "MUST-NOT-PUBLISH" }, undefined, { signal: sdk.signal }))
    expect(yield* Deferred.isDone(entered)).toBe(true)
    expect(result).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_HOOK_CANCELLED") })
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
    expect(getEventListeners(sdk.signal, "abort")).toHaveLength(0)
  }))

CompactionFixture.it.instance("successful compact/archive callbacks remove both scoped cancellation listeners", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const sdk = new AbortController()
    const before = getEventListeners(f.ctx.abort.signal, "abort").length
    yield* f.compact(f.base.session_id, sdk.signal)
    yield* f.summary("publication positive control", "auto", f.base.session_id, sdk.signal)
    expect(getEventListeners(sdk.signal, "abort")).toHaveLength(0)
    expect(getEventListeners(f.ctx.abort.signal, "abort")).toHaveLength(before)
    expect((yield* f.archive.list(f.chat.id)).length).toBeGreaterThan(0)
  }))
