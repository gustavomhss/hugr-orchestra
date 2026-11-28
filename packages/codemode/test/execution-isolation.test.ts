import { describe, expect, test } from "bun:test"
import { Effect, Schema } from "effect"
import { CodeMode, Tool, toolError } from "../src/index.js"

const lookup = Tool.make({
  description: "Return a value",
  input: Schema.Struct({}),
  output: Schema.String,
  run: () => Effect.succeed("value"),
})

// Effects are reusable values: neither a runtime nor a one-shot call owns execution state.
describe("CodeMode execution isolation", () => {
  for (const source of ["execute", "runtime"] as const) {
    test(`${source} resets tool budget and logs on sequential reuse`, async () => {
      const options = { tools: { lookup }, limits: { maxToolCalls: 1 } }
      const code = `console.log("one run"); return await tools.lookup({})`
      const operation = source === "execute" ? CodeMode.execute({ ...options, code }) : CodeMode.make(options).execute(code)
      const first = await Effect.runPromise(operation)
      const saved = JSON.stringify(first)
      const second = await Effect.runPromise(operation)
      expect(first).toMatchObject({ ok: true, value: "value", logs: ["one run"], toolCalls: [{ name: "lookup" }] })
      expect(second).toEqual(first)
      expect(JSON.stringify(first)).toBe(saved)
      expect(second.toolCalls).not.toBe(first.toolCalls)
    })
  }

  test("later unlimited executions cannot mutate an earlier result", async () => {
    const operation = CodeMode.execute({ tools: { lookup }, code: `return await tools.lookup({})` })
    const first = await Effect.runPromise(operation)
    const saved = JSON.stringify(first)
    const second = await Effect.runPromise(operation)
    expect(first.toolCalls).toEqual([{ name: "lookup" }])
    expect(second.toolCalls).toEqual([{ name: "lookup" }])
    expect(JSON.stringify(first)).toBe(saved)
  })

  for (const outcome of ["failure", "timeout"] as const) {
    test(`reuse after ${outcome} starts with fresh calls and logs`, async () => {
      const invocations: number[] = []
      const retry = Tool.make({
        description: "Succeed on a later execution",
        input: Schema.Struct({}),
        output: Schema.String,
        run: () => Effect.suspend(() => {
          invocations.push(invocations.length + 1)
          if (invocations.length > 1) return Effect.succeed("recovered")
          return outcome === "timeout" ? Effect.never : Effect.fail(toolError("First execution failed"))
        }),
      })
      const operation = CodeMode.execute({
        tools: { retry },
        code: `console.log("one run"); return await tools.retry({})`,
        limits: { maxToolCalls: 1, timeoutMs: 100 },
      })
      const first = await Effect.runPromise(operation)
      const saved = JSON.stringify(first)
      expect(first.ok ? undefined : first.error.kind).toBe(outcome === "timeout" ? "TimeoutExceeded" : "ToolFailure")
      const second = await Effect.runPromise(operation)
      expect(second).toMatchObject({ ok: true, value: "recovered", logs: ["one run"], toolCalls: [{ name: "retry" }] })
      expect(JSON.stringify(first)).toBe(saved)
      expect(second.toolCalls).not.toBe(first.toolCalls)
    })
  }

  test("concurrent reuse has independent budgets and call snapshots", async () => {
    const entered: number[] = []
    const gate = Promise.withResolvers<void>()
    const wait = Tool.make({
      description: "Wait for both executions",
      input: Schema.Struct({}),
      output: Schema.Number,
      run: () => Effect.promise(async () => {
        entered.push(entered.length + 1)
        const value = entered.length
        if (entered.length === 2) gate.resolve()
        await gate.promise
        return value
      }),
    })
    const operation = CodeMode.execute({
      tools: { wait },
      code: `const value = await tools.wait({}); console.log(value); return value`,
      limits: { maxToolCalls: 1, timeoutMs: 1_000 },
    })
    const results = await Effect.runPromise(Effect.all([operation, operation], { concurrency: "unbounded" }))
    expect(entered).toEqual([1, 2])
    expect(results.map((result) => result.ok)).toEqual([true, true])
    expect(results.map((result) => result.ok ? result.value : undefined)).toEqual([1, 2])
    expect(results.map((result) => result.logs)).toEqual([["1"], ["2"]])
    expect(results.map((result) => result.toolCalls)).toEqual([[{ name: "wait" }], [{ name: "wait" }]])
    expect(results[0].toolCalls).not.toBe(results[1].toolCalls)
  })
})
