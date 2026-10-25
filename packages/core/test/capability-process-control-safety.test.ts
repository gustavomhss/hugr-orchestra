import { expect } from "bun:test"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { CapabilityProcessRegistry } from "@orchestra/core/capability/process-control/registry"
import { ToolSafety } from "@orchestra/core/tool-safety"
import { ToolSafetyCommands } from "../src/tool-safety-commands"
import { Effect } from "effect"
import { CapabilityPolicyFixture } from "./fixture/capability-policy"
import { ProcessControlFixture } from "./fixture/capability-process-control"
import { testEffect } from "./lib/effect"

const it = testEffect(ProcessControlFixture.layer)
const allow = ProcessControlFixture.allow
const child = ProcessControlFixture.child

// Every refusal below must leave no job row and no new live process.
const refused = (f: Effect.Success<typeof ProcessControlFixture.setup>, sessionID: string, live: number) => Effect.gen(function* () {
  const registry = yield* CapabilityProcessRegistry.Service
  expect(yield* f.count(sessionID)).toBe(0)
  expect(registry.live().size).toBe(live)
})
const live = CapabilityProcessRegistry.Service.pipe(Effect.map((registry) => registry.live().size))

it.live("explicit env is part of the approved command: an argv-only allow rule does not cover it", () => Effect.gen(function* () {
  const f = yield* ProcessControlFixture.setup
  const s = yield* f.session()
  const running = yield* live
  yield* CapabilityPolicyFixture.setRules([...allow, { action: "bash", resource: "*", effect: "deny" },
    { action: "bash", resource: `${ToolSafetyCommands.display([process.execPath], {})} *`, effect: "allow" }, { action: "bash", resource: "A=1 *", effect: "allow" }])
  expect(yield* s.failure({ action: "start", argv: child(`1`), env: { NODE_OPTIONS: "--require=/tmp/x.js" } })).toContain("Blocked")
  expect(yield* s.failure({ action: "start", argv: ["A=1", ...child(`1`)] })).toContain("Blocked")
  yield* refused(f, s.context.sessionID, running)
  expect(yield* s.output({ action: "start", argv: child(`1`) })).toMatchObject({ action: "start" })
  yield* CapabilityPolicyFixture.setRules(allow)
}))

it.live("command safety, askBefore and git hygiene apply to process_control start with the same display", () => Effect.gen(function* () {
  const f = yield* ProcessControlFixture.setup
  const s = yield* f.session()
  const running = yield* live
  const reset = yield* s.settle({ action: "start", argv: ["git", "reset", "--hard"] })
  expect(reset.result).toMatchObject({ type: "error" })
  expect(String(reset.result.value)).toContain("Tool safety HOLD: known-destructive-operation")
  const asked: string[][] = []
  const pushed = yield* s.settle({ action: "start", argv: ["git", "push"], env: { GIT_TRACE: "1" } }).pipe(
    Effect.provideService(ToolSafety.RuntimeProfile, { askBefore: ["push"] }),
    Effect.provideService(ToolSafety.NativeHost, { ask: (request) => Effect.sync(() => asked.push([...request.resources]))
      .pipe(Effect.andThen(Effect.fail(new ToolSafety.Denied({ reason: "owner-declined" })))) }))
  expect(asked).toEqual([["GIT_TRACE=1 git push"]])
  expect(String(pushed.result.value)).toContain("Tool safety HOLD: owner-declined")
  const hygiene = yield* s.call({ action: "start", argv: ["git", "commit", "-m", "x"], env: { GIT_DIR: "/elsewhere" } })
    .pipe(Effect.flip)
  expect("error" in hygiene ? hygiene.error : undefined).toBeInstanceOf(ToolSafety.Denied)
  expect(hygiene.message).toContain("Tool safety HOLD: git-hygiene-placement-environment")
  yield* refused(f, s.context.sessionID, running)
}))

it.live("external cwd needs approval, a file cwd is refused, and a failed spawn settles the job failed", () => Effect.gen(function* () {
  const f = yield* ProcessControlFixture.setup
  const s = yield* f.session()
  const running = yield* live
  yield* CapabilityPolicyFixture.setRules([...allow, { action: "external_directory", resource: "*", effect: "deny" }])
  expect(yield* s.failure({ action: "start", argv: child(`1`), cwd: tmpdir() })).toContain("Blocked")
  yield* CapabilityPolicyFixture.setRules(allow)
  yield* Effect.promise(() => writeFile(join(ProcessControlFixture.tmp.path, "file.txt"), "x"))
  expect(yield* s.failure({ action: "start", argv: child(`1`), cwd: "file.txt" })).toContain("unsupported_operation")
  yield* refused(f, s.context.sessionID, running)
  yield* s.call({ action: "start", argv: [join(ProcessControlFixture.tmp.path, "missing-binary")] }).pipe(Effect.exit)
  const rows = yield* f.rows(s.context.sessionID)
  expect(rows.length).toBe(1)
  yield* f.durable(rows[0]?.id ?? "", "failed")
}))
