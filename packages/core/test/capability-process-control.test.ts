import { expect } from "bun:test"
import { CapabilityProcessRegistry } from "@orchestra/core/capability/process-control/registry"
import { Capability } from "@orchestra/schema/capability"
import { Effect, Schema } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { ProcessControlFixture } from "./fixture/capability-process-control"
import { testEffect } from "./lib/effect"

const it = testEffect(ProcessControlFixture.layer)
const allow = ProcessControlFixture.allow
const child = ProcessControlFixture.child
const echo = ProcessControlFixture.echo

it.live("pipe process lifecycle: start, input, output, wait, settle completed/failed/cancelled", () => Effect.gen(function* () {
  const f = yield* ProcessControlFixture.setup
  const s = yield* f.session()
  const started = yield* s.output({ action: "start", argv: echo, env: { CUSTOM_API_KEY: "bound" } })
  if (started.action !== "start") throw new Error("expected start")
  const id = started.status.process.id
  expect(started.status.state).toBe("running")
  expect((yield* s.output({ action: "list" }))).toMatchObject({ action: "list", items: [{ process: { id } }] })
  yield* s.output({ action: "write", id, data: "a" })
  yield* s.output({ action: "submit", id, data: "b" })
  const waited = yield* s.output({ action: "wait", id, cursor: 0, timeoutMs: 5000 })
  expect(waited).toMatchObject({ action: "wait", timedOut: false })
  yield* s.output({ action: "close-input", id })
  expect(yield* s.failure({ action: "write", id, data: "late" })).toContain("unsupported_operation")
  yield* f.durable(id, "failed")
  const log = yield* s.output({ action: "log", id, cursor: 0 })
  if (log.action !== "log") throw new Error("expected log")
  expect(log.chunk.text).toContain("key:bound")
  expect(log.chunk.text).toContain("got:a")
  expect(log.chunk.text).toContain("b\n")
  expect(log.status).toMatchObject({ state: "failed", input: "closed", exit: { code: 3 } })

  const ok = yield* s.output({ action: "start", argv: child(`console.log("done")`) })
  if (ok.action !== "start") throw new Error("expected start")
  yield* f.durable(ok.status.process.id, "completed")

  const long = yield* s.output({ action: "start", argv: child(`setInterval(() => {}, 1000)`) })
  if (long.action !== "start") throw new Error("expected start")
  expect(yield* s.output({ action: "stop", id: long.status.process.id })).toMatchObject({ action: "stop", outcome: "local-stop" })
  yield* f.durable(long.status.process.id, "cancelled")
}))

it.live("pty and denied bash permission create no job and no process", () => Effect.gen(function* () {
  const f = yield* ProcessControlFixture.setup
  const s = yield* f.session()
  const registry = yield* CapabilityProcessRegistry.Service
  const running = registry.live().size
  expect(yield* s.failure({ action: "start", argv: echo, mode: "pty" })).toContain("unsupported_operation")
  yield* CapabilityPolicyFixture.setRules([...allow, { action: "bash", resource: "*", effect: "deny" }])
  expect(yield* s.failure({ action: "start", argv: echo })).toContain("Blocked")
  yield* CapabilityPolicyFixture.setRules(allow)
  expect(yield* f.count(s.context.sessionID)).toBe(0)
  expect(registry.live().size).toBe(running)
  expect(yield* s.output({ action: "list" })).toEqual({ action: "list", items: [] })
}))

it.live("foreign and unknown IDs fail identically; transfer moves only child to parent", () => Effect.gen(function* () {
  const f = yield* ProcessControlFixture.setup
  const parent = yield* f.session()
  const s = yield* f.session({ parentID: parent.context.sessionID })
  const foreign = yield* f.session()
  const started = yield* s.output({ action: "start", argv: echo })
  if (started.action !== "start") throw new Error("expected start")
  const id = started.status.process.id
  const unknown = yield* foreign.failure({ action: "status", id: Capability.JobID.create() })
  expect(unknown).toContain("target_denied")
  const actions: Schema.Json[] = [{ action: "status", id }, { action: "log", id }, { action: "wait", id, timeoutMs: 0 },
    { action: "write", id, data: "x" }, { action: "submit", id, data: "x" }, { action: "close-input", id },
    { action: "stop", id }, { action: "transfer", id }]
  for (const input of actions) expect(yield* foreign.failure(input)).toBe(unknown)
  expect(yield* foreign.output({ action: "list" })).toEqual({ action: "list", items: [] })
  expect(yield* s.output({ action: "status", id })).toMatchObject({ status: { state: "running", input: "open" } })
  expect(yield* foreign.failure({ action: "transfer", id })).toBe(unknown)
  expect(yield* s.output({ action: "transfer", id })).toMatchObject({ action: "transfer", status: { state: "running" } })
  expect(yield* s.failure({ action: "status", id })).toBe(unknown)
  expect(yield* parent.output({ action: "status", id })).toMatchObject({ status: { state: "running", input: "open" } })
  expect(yield* parent.failure({ action: "transfer", id })).toBe(unknown)
  yield* parent.output({ action: "close-input", id })
  yield* f.durable(id, "failed")
}))
