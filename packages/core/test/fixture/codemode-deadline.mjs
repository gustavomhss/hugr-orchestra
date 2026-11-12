import { Context, Deferred, Effect, Schema } from "effect"

const emit = (type, payload = {}) => Bun.stdout.write(`${JSON.stringify({ type, payload })}\n`)
const input = Schema.Struct({})
const privateFailure = "PRIVATE_CODEMODE_DEADLINE_CAUSE"

async function main() {
  const { CodeMode, Tool, toolError } = await import(process.argv[2])
  const mode = process.argv[3]
  await emit("FIXTURE_READY", { mode })

  if (mode === "ordinary") {
    const decorate = Tool.make({
      description: "Decorate a captured number", input: Schema.Struct({ value: Schema.String }), output: Schema.String,
      run: (value) => Effect.succeed(`[${value.value}]`),
    })
    const result = await Effect.runPromise(CodeMode.execute({
      tools: { decorate },
      code: `
        const state = /a(b+)/g
        const first = state.exec("abb abbb")
        const nextIndex = state.lastIndex
        const second = state.exec("abb abbb")
        const dynamic = new RegExp("(a)(b+)", "i").exec("xxABB")
        const named = "id ab-42".match(/(?<word>[a-z]+)-(?<num>\\d+)/)
        const replaced = "a1b22".replace(/(\\d+)/g, async (match) => await tools.decorate({ value: match }))
        return {
          literal: /ab+c/.test("xabbbc"), dynamic: [dynamic[0], dynamic[1], dynamic[2]],
          state: [first[0], first.index, nextIndex, second[0], second.index, state.lastIndex],
          named: [named.groups.word, named.groups.num], replaced,
          matches: "a1b22".matchAll(/(\\d+)/g).map((match) => [match[0], match[1], match.index]),
          search: "a1b22".search(/\\d+/), split: "a1b22".split(/\\d+/),
          substitution: "hi bob".replace(/b(o)b/, "[$1]")
        }
      `,
    }))
    await emit("RESULT", { result })
    return
  }

  class Host extends Context.Service()("CodeModeDeadlineFixture.Host") {}
  if (mode === "services") {
    const trace = []
    const value = Tool.make({
      description: "Read the supplied Effect service", input, output: Schema.String,
      run: () => Effect.gen(function* () {
        const host = yield* Host
        trace.push(`run:${host.value}`)
        return host.value
      }),
    })
    const options = {
      tools: { value }, limits: { maxToolCalls: 1 },
      onToolCallStart: (call) => Effect.gen(function* () {
        const host = yield* Host
        trace.push(`start:${call.index}:${call.name}:${host.value}`)
      }),
      onToolCallEnd: (call) => Effect.gen(function* () {
        const host = yield* Host
        trace.push(`end:${call.index}:${call.name}:${call.outcome}:${host.value}`)
      }),
    }
    const result = await Effect.runPromise(CodeMode.execute({ ...options, code: "return await tools.value({})" })
      .pipe(Effect.provideService(Host, { value: "host-value" })))
    const firstTrace = trace.slice()
    trace.length = 0
    const budget = await Effect.runPromise(CodeMode.execute({
      ...options, code: "await tools.value({}); return await tools.value({})",
    }).pipe(Effect.provideService(Host, { value: "budget-value" })))
    await emit("RESULT", { result, budget, firstTrace, budgetTrace: trace })
    return
  }

  if (mode === "arguments") {
    const inspect = Tool.make({
      description: "Observe actual own properties and sparse input slots", input: Schema.Unknown,
      output: Schema.Struct({
        present: Schema.Boolean, absent: Schema.Boolean, presentUndefined: Schema.Boolean,
        sparseHole: Schema.Boolean, explicitSlot: Schema.Boolean, slotUndefined: Schema.Boolean,
        length: Schema.Number, last: Schema.String,
      }),
      run: (value) => Effect.sync(() => ({
        present: Object.hasOwn(value, "present"), absent: !Object.hasOwn(value, "missing"),
        presentUndefined: value.present === undefined, sparseHole: !Object.hasOwn(value.items, 0),
        explicitSlot: Object.hasOwn(value.items, 1), slotUndefined: value.items[1] === undefined,
        length: value.items.length, last: value.items[2],
      })),
    })
    const result = await Effect.runPromise(CodeMode.execute({
      tools: { inspect }, code: `
        const items = []
        items[2] = "last"
        items[1] = undefined
        return await tools.inspect({ present: undefined, items })
      `,
    }))
    await emit("RESULT", { result })
    return
  }

  if (mode === "errors") {
    const declared = Tool.make({
      description: "Return a safe refusal", input, output: Schema.String,
      run: () => Effect.fail(toolError("Safe refusal", new Error(privateFailure))),
    })
    const unknown = Tool.make({
      description: "Fail privately", input, output: Schema.String,
      run: () => Effect.fail(new Error(privateFailure)),
    })
    const result = await Effect.runPromise(CodeMode.execute({ tools: { declared }, code: "return await tools.declared({})" }))
    const hidden = await Effect.runPromise(CodeMode.execute({ tools: { unknown }, code: "return await tools.unknown({})" }))
    await emit("RESULT", { result, hidden })
    return
  }

  if (mode === "reuse") {
    const value = Tool.make({
      description: "Read each execution's own service", input, output: Schema.String,
      run: () => Effect.gen(function* () { const host = yield* Host; return host.value }),
    })
    const operation = CodeMode.execute({ tools: { value }, code: "return await tools.value({})", limits: { maxToolCalls: 1 } })
    const results = await Effect.runPromise(Effect.all([
      operation.pipe(Effect.provideService(Host, { value: "left" })),
      operation.pipe(Effect.provideService(Host, { value: "right" })),
    ], { concurrency: 2 }))
    const repeated = await Effect.runPromise(operation.pipe(Effect.provideService(Host, { value: "again" })))
    await emit("RESULT", { results, repeated, distinctReceipts: results[0].toolCalls !== results[1].toolCalls })
    return
  }

  const expressions = {
    "literal-test": "/(a+)+$/.test(subject)",
    "dynamic-exec": 'new RegExp("(a+)+$").exec(subject)',
    "string-match": 'subject.match("(a+)+$")',
    "replace-callback": 'subject.replace(/(a+)+$/, (match) => "replacement")',
    "match-all": "subject.matchAll(/(a+)+$/g)",
  }
  if (!Object.hasOwn(expressions, mode)) throw new Error("Unknown deadline fixture scenario")
  const warmup = await Effect.runPromise(CodeMode.execute({ code: 'return "ready"' }))
  if (!warmup.ok || warmup.value !== "ready") throw new Error("Public CodeMode warmup failed")
  await emit("WARMUP_READY")
  const slowStarted = Deferred.makeUnsafe()
  const facts = {
    heartbeats: 0, slowCompleted: 0, slowInterrupted: 0, afterCalls: 0,
    executionStarted: 0, phaseStarted: 0, elapsedToMark: 0,
  }
  const trace = []
  const heartbeat = { timer: undefined, times: [] }
  const slow = Tool.make({
    description: "Wait interruptibly past the product deadline", input, output: Schema.String,
    run: () => Effect.gen(function* () {
      yield* Deferred.succeed(slowStarted, undefined)
      yield* Effect.sleep("4 seconds")
      facts.slowCompleted++
      return "late"
    }).pipe(Effect.onInterrupt(() => Effect.sync(() => { facts.slowInterrupted++ }))),
  })
  const mark = Tool.make({
    description: "Admit the real CPU phase", input, output: Schema.String,
    run: () => Effect.gen(function* () {
      yield* Deferred.await(slowStarted)
      facts.phaseStarted = performance.now()
      facts.elapsedToMark = facts.phaseStarted - facts.executionStarted
      heartbeat.timer = setInterval(() => {
        const timestamp = performance.now()
        facts.heartbeats++
        heartbeat.times.push(timestamp)
        void emit("HEARTBEAT", { sequence: facts.heartbeats, timestamp }).catch(() => undefined)
      }, 50)
      yield* Effect.promise(() => emit("CPU_PHASE_ADMITTED", { elapsedToMark: facts.elapsedToMark }))
      return "marked"
    }),
  })
  const after = Tool.make({
    description: "Must not run after the CPU deadline", input, output: Schema.String,
    run: () => Effect.sync(() => { facts.afterCalls++; return "unexpected" }),
  })
  try {
    facts.executionStarted = performance.now()
    const result = await Effect.runPromise(CodeMode.execute({
      tools: { slow, mark, after }, limits: { timeoutMs: 1500 },
      onToolCallStart: (call) => Effect.sync(() => { trace.push(`start:${call.name}`) }),
      onToolCallEnd: (call) => Effect.sync(() => { trace.push(`end:${call.name}:${call.outcome}`) }),
      code: `
        const pending = tools.slow({})
        await tools.mark({})
        console.log("regex-phase")
        const subject = "a".repeat(40) + "!"
        ${expressions[mode]}
        console.log("regex-completed")
        await tools.after({})
        await pending
        return "unexpected"
      `,
    }))
    clearInterval(heartbeat.timer)
    const resultAt = performance.now()
    const boundaries = [facts.phaseStarted, ...heartbeat.times, resultAt]
    await emit("RESULT", {
      result, facts: {
        ...facts, resultAt, elapsedAfterMarkMs: resultAt - facts.phaseStarted,
        maxGapMs: boundaries.slice(1).reduce((gap, timestamp, index) => Math.max(gap, timestamp - boundaries[index]), 0),
      }, trace,
    })
  } finally {
    clearInterval(heartbeat.timer)
  }
}

await main().catch(async (error) => {
  await emit("FIXTURE_ERROR", { name: error instanceof Error ? error.name : "Unknown", message: String(error) })
  process.exitCode = 1
})
