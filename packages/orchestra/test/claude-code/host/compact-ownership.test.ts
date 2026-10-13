import { afterEach, expect } from "bun:test"
import type { HookInput, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk"
import { Deferred, Effect, Fiber, Tracer } from "effect"
import { getEventListeners } from "node:events"
import { Database } from "@orchestra/core/database/database"
import { ClaudeHostHooks } from "@/claude-code/host/hooks"
import { ClaudeHostMemory } from "@/claude-code/host/memory"
import { ClaudeHostTodos } from "@/claude-code/host/todos"
import { awaitWithTimeout } from "../../lib/effect"
import { ClaudeHostGate } from "@/claude-code/host/gate"
import { LogicalTask } from "@/maestro/logical-task"
import { PartID } from "@/session/schema"
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
  const native = f.base.session_id
  yield* f.fire({ ...f.base, session_id: native, hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: `read-${id}`,
    tool_input: { file_path: "bounded.txt" }, agent_id: `agent-${id}`, agent_type: "orchestra:patty" })
  return { child, native, agentID: `agent-${id}` }
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
    const child = memory(yield* f.compact(first.native, f.ctx.abort.signal, first.agentID))
    const sibling = memory(yield* f.compact(second.native, f.ctx.abort.signal, second.agentID))
    expect(root).toContain("ROOT-ONLY")
    expect(root).not.toContain("FIRST-ONLY")
    expect(child).toContain("FIRST-ONLY")
    expect(child).not.toContain("ROOT-ONLY")
    expect(child).not.toContain("SECOND-ONLY")
    expect(sibling).toContain("SECOND-ONLY")
    expect(sibling).not.toContain("FIRST-ONLY")
    yield* f.summary("CHILD-SUMMARY-EXACT", "manual", first.native, f.ctx.abort.signal, first.agentID)
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

CompactionFixture.it.instance("a foreign PostCompact callback cannot add an observation to the trusted root archive", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.summary("OWN-OBSERVATION positive control")
    const before = yield* f.archive.list(f.chat.id)
    expect(before.length).toBeGreaterThan(0)
    expect(yield* f.summary("FOREIGN-OBSERVATION", "auto", "foreign-native")).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
    expect(yield* f.archive.list(f.chat.id)).toEqual(before)
  }))

CompactionFixture.it.instance("missing persisted root init identity is a named refusal without root memory injection", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { claudeCode: {} } })
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "ROOT-UNBOUND-CONTROL", status: "pending", priority: "high" }] })
    const output = yield* f.compact()
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
    expect(JSON.stringify(output)).not.toContain("ROOT-UNBOUND-CONTROL")
  }))

CompactionFixture.it.instance("query restart refuses a child agent identity without an observed join", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const child = yield* joined(f, "restart")
    expect(JSON.stringify(yield* f.compact(child.native, f.ctx.abort.signal, child.agentID))).not.toContain("failed closed")
    const reopened = yield* CompactionFixture.make({ sessionID: f.chat.id })
    expect(yield* reopened.compact(child.native, reopened.ctx.abort.signal, child.agentID)).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
  }))

CompactionFixture.it.instance("conflicting joined agent ids fail closed even with the root native session id", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const first = yield* joined(f, "one")
    const second = yield* joined(f, "two")
    f.ctx.join.taskStarted({ toolUseID: "one", taskID: second.agentID })
    expect(yield* f.compact(first.native, f.ctx.abort.signal, first.agentID)).toMatchObject({ continue: false,
      stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_CONFLICT") })
    expect(yield* f.archive.list(second.child)).toEqual([])
  }))

CompactionFixture.it.instance("a retained-view cut omits later todos and orphan child bindings while preserving the earlier snapshot", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user || !f.assistant) throw new Error("Missing history fixture")
    yield* f.taskList([{ id: "KEPT-NATIVE-ID", subject: "KEPT-ACTION", status: "pending" }])
    const cut = yield* f.nextUser()
    const after = yield* f.nextAssistant(cut)
    yield* f.taskList([{ id: "FUTURE-NATIVE-ID", subject: "FUTURE-ACTION", status: "pending" }], after)
    const orphan = yield* f.task("ORPHAN-TASK")
    const call = (yield* f.sessions.messages({ sessionID: f.chat.id })).flatMap((message) => message.parts)
      .find((part) => part.type === "tool" && part.callID === "call-ORPHAN-TASK")
    if (!call) throw new Error("Missing orphan call")
    yield* f.sessions.removePart({ sessionID: f.chat.id, messageID: f.assistant.id, partID: call.id })
    yield* f.sessions.updatePart({ ...call, messageID: after.id })
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "FUTURE-ACTION", status: "pending", priority: "high" }] })
    expect(memory(yield* f.compact())).toContain("FUTURE-ACTION")
    expect(memory(yield* f.compact())).toContain("ORPHAN-TASK")
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
    yield* f.taskList([{ id: "EXACT-TODO-ID", subject: "FORK-KEPT", status: "pending" }])
    const boundary = yield* f.nextUser()
    // Only native boundary receipts are scripted; the actual registered lifecycle owner creates fork lineage.
    const source = yield* f.sessions.get(f.chat.id)
    yield* f.sessions.setMetadata({ sessionID: f.chat.id, metadata: { ...source.metadata, claudeCode: {
      ...source.metadata?.claudeCode, starts: { [boundary.id]: "native-fork-kept" },
      ends: { [f.user.id]: "native-fork-kept" }, chain: "native-fork-kept",
    } } })
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "SOURCE-FUTURE", status: "pending", priority: "high" }] })
    const fork = yield* f.sessions.fork({ sessionID: f.chat.id, messageID: boundary.id })
    yield* f.sessions.setMetadata({ sessionID: fork.id, metadata: { ...fork.metadata, claudeCode: {
      ...fork.metadata?.claudeCode, sessionId: `native-${fork.id}` } } })
    const orphan = yield* f.sessions.create({ parentID: fork.id, agent: "backend", title: "FORK-ORPHAN" })
    yield* LogicalTask.ensure({ executionSessionID: orphan.id, authoritySessionID: fork.id,
      projectID: fork.projectID, memberID: "backend", source: "user", taskId: "FORK-ORPHAN" })
    yield* f.todos.update({ sessionID: fork.id, todos: [{ content: "FORK-SIDE-FUTURE", status: "pending", priority: "high" }] })
    const view = yield* ClaudeHostMemory.retained(fork.id)
    expect(view.cut).toBe(true)
    expect(view.lineage?.kind).toBe("fork")
    expect(view.history.map((message) => message.info.role)).toEqual(["user", "assistant"])
    expect(view.lineage?.messages[view.history[0].info.id]).toEqual([
      { projectID: f.chat.projectID, sessionID: f.chat.id, messageID: f.user.id },
    ])
    expect(view.lineage?.messages[view.history[1].info.id]).toEqual([
      { projectID: f.chat.projectID, sessionID: f.chat.id, messageID: f.assistant.id },
    ])
    expect(ClaudeHostTodos.latest(view)).toMatchObject({ status: "known", snapshot: {
      tasks: [{ id: "EXACT-TODO-ID", subject: "FORK-KEPT", status: "pending" }],
    } })
    const reopened = yield* CompactionFixture.make({ sessionID: fork.id })
    const text = memory(yield* reopened.compact())
    expect(text).toContain("FORK-KEPT")
    expect(text).not.toContain("SOURCE-FUTURE")
    expect(text).not.toContain("FORK-SIDE-FUTURE")
    expect(text).not.toContain("FORK-ORPHAN")
    expect(text).toContain("EXACT-TODO-ID")
    const copied = view.history.flatMap((message) => message.parts).find((part) =>
      part.type === "tool" && part.state.status === "completed" && part.state.metadata.claudeCodeTodo)
    if (!copied) throw new Error("Missing copied native todo receipt")
    yield* f.sessions.removePart({ sessionID: fork.id, messageID: copied.messageID, partID: copied.id })
    expect(ClaudeHostTodos.latest(yield* ClaudeHostMemory.retained(fork.id))).toBeUndefined()
    expect(yield* reopened.compact()).toEqual({})
  }))

CompactionFixture.it.instance("a joined child's compact hook is refused when its producing Agent part is outside the parent view", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    if (!f.user) throw new Error("Missing cut fixture")
    const child = yield* joined(f, "cut-child")
    expect(JSON.stringify(yield* f.compact(child.native, f.ctx.abort.signal, child.agentID))).not.toContain("failed closed")
    yield* f.sessions.setRevert({ sessionID: f.chat.id, revert: { messageID: f.user.id }, summary: undefined })
    expect(yield* f.compact(child.native, f.ctx.abort.signal, child.agentID)).toMatchObject({ continue: false,
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

CompactionFixture.it.instance("SDK cancellation between actual Effect completion and callback delivery withholds the computed context", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const sdk = new AbortController()
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "LATE-CONTEXT-CONTROL", status: "pending", priority: "high" }] })
    const hooks = ClaudeHostHooks.create({ ...f.ctx, run: (effect) => f.ctx.run(effect).then((value) => {
      sdk.abort()
      return value
    }) })
    const callback = hooks.SessionStart?.[0]?.hooks[0]
    if (!callback) throw new Error("Missing compact hook")
    const output = yield* Effect.promise(() => callback({ ...f.base, hook_event_name: "SessionStart", source: "compact" },
      undefined, { signal: sdk.signal }))
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_HOOK_CANCELLED") })
    expect(JSON.stringify(output)).not.toContain("LATE-CONTEXT-CONTROL")
  }))

for (const event of ["SessionStart", "PostCompact"] as const) {
  CompactionFixture.it.instance(`${event} with an unknown agent_id and shared root session_id fails closed`, () =>
    Effect.gen(function* () {
      const f = yield* CompactionFixture.make()
      yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "ROOT-NOT-FALLBACK", status: "pending", priority: "high" }] })
      const output = yield* (event === "SessionStart" ? f.compact(f.base.session_id, f.ctx.abort.signal, "unjoined-agent")
        : f.summary("UNJOINED-SUMMARY", "auto", f.base.session_id, f.ctx.abort.signal, "unjoined-agent"))
      expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
      expect(JSON.stringify(output)).not.toContain("ROOT-NOT-FALLBACK")
      expect(yield* f.archive.list(f.chat.id)).toEqual([])
    }))
}

CompactionFixture.it.instance("a joined child actor remains authoritative when its callback session_id differs from the root", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    const child = yield* joined(f, "actor-first")
    yield* f.todos.update({ sessionID: child.child, todos: [{ content: "JOINED-CHILD-EXACT", status: "pending", priority: "high" }] })
    expect(memory(yield* f.compact("sdk-child-session", f.ctx.abort.signal, child.agentID))).toContain("JOINED-CHILD-EXACT")
    yield* f.summary("ACTOR-SUMMARY", "manual", "sdk-child-session", f.ctx.abort.signal, child.agentID)
    expect(yield* f.archive.list(f.chat.id)).toEqual([])
    expect((yield* f.archive.list(child.child)).length).toBeGreaterThan(0)
  }))

CompactionFixture.it.instance("an explicitly empty agent_id cannot fall back to root memory", () =>
  Effect.gen(function* () {
    const f = yield* CompactionFixture.make()
    yield* f.todos.update({ sessionID: f.chat.id, todos: [{ content: "EMPTY-ID-ROOT", status: "pending", priority: "high" }] })
    const output = yield* f.compact(f.base.session_id, f.ctx.abort.signal, "")
    expect(output).toMatchObject({ continue: false, stopReason: expect.stringContaining("COMPACT_NATIVE_OWNER_UNAVAILABLE") })
    expect(JSON.stringify(output)).not.toContain("EMPTY-ID-ROOT")
  }))
