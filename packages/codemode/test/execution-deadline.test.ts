import { expect, test } from "bun:test"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Schema, type Scope } from "effect"
import { CodeMode, Tool, toolError } from "../src/index.js"
import { ToolRuntime } from "../src/tool-runtime.js"

const forms = ["described", "external"] as const
const timeoutMs = 120
const blockMs = 320

class Witness extends Context.Service<Witness, { value: string }>()("CodeModeExecutionDeadlineWitness") {}

test("CONTROL deadline: described host and hooks complete before expiry", async () => {
  const events: string[] = []
  const result = await run(CodeMode.execute({
    code: "return await tools.host({})",
    tools: { host: host(Effect.sync(() => { events.push("body"); return "value" })) },
    limits: { timeoutMs: 500 },
    onToolCallStart: () => Effect.sync(() => { events.push("start") }),
    onToolCallEnd: (call) => Effect.sync(() => { events.push(`end:${call.outcome}`) }),
  }))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("Expected actual host success before expiry")
  expect(result.value).toBe("value")
  expect(result.toolCalls).toEqual([{ name: "host" }])
  expect(events).toEqual(["start", "body", "end:success"])
})

test("CONTROL deadline: host service and resource use the original caller Scope", async () => {
  const scopes: Scope.Scope[] = []
  const events: string[] = []
  const state = { releases: 0 }
  await run(Effect.gen(function* () {
    const callerScope = yield* Effect.scope
    const result = yield* CodeMode.execute({
      code: "return await tools.host({})",
      tools: { host: Tool.make({
        description: "Observe the real caller environment",
        input: Schema.Struct({}), output: Schema.String,
        run: () => Effect.gen(function* () {
          const witness = yield* Witness
          scopes.push(yield* Effect.scope)
          events.push(`body:${witness.value}`)
          yield* Effect.acquireRelease(Effect.succeed("resource"), () => Effect.sync(() => { state.releases++ }))
          return witness.value
        }),
      }) },
      limits: { timeoutMs: 500 },
      onToolCallStart: () => Effect.gen(function* () {
        const witness = yield* Witness
        scopes.push(yield* Effect.scope)
        events.push(`start:${witness.value}`)
      }),
      onToolCallEnd: () => Effect.gen(function* () {
        const witness = yield* Witness
        scopes.push(yield* Effect.scope)
        events.push(`end:${witness.value}`)
      }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("Expected service-backed host success")
    expect(result.value).toBe("present")
    expect(scopes).toHaveLength(3)
    scopes.forEach((scope) => expect(scope).toBe(callerScope))
    expect(state.releases).toBe(0)
  }).pipe(Effect.provideService(Witness, { value: "present" }), Effect.scoped))
  expect(state.releases).toBe(1)
  expect(events).toEqual(["start:present", "body:present", "end:present"])
})

test("CONTROL deadline: the existing tool-call budget remains catchable", async () => {
  const entries: string[] = []
  const result = await run(CodeMode.execute({
    code: `try { await tools.host({}); await tools.host({}); return "missed" } catch { return "caught budget" }`,
    tools: { host: host(Effect.sync(() => { entries.push("body"); return "value" })) },
    limits: { timeoutMs: 500, maxToolCalls: 1 },
  }))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("Expected the program to catch its tool-call budget")
  expect(result.value).toBe("caught budget")
  expect(entries).toEqual(["body"])
  expect(result.toolCalls).toEqual([{ name: "host" }])
})

test("CONTROL deadline: concurrent materializations have separate deadline and call budget", async () => {
  const state = { entries: 0, interrupted: 0 }
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const operation = CodeMode.execute({
      code: "return await tools.host({})",
      tools: { host: host(Effect.suspend(() => {
        state.entries++
        if (state.entries === 1) {
          return Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never),
            Effect.onInterrupt(() => Effect.sync(() => { state.interrupted++ })))
        }
        return Effect.sleep(180).pipe(Effect.as("second"))
      })) },
      limits: { timeoutMs: 300, maxToolCalls: 1 },
    })
    const first = yield* Effect.forkChild(operation)
    yield* Deferred.await(entered)
    yield* Effect.sleep(180)
    const second = yield* Effect.forkChild(operation)
    const [one, two] = yield* Effect.all([Fiber.join(first), Fiber.join(second)], { concurrency: "unbounded" })
    expectTimeout(one)
    expect(two.ok).toBe(true)
    if (!two.ok) throw new Error("Expected the later execution's independent remaining budget")
    expect(two.value).toBe("second")
    expect(one.toolCalls).toEqual([{ name: "host" }])
    expect(two.toolCalls).toEqual([{ name: "host" }])
    expect(two.toolCalls).not.toBe(one.toolCalls)
  }).pipe(Effect.scoped))
  expect(state.entries).toBe(2)
  expect(state.interrupted).toBe(1)
})

test("CONTROL deadline: caller interruption remains interruption and runs host cleanup", async () => {
  const state = { interrupted: 0, ends: 0 }
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(CodeMode.execute({
      code: "return await tools.host({})",
      tools: { host: host(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Effect.sync(() => { state.interrupted++ })))) },
      limits: { timeoutMs: 1000 },
      onToolCallEnd: () => Effect.sync(() => { state.ends++ }),
    }))
    yield* Deferred.await(entered)
    yield* Effect.yieldNow
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("Expected caller interruption, not a CodeMode result")
    expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  }).pipe(Effect.scoped))
  expect(state.interrupted).toBe(1)
  expect(state.ends).toBe(0)
})

test("CONTROL deadline: omitted timeout retains untimed synchronous host behavior", async () => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const entries: string[] = []
  const result = await run(CodeMode.execute({
    code: "return await tools.host({})",
    tools: { host: host(Effect.sync(() => { entries.push("body"); return "untimed" })) },
    onToolCallStart: () => Effect.sync(() => blockHostFor(160, witness)),
  }))
  expectBlocked(witness, 160)
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("Expected unchanged untimed behavior")
  expect(result.value).toBe("untimed")
  expect(entries).toEqual(["body"])
})

test("CONTROL deadline: configured output bounding preserves a timed successful result", async () => {
  const result = await run(CodeMode.execute({
    code: `console.log("first line"); console.log("y".repeat(200)); return "ok"`,
    limits: { timeoutMs: 500, maxOutputBytes: 40 },
  }))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error("Expected bounded success within the deadline")
  expect(result.value).toBe("ok")
  expect(result.truncated).toBe(true)
  expect(result.logs).toEqual(["first line", "[logs truncated: showing 1 of 2 lines]"])
})

test("BEHAVIOR deadline: described body cannot enter after its start hook expires", async () => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const events: string[] = []
  const result = await run(CodeMode.execute({
    code: "return await tools.host({})",
    tools: { host: host(Effect.sync(() => { events.push("body"); return "late" })) },
    limits: { timeoutMs },
    onToolCallStart: () => Effect.sync(() => { events.push("start"); blockHostFor(blockMs, witness) }),
    onToolCallEnd: () => Effect.sync(() => { events.push("end") }),
  }))
  expectBlocked(witness, blockMs)
  expect(events).toEqual(["start"])
  expectTimeout(result)
  expect(result.toolCalls).toEqual([{ name: "host" }])
})

test("BEHAVIOR deadline: synchronous first hook does not receive another timeout budget after yielding", async () => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const state = { entries: 0 }
  const result = await run(CodeMode.execute({
    code: "return await tools.host({})",
    tools: { host: host(Effect.sync(() => { state.entries++; return "entered" }).pipe(Effect.andThen(Effect.never))) },
    limits: { timeoutMs: 300 },
    onToolCallStart: () => Effect.sync(() => blockHostFor(700, witness)).pipe(Effect.andThen(Effect.yieldNow)),
  }))
  const settledAt = performance.now()
  expectBlocked(witness, 700)
  expectTimeout(result)
  // The old race starts its 300ms timer after this hook yields. 150ms permits scheduling noise but excludes that reset.
  expect(settledAt - witness.finishedAt).toBeLessThan(150)
  expect(state.entries).toBe(0)
})

test("BEHAVIOR deadline: late synchronous host success cannot become a successful program", async () => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const state = { entries: 0 }
  const result = await run(CodeMode.execute({
    code: "return await tools.host({})",
    tools: { host: host(Effect.sync(() => { state.entries++; blockHostFor(blockMs, witness); return "late" })) },
    limits: { timeoutMs },
  }))
  expectBlocked(witness, blockMs)
  expect(state.entries).toBe(1)
  expectTimeout(result)
})

test("BEHAVIOR deadline: an expired user callback cannot request another host body", async () => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const entries: string[] = []
  const result = await run(CodeMode.execute({
    code: `return await Promise.all([1].map(async () => { await tools.block({}); return await tools.after({}) }))`,
    tools: {
      block: host(Effect.sync(() => { entries.push("block"); blockHostFor(blockMs, witness); return "done" })),
      after: host(Effect.sync(() => { entries.push("after"); return "late" })),
    },
    limits: { timeoutMs },
  }))
  expectBlocked(witness, blockMs)
  expect(entries).toEqual(["block"])
  expectTimeout(result)
  expect(result.toolCalls).toEqual([{ name: "block" }])
})

test.each(["catch", "finally"] as const)("BEHAVIOR deadline: %s cannot enter another host body after expiry", async (branch) => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const entries: string[] = []
  const block = Effect.sync(() => { entries.push("block"); blockHostFor(blockMs, witness); return "done" })
  const result = await run(CodeMode.execute({
    code: branch === "catch"
      ? `try { await tools.block({}) } catch { return await tools.after({}) } return "unexpected"`
      : `try { await tools.block({}) } finally { await tools.after({}) } return "unexpected"`,
    tools: {
      block: host(branch === "catch" ? block.pipe(Effect.andThen(Effect.fail(toolError("Expected refusal")))) : block),
      after: host(Effect.sync(() => { entries.push("after"); return "late" })),
    },
    limits: { timeoutMs },
  }))
  expectBlocked(witness, blockMs)
  expect(entries).toEqual(["block"])
  expectTimeout(result)
  expect(result.toolCalls).toEqual([{ name: "block" }])
})

test("BEHAVIOR deadline: configured output bounding cannot turn late completion into success", async () => {
  const witness = { startedAt: 0, finishedAt: 0 }
  const result = await run(CodeMode.execute({
    code: `console.log("before"); return { data: await tools.block({}) }`,
    tools: { block: host(Effect.sync(() => { blockHostFor(blockMs, witness); return "x".repeat(256) })) },
    limits: { timeoutMs, maxOutputBytes: 40 },
  }))
  expectBlocked(witness, blockMs)
  expectTimeout(result)
  expect(result.logs).toEqual(["before"])
  expect(result.toolCalls).toEqual([{ name: "block" }])
})

test.each(["omitted", "void"] as const)("CONTROL deadline: external runtime preserves an %s admission guard", async (mode) => {
  const events: string[] = []
  const tools = { host: () => Effect.sync(() => { events.push("body"); return "external" }) }
  const hooks = {
    onToolCallStart: () => Effect.sync(() => { events.push("start") }),
    onToolCallEnd: () => Effect.sync(() => { events.push("end") }),
  }
  const runtime = mode === "omitted"
    ? ToolRuntime.make(tools, undefined, [], hooks)
    : ToolRuntime.make(tools, undefined, [], hooks, Effect.void)
  expect(await run(runtime.invoke(["host"], [{}]))).toBe("external")
  expect(runtime.calls).toEqual([{ name: "host" }])
  expect(events).toEqual(["start", "body", "end"])
})

test.each(forms.flatMap((form) => [
  { form, boundary: "before admission" },
  { form, boundary: "after start hook" },
]))("BEHAVIOR deadline: runtime $form consults guard $boundary", async ({ form, boundary }) => {
  const events: string[] = []
  const state = { guards: 0, interrupted: 0 }
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const body = Effect.sync(() => { events.push("body"); return "value" })
    const runtime = ToolRuntime.make(
      { host: form === "external" ? () => body : host(body) }, undefined, [],
      {
        onToolCallStart: () => Effect.sync(() => { events.push("start") }),
        onToolCallEnd: () => Effect.sync(() => { events.push("end") }),
      },
      Effect.suspend(() => {
        state.guards++
        if (boundary === "after start hook" && state.guards === 1) return Effect.void
        return Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Effect.sync(() => { state.interrupted++ })))
      }),
    )
    const fiber = yield* Effect.forkChild(runtime.invoke(["host"], [{}]))
    const witness = yield* Effect.raceFirst(
      Fiber.await(fiber).pipe(Effect.as("settled")),
      Deferred.await(entered).pipe(Effect.as("guard")),
    )
    expect(witness).toBe("guard")
    expect(state.guards).toBe(boundary === "before admission" ? 1 : 2)
    expect(runtime.calls).toEqual(boundary === "before admission" ? [] : [{ name: "host" }])
    expect(events).toEqual(boundary === "before admission" ? [] : ["start"])
    yield* Fiber.interrupt(fiber)
    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isSuccess(exit)) throw new Error("Expected the actual blocked guard's interruption")
    expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
  }).pipe(Effect.scoped))
  expect(state.interrupted).toBe(1)
})

function host<E, R>(effect: Effect.Effect<string, E, R>) {
  return Tool.make({ description: "Actual deadline acceptance host", input: Schema.Struct({}), output: Schema.String, run: () => effect })
}

function run<A, E>(effect: Effect.Effect<A, E>) {
  return Effect.runPromise(effect.pipe(Effect.timeoutOrElse({
    duration: 5000,
    orElse: () => Effect.fail(new Error("OWNED CONTAINMENT: public execution did not settle; not product timeout success")),
  })))
}

function blockHostFor(milliseconds: number, witness: { startedAt: number; finishedAt: number }) {
  witness.startedAt = performance.now()
  while (performance.now() - witness.startedAt < milliseconds) {}
  witness.finishedAt = performance.now()
}

function expectBlocked(witness: { startedAt: number; finishedAt: number }, milliseconds: number) {
  expect(witness.startedAt).toBeGreaterThan(0)
  expect(witness.finishedAt - witness.startedAt).toBeGreaterThanOrEqual(milliseconds)
}

function expectTimeout(result: CodeMode.Result) {
  expect(result.ok).toBe(false)
  if (result.ok) throw new Error("Expected actual product TimeoutExceeded, received success")
  expect(result.error.kind).toBe("TimeoutExceeded")
}
