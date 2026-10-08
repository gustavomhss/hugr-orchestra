import { afterAll, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import path from "node:path"
import { Deferred, Effect, Fiber, Option } from "effect"
import { TestClock } from "effect/testing"
import type { RelayArm } from "@orchestra/schema/relay-arm"
import { ArmCost } from "../src/arm/cost"
import { ArmEvaluate } from "../src/arm/evaluate"
import { RelayAudit } from "../src/audit"
import { GateShell } from "../src/gate/shell"
import { LedgerVerify } from "../src/ledger/verify"
import {
  type Entry,
  type Env,
  type Files,
  EPOCH,
  TOKEN,
  cleanup,
  entries,
  events,
  git,
  read,
  repo,
  run,
  scratch,
  write,
} from "./arm-harness"

// WP6: what the TS arm adds to the hook, with no golden to replay: `all-gates`, Arsenal `host_check` controls, the
// revision guard and `observe` (§6), Maestro's binding conditions (§9), and the declared divergences of the arm's
// own boundaries (PARITY-EXCEPTIONS WP6-*). Expected digests were computed with `printf … | shasum -a 256`.
// Linux-only like every arm test (R11).
const PERMISSIONS = "8090f7f7795f1e4be8d1e120e2e36e32b586cb7fc96f0f075aa895cb346de188" // "host_check:permissions"

afterAll(cleanup)

interface Armed {
  readonly env: Env
  readonly shas: ReadonlyArray<string>
  readonly fire: (input?: Partial<RelayArm.EvaluateInput>) => Promise<RelayArm.Evaluation>
  readonly file: (name: string) => Promise<string | undefined>
}

async function armed(
  wps: ReadonlyArray<Entry>,
  options: { plan?: Entry; files?: Files; commits?: ReadonlyArray<Files> } = {},
): Promise<Armed> {
  const env = await scratch()
  await write(env.work, options.files ?? {})
  const shas = options.commits ? await repo(env, options.commits) : []
  await write(env.arm, {
    "sprint.json": JSON.stringify({ ...options.plan, work_packages: wps }),
    "meta.json": JSON.stringify({ workdir: env.work, project_id: "project", session_id: "session" }),
  })
  return {
    env,
    shas,
    fire: (input = {}) => run(env, ArmEvaluate.evaluate({ token: TOKEN, ...input })),
    file: (name) =>
      Bun.file(path.join(env.arm, name))
        .text()
        .catch(() => undefined),
  }
}

const cmd = (id: string, program: string) => ({ id, cmd: program })
const host = (id: string, name: string) => ({ id, host_check: name })
const judged = (item: string, verdict: string, graded_by: string) => ({
  event: "checklist-item",
  item,
  verdict,
  graded_by,
})
const result = (status: RelayArm.HostCheckResult["status"]): RelayArm.HostCheckResult => ({
  name: "callback-name",
  status,
  provenance: {
    source: "host-check",
    projectID: "project",
    sessionID: "session",
    eventID: "event-1",
    revision: "revision-1",
    revisionKind: "git",
  },
})
const checks = (bound: Record<string, RelayArm.HostCheck>) => new Map(Object.entries(bound))
const verify = (env: Env) => Effect.runPromise(LedgerVerify.verify(path.join(env.arm, "ledger.jsonl")))

describe("all-gates", () => {
  test("advances through every gate under one lock and completes", async () => {
    const arm = await armed([
      { id: "A", checklist: [cmd("a", "true")] },
      { id: "B" },
      { id: "C", checklist: [cmd("c", "true")] },
    ])
    const evaluation = await arm.fire({ mode: "all-gates" })
    expect(evaluation).toMatchObject({ outcome: "complete", wp: "C", failing: [] })
    expect(evaluation.reason).toBeUndefined()
    expect(await events(arm.env)).toEqual([
      "checklist-item",
      "advance-reveal",
      "regression-item",
      "advance-reveal",
      "checklist-item",
      "regression-item",
      "sprint-complete",
    ])
    expect(await arm.file("state")).toBe("complete")
    expect(existsSync(path.join(arm.env.arm, ".run.lock"))).toBe(false)
    expect((await verify(arm.env)).exit).toBe(0)
    expect(ArmEvaluate.hold(evaluation)).toBeUndefined()
  })

  test("stops at the first gate that does not pass, with that gate's block", async () => {
    const arm = await armed([
      { id: "A", checklist: [cmd("a", "true")] },
      { id: "B", checklist: [cmd("b", "test -f b")] },
      { id: "C" },
    ])
    const evaluation = await arm.fire({ mode: "all-gates" })
    expect(evaluation).toMatchObject({ outcome: "gate-fail", wp: "B", failing: ["b"] })
    expect(evaluation.reason).toBe("Relay gate 'B' is NOT satisfied. Still failing:; b. Address these, then finish.")
    expect([await arm.file("position"), await arm.file("retry_B"), await arm.file("counter")]).toEqual([
      "B",
      "1\n",
      "1\n",
    ])
    expect(ArmEvaluate.hold(evaluation)).toBe("completion-checks-not-passing")
  })
})

describe("host_check controls", () => {
  const plan = [{ id: "gate", checklist: [host("perm", "permissions"), cmd("after", "true")] }]

  test("a registered check grades its control in declared order and records its provenance", async () => {
    const arm = await armed(plan)
    const seen: RelayArm.HostCheckInput[] = []
    const permissions: RelayArm.HostCheck = (input) => Effect.sync(() => (seen.push(input), result("pass")))
    const evaluation = await arm.fire({ hostChecks: checks({ permissions }) })
    expect(evaluation.outcome).toBe("complete")
    expect(seen).toEqual([
      { token: TOKEN, sessionID: "session", gateID: "gate", check: { id: "perm", hostCheck: "permissions" } },
    ])
    const [first, second] = await entries(arm.env)
    expect(first).toMatchObject({
      ...judged("perm", "pass", "deterministic"),
      oracle: PERMISSIONS,
      host_check: "permissions",
      revision: "revision-1",
      event_id: "event-1",
    })
    expect(Object.keys(first!).slice(-8)).toEqual([
      "host_check",
      "revision",
      "event_id",
      "gen",
      "prev",
      "seq",
      "mac",
      "h",
    ])
    expect(second).toMatchObject(judged("after", "pass", "deterministic"))
    expect(evaluation.capture).toEqual({ complete: true, results: [{ ...result("pass"), name: "perm" }] })
  })

  const outOfContract = { status: "pass" } as unknown as RelayArm.HostCheckResult
  test.each([
    ["fail", () => Effect.succeed(result("fail")), "deterministic"],
    ["skip", () => Effect.succeed(result("skip")), "deterministic"],
    ["missing", () => Effect.succeed(result("missing")), "unavailable(missing)"],
    ["acquisition-error", () => Effect.succeed(result("acquisition-error")), "unavailable(spawn)"],
    ["a defect", () => Effect.die("boom"), "unavailable(spawn)"],
    ["an answer out of contract", () => Effect.succeed(outOfContract), "unavailable(spawn)"],
  ] as ReadonlyArray<[string, RelayArm.HostCheck, string]>)("%s never passes", async (_, permissions, graded_by) => {
    const arm = await armed(plan)
    const evaluation = await arm.fire({ hostChecks: checks({ permissions }) })
    expect(evaluation).toMatchObject({ outcome: "gate-fail", failing: ["perm"] })
    expect((await entries(arm.env))[0]).toMatchObject(judged("perm", "fail", graded_by))
    expect(evaluation.capture?.complete).toBe(true)
    expect(evaluation.capture?.results.map((entry) => entry.name)).toEqual(["perm"])
  })

  test("an unbound check fails closed, has no capture result and leaves the capture incomplete", async () => {
    const arm = await armed(plan)
    const evaluation = await arm.fire({ hostChecks: checks({}) })
    expect(evaluation).toMatchObject({ outcome: "gate-fail", failing: ["perm"] })
    const [item] = await entries(arm.env)
    expect(item).toMatchObject({ ...judged("perm", "fail", "unavailable(missing)"), host_check: "permissions" })
    expect(item).not.toHaveProperty("event_id")
    expect(evaluation.capture).toEqual({ complete: false, results: [] })
  })

  test("a check that does not answer within 60 seconds is an acquisition error", async () => {
    const arm = await armed(plan)
    const evaluation = await run(
      arm.env,
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const permissions: RelayArm.HostCheck = () =>
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never))
        const fiber = yield* Effect.forkChild(
          ArmEvaluate.evaluate({ token: TOKEN, hostChecks: checks({ permissions }) }),
        )
        yield* Deferred.await(started)
        // Let the race's timer fiber register its sleep before the clock moves.
        yield* Effect.forEach(Array.from({ length: 20 }), () => Effect.yieldNow, { discard: true })
        yield* TestClock.adjust("60 seconds")
        return yield* Fiber.join(fiber)
      }),
    )
    expect(evaluation).toMatchObject({ outcome: "gate-fail", failing: ["perm"] })
    expect((await entries(arm.env))[0]).toMatchObject(judged("perm", "fail", "unavailable(timeout)"))
    expect(evaluation.capture?.results[0]).toMatchObject({ status: "acquisition-error" })
  })
})

describe("host_check re-runs and audit (WP18)", () => {
  const plan = [{ id: "A", checklist: [host("a", "check-a")] }, { id: "B", checklist: [host("b", "check-b")] }]

  test("an accepted host check is re-run when a later evaluation grades the next gate, once per evaluation", async () => {
    const arm = await armed(plan)
    const runs: string[] = []
    const status: Record<string, RelayArm.HostCheckResult["status"]> = { a: "pass", b: "fail" }
    const graded: RelayArm.HostCheck = (input) => Effect.sync(() => (runs.push(input.check.id), result(status[input.check.id]!)))
    const bound = checks({ "check-a": graded, "check-b": graded })
    expect(await arm.fire({ mode: "all-gates", hostChecks: bound })).toMatchObject({ outcome: "gate-fail", wp: "B", failing: ["b"] })
    // Gate A passed in this evaluation, so gate B does not run it again.
    expect(runs).toEqual(["a", "b"])
    status.a = "fail"
    status.b = "pass"
    runs.length = 0
    const regressed = await arm.fire({ mode: "all-gates", hostChecks: bound })
    expect(regressed).toMatchObject({ outcome: "regression-fail", wp: "B", failing: ["a"] })
    expect(runs).toEqual(["b", "a"])
    expect(regressed.capture?.results.map((entry) => entry.name)).toEqual(["b", "a"])
    expect((await entries(arm.env)).findLast((entry) => entry.event === "regression-item")).toMatchObject({
      item: "a",
      verdict: "fail",
      graded_by: "deterministic",
      oracle: createHash("sha256").update("host_check:check-a").digest("hex"),
      origin: "regression",
      host_check: "check-a",
      revision: "revision-1",
      event_id: "event-1",
    })
    status.a = "pass"
    expect((await arm.fire({ mode: "all-gates", hostChecks: bound })).outcome).toBe("complete")
    expect((await verify(arm.env)).exit).toBe(0)
  })

  test("relay verify takes a host check's name as its oracle, and problems reads its records", async () => {
    const arm = await armed([{ id: "gate", checklist: [host("perm", "permissions")] }])
    const permissions: RelayArm.HostCheck = () => Effect.succeed(result("pass"))
    expect((await arm.fire({ hostChecks: checks({ permissions }) })).outcome).toBe("complete")
    const audit = () => Effect.runPromise(RelayAudit.verify(arm.env.arm))
    expect(await audit()).toMatchObject({ chain_intact: true, result: "PASS", oracle_recheck: { status: "ok", items: [] } })
    expect(await Effect.runPromise(RelayAudit.problems(arm.env.arm))).toMatchObject({ problems: [] })
    // A renamed check is a different oracle; a check name that is not text makes the sprint unreadable.
    await write(arm.env.arm, { "sprint.json": JSON.stringify({ work_packages: [{ id: "gate", checklist: [host("perm", "renamed")] }] }) })
    expect(await audit()).toMatchObject({
      result: "SPRINT-DIVERGED",
      oracle_recheck: { status: "diverged", items: [{ id: "perm", kind: "changed", recorded: PERMISSIONS.slice(0, 12) }] },
    })
    await write(arm.env.arm, { "sprint.json": JSON.stringify({ work_packages: [{ id: "gate", checklist: [{ id: "perm", host_check: 7 }] }] }) })
    expect(await audit()).toMatchObject({
      result: "SPRINT-INVALID",
      oracle_recheck: { status: "invalid", reason: "work_packages[0].checklist[0].host_check must be a string" },
    })
  })
})

describe("revision guard", () => {
  const plan = [{ id: "gate", checklist: [host("perm", "permissions")] }]

  test("a HEAD that moves during the checks is revision-drift and records no round or disposition", async () => {
    const arm = await armed(plan, { commits: [{ "seed.txt": "seed\n" }] })
    const permissions: RelayArm.HostCheck = () =>
      Effect.promise(async () => {
        await write(arm.env.work, { "moved.txt": "moved\n" })
        await git(arm.env.work, arm.env.home, "add", "-A")
        await git(arm.env.work, arm.env.home, "commit", "-q", "-m", "moved")
        return result("pass")
      })
    const evaluation = await arm.fire({ hostChecks: checks({ permissions }), revisionGuard: true })
    expect(evaluation).toMatchObject({ outcome: "revision-drift", wp: "gate" })
    expect(await events(arm.env)).toEqual([])
    expect([await arm.file("retry_gate"), await arm.file("state")]).toEqual([undefined, undefined])
    expect(ArmEvaluate.hold(evaluation)).toBe("completion-revision-drift")
  })

  test("a stable HEAD binds the arm's own provenance to it", async () => {
    const arm = await armed(plan, { commits: [{ "seed.txt": "seed\n" }] })
    const permissions: RelayArm.HostCheck = () => Effect.die("boom")
    const evaluation = await arm.fire({ hostChecks: checks({ permissions }), revisionGuard: true })
    expect(evaluation.outcome).toBe("gate-fail")
    expect(evaluation.capture?.results[0]?.provenance).toMatchObject({ revision: arm.shas[0], revisionKind: "git" })
    expect((await entries(arm.env))[0]).toMatchObject({ revision: arm.shas[0] })
  })

  test("a workdir with no readable HEAD fails closed before any check", async () => {
    const arm = await armed([{ id: "gate", checklist: [cmd("ran", "printf x >> ran")] }])
    expect((await arm.fire({ revisionGuard: true })).outcome).toBe("defect")
    expect(existsSync(path.join(arm.env.work, "ran"))).toBe(false)
    expect(await events(arm.env)).toEqual([])
  })
})

describe("observe", () => {
  const plan = [{ id: "gate", checklist: [host("perm", "permissions")] }]
  const permissions: RelayArm.HostCheck = () => Effect.succeed(result("pass"))

  test("runs after the checks and before the round and the disposition are recorded", async () => {
    const arm = await armed(plan)
    const seen: Array<{ capture: RelayArm.HostCapture; ledger: unknown[] }> = []
    const observe = (capture: RelayArm.HostCapture) =>
      Effect.promise(async () => void seen.push({ capture, ledger: await events(arm.env) }))
    const evaluation = await arm.fire({ hostChecks: checks({ permissions }), observe })
    expect(evaluation.outcome).toBe("complete")
    expect(seen).toEqual([{ capture: { complete: true, results: [{ ...result("pass"), name: "perm" }] }, ledger: [] }])
    expect(await events(arm.env)).toEqual(["checklist-item", "sprint-complete"])
  })

  test("an observer that fails stops the evaluation before anything is recorded", async () => {
    const arm = await armed(plan)
    const evaluation = await arm.fire({ hostChecks: checks({ permissions }), observe: () => Effect.die("down") })
    expect(evaluation.outcome).toBe("defect")
    expect(await events(arm.env)).toEqual([])
    expect(await arm.file("state")).toBeUndefined()
  })
})

describe("Maestro conditions (§9)", () => {
  // Every run of the control leaves a byte in `ran`, so a parked arm can be shown to run nothing.
  const gate = (budget: number) =>
    armed([{ id: "A", checklist: [cmd("A-file", "printf x >> ran; test -f done")] }], {
      plan: { retry_budget: budget },
    })
  const ran = (arm: Armed) => read(path.join(arm.env.work, "ran"))
  const release = (arm: Armed, reason: string) => run(arm.env, ArmEvaluate.release(TOKEN, reason))
  const refusal = (arm: Armed, reason: string) => run(arm.env, Effect.flip(ArmEvaluate.release(TOKEN, reason)))
  const standing = (arm: Armed) => run(arm.env, ArmEvaluate.parked(TOKEN))

  test("1: a spent budget holds with the parked code, the failing checks and the instruction not to dispatch", async () => {
    const arm = await gate(1)
    const first = await arm.fire()
    expect([first.outcome, ArmEvaluate.hold(first)]).toEqual(["gate-fail", "completion-checks-not-passing"])
    const spent = await arm.fire()
    expect([spent.outcome, ArmEvaluate.hold(spent)]).toEqual(["escalate", "completion-parked-awaiting-owner"])
    expect(ArmEvaluate.parkedHold(spent.wp!, spent.failing)).toBe(
      "Gate 'A' is parked awaiting the owner because its retry budget is spent. " +
        "Failing: A-file. Do not dispatch again; tell the owner what failed and why. Only the owner can release or " +
        "cancel it, and a release resets the retry budget of gate 'A' only.",
    )
  })

  test("2: only a release with a reason resumes a parked arm; the world passing never does", async () => {
    const arm = await gate(0)
    expect((await arm.fire()).outcome).toBe("escalate")
    await write(arm.env.work, { done: "yes\n" })
    expect((await arm.fire()).outcome).toBe("parked")
    expect(await ran(arm)).toBe("x")
    expect(await refusal(arm, " \t\r\n")).toMatchObject({ reason: "a release must say who and why" })
    await release(arm, "owner: fixture repaired")
    expect((await arm.fire()).outcome).toBe("complete")
    expect((await entries(arm.env)).find((entry) => entry.event === "human-release")).toMatchObject({
      wp: "A",
      reason: "owner: fixture repaired",
    })
    expect(await refusal(arm, "owner: again")).toMatchObject({ reason: "arm is not parked" })
  })

  test("3: a dispatch on a parked token holds at once with the failing list and never runs a check", async () => {
    const arm = await gate(0)
    expect(await standing(arm)).toEqual(Option.none())
    expect((await arm.fire()).outcome).toBe("escalate")
    expect(await standing(arm)).toEqual(Option.some({ wp: "A", failing: ["A-file"] }))
    const held = await arm.fire()
    expect(held).toMatchObject({ outcome: "parked", wp: "A", failing: ["A-file"] })
    expect(ArmEvaluate.hold(held)).toBe("completion-parked-awaiting-owner")
    expect(await ran(arm)).toBe("x")
    await release(arm, "owner: look again")
    expect(await standing(arm)).toEqual(Option.none())
  })

  test("4: the budget is per gate, 0 parks on the first failure, and a release resets that gate only", async () => {
    const zero = await gate(0)
    expect((await zero.fire()).outcome).toBe("escalate")
    expect(await zero.file("retry_A")).toBeUndefined()

    const plan = [
      { id: "A", checklist: [cmd("a", "test -f a")] },
      { id: "B", checklist: [cmd("b", "test -f b")] },
    ]
    const arm = await armed(plan, { plan: { retry_budget: 1 } })
    expect((await arm.fire()).outcome).toBe("gate-fail")
    await write(arm.env.work, { a: "" })
    expect((await arm.fire()).outcome).toBe("advance")
    // Gate A spent part of its budget; gate B starts with its own.
    expect((await arm.fire()).reason).toStartWith("Relay gate 'B' is NOT satisfied.")
    expect((await arm.fire()).outcome).toBe("escalate")
    await release(arm, "owner: reset B")
    expect((await arm.fire()).outcome).toBe("gate-fail")
    expect([await arm.file("retry_A"), await arm.file("retry_B")]).toEqual(["1\n", "1\n"])
  })
})

describe("arm boundaries", () => {
  test("a second evaluation of an arm already being evaluated is busy and changes nothing", async () => {
    const arm = await armed([{ id: "gate", checklist: [host("perm", "permissions")] }])
    const outcomes = await run(
      arm.env,
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const proceed = yield* Deferred.make<void>()
        const permissions: RelayArm.HostCheck = () =>
          Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(proceed)), Effect.as(result("pass")))
        const fiber = yield* Effect.forkChild(
          ArmEvaluate.evaluate({ token: TOKEN, hostChecks: checks({ permissions }) }),
        )
        yield* Deferred.await(started)
        const second = yield* ArmEvaluate.evaluate({ token: TOKEN })
        yield* Deferred.succeed(proceed, undefined)
        return [second.outcome, (yield* Fiber.join(fiber)).outcome]
      }),
    )
    expect(outcomes).toEqual(["busy", "complete"])
    expect(await events(arm.env)).toEqual(["checklist-item", "sprint-complete"])
  })

  test("WP6-4: an arm whose meta.json the strict loader refuses is a defect before anything is charged", async () => {
    const arm = await armed([{ id: "A" }])
    await write(arm.env.arm, { "meta.json": '{"workdir":1}' })
    expect((await arm.fire()).outcome).toBe("defect")
    expect(await arm.file("entered_at")).toBeUndefined()
  })

  test("WP6-4: a sprint with duplicate keys or a workdir that is not a directory is a defect", async () => {
    const duplicate = await armed([{ id: "A" }])
    await write(duplicate.env.arm, { "sprint.json": '{"work_packages":[],"work_packages":[{"id":"A"}]}' })
    expect((await duplicate.fire()).outcome).toBe("defect")
    const gone = await armed([{ id: "A" }])
    await write(gone.env.arm, { "meta.json": JSON.stringify({ workdir: path.join(gone.env.dir, "gone") }) })
    expect((await gone.fire()).outcome).toBe("defect")
  })

  test("WP6-5: a record that cannot be appended stops the evaluation instead of being skipped", async () => {
    const arm = await armed([{ id: "A", kind: "inject", text: "rules", checklist: [cmd("ran", "printf x >> ran")] }])
    await write(arm.env.arm, { "ledger.jsonl/": "" })
    expect((await arm.fire()).outcome).toBe("defect")
    // The hook would have dropped the inject record and graded the checklist anyway.
    expect(existsSync(path.join(arm.env.work, "ran"))).toBe(false)
  })
})

describe("counters and re-runs", () => {
  test("WP6-7: an earlier control whose re-run cannot start is a regression, not a pass", async () => {
    const arm = await armed([{ id: "A", checklist: [cmd("kept", "true")] }, { id: "B" }])
    expect((await arm.fire()).outcome).toBe("advance")
    const missing = GateShell.Service.of({ run: () => Effect.fail(new GateShell.Unavailable({ reason: "missing" })) })
    const evaluation = await run(arm.env, ArmEvaluate.evaluate({ token: TOKEN }), { shell: missing })
    expect(evaluation).toMatchObject({ outcome: "regression-fail", wp: "B", failing: ["kept"] })
    expect((await entries(arm.env)).at(-2)).toMatchObject({ event: "regression-item", item: "kept", verdict: "fail" })
  })

  test("WP6-8: a retry counter that is not a number is a defect; an empty one counts from 0 against the budget", async () => {
    const junk = await armed([{ id: "A", checklist: [cmd("a", "false")] }])
    await write(junk.env.arm, { retry_A: "junk\n" })
    expect((await junk.fire()).outcome).toBe("defect")
    const empty = await armed([{ id: "A", checklist: [cmd("a", "false")] }], { plan: { retry_budget: 0 } })
    await write(empty.env.arm, { retry_A: "" })
    expect((await empty.fire()).outcome).toBe("escalate")
  })
})

describe("transcript", () => {
  const encode = (text: string) => new TextEncoder().encode(text)
  const zero = { in: 0, out: 0, cache_read: 0, cache_write: 0, turns: 0 }

  test("WP6-6: a count jq could not have summed as an integer, or a row that is not JSON, leaves the cost absent", () => {
    expect(ArmCost.window(encode('{"usage":{"input_tokens":1.5}}\n'), 0)).toEqual({ cost: Option.none(), total: 1 })
    expect(ArmCost.window(encode('{"usage":{"input_tokens":"7"}}\n'), 0)).toEqual({ cost: Option.none(), total: 1 })
    expect(ArmCost.window(encode('{"usage":{"input_tokens":1}}\n{broken\n'), 0)).toEqual({
      cost: Option.none(),
      total: 2,
    })
  })

  test("a final row without LF is charged but not counted, so it is charged again once complete", () => {
    const transcript = encode('{"usage":{"input_tokens":1}}\n{"usage":{"input_tokens":4,"output_tokens":2}}')
    expect(ArmCost.window(transcript, 1)).toEqual({ cost: Option.some({ ...zero, in: 4, out: 2, turns: 1 }), total: 1 })
  })

  test.each([
    ['{"content":"stuck\\nRELAY-BLOCKED:  the key is missing  "}', "the key is missing"],
    ["RELAY-BLOCKED: one\nRELAY-BLOCKED: two\n", "two"],
    ["RELAY-BLOCKED:   \n", undefined],
  ])("the claim in %j is %j", (text, claim) => {
    const found = ArmCost.claim(encode(text))
    expect(found === undefined ? undefined : new TextDecoder().decode(found)).toBe(claim)
  })
})
