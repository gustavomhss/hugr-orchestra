import { afterAll, describe, expect, test } from "bun:test"
import path from "node:path"
import { mkdirSync, rmSync } from "node:fs"
import { Effect, Redacted, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ArmEvaluate } from "@orchestra/relay/arm/evaluate"
import { ArmState } from "@orchestra/relay/arm/state"
import { LedgerChain } from "@orchestra/relay/ledger/chain"
import { RelayWorkflowBinding } from "../src/relay-workflow-binding"
import { RelayWorkflowTransition } from "../src/relay-workflow-transition"
import { RelayWorkflowEvaluator } from "../src/relay-workflow-evaluator"
import { cleanup, entries, read, repo, run, scratch, write, type Env, type Requirements } from "../../relay/test/arm-harness"

// Prepared for the combined validation batch. Actual shell/git ports, HMAC ledger, filesystem faults; no mock grader.
afterAll(cleanup)
const key = "workflow-adapter-test-key"

async function fixture(fail = false, second = false) {
  const env = await scratch()
  await repo(env, [{ "tracked.txt": "initial" }])
  const sprint = JSON.stringify({ gen: 1, retry_budget: 3, macros: [{ id: "next", instructions: "Next macro" }],
    work_packages: [
      { id: "first", checklist: [{ id: "real-check", cmd: `printf 'grade\\n' >> grades; ${fail ? "false" : "true"}` }] },
      ...(second ? [{ id: "second", macro: "next", instructions: "Next work", checklist: [] }] : []),
    ] })
  const binding = Schema.decodeUnknownSync(RelayArm.WorkflowBinding)({
    definition: {
      publication: { projectID: "project", documentID: "doc", activeVersionID: "version",
        immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
      materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: RelayWorkflowBinding.digest(Buffer.from(sprint)),
        byteLength: Buffer.byteLength(sprint) }, resolvedSkills: [], parameters: {}, writePaths: [env.work],
    }, planRevisionID: "evt_revision", executionSessionID: "ses_worker", authoritySessionID: "ses_owner", logicalTaskID: "task",
  })
  const settlement = Schema.decodeUnknownSync(RelayArm.WorkflowSettlement)({ assistantMessageID: "msg_first",
    expected: { position: "first", attempt: 0, ledgerSeq: -1 } })
  await write(env.arm, { "sprint.json": sprint, "meta.json": JSON.stringify({ workdir: env.work, workflow: binding,
    project_id: binding.definition.publication.projectID, session_id: binding.executionSessionID }),
    position: "first", counter: "0\n", state: "active" })
  return { env, input: { token: "tok", binding, settlement, revalidate: () => Effect.void } satisfies RelayWorkflowTransition.Input }
}

// Mirrors the host's existing armed/ports provider, plus the required forwarding of durable settlement identity.
function transition(env: Env, input: RelayWorkflowTransition.Input) {
  return run(env, Effect.gen(function* () {
    const ports = yield* Effect.context<Requirements>()
    const evaluator: RelayWorkflowTransition.Evaluator = {
      evaluate: (plain, boundary) => RelayWorkflowEvaluator.native.evaluate({ ...plain,
        binding: input.binding, settlement: input.settlement }, boundary).pipe(Effect.provide(ports)),
      reconcile: (pending, checkpoint) => RelayWorkflowEvaluator.native.reconcile(pending, checkpoint).pipe(Effect.provide(ports)),
    }
    return yield* RelayWorkflowTransition.transition(input).pipe(
      Effect.provideService(RelayWorkflowTransition.NativeEvaluator, evaluator), Effect.result,
    )
  }), { key })
}

function held(result: Awaited<ReturnType<typeof transition>>, reason: string) {
  expect(result._tag).toBe("Failure")
  if (result._tag === "Failure") expect(result.failure.reason).toBe(reason)
}

describe("native workflow settlement", () => {
  test("duplicate assistant/position replays full result without grading or retry charge", async () => {
    const item = await fixture(true)
    const first = await transition(item.env, item.input)
    expect(first._tag).toBe("Success")
    if (first._tag === "Success") expect(first.success.outcome).toBe("gate-fail")
    const ledger = await read(path.join(item.env.arm, "ledger.jsonl"))
    const entered = await read(path.join(item.env.arm, "entered_at"))
    expect(await transition(item.env, item.input)).toEqual(first)
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
    expect(await read(path.join(item.env.arm, "retry_first"))).toBe("1\n")
    expect(await read(path.join(item.env.arm, "entered_at"))).toBe(entered)
    expect(await read(path.join(item.env.arm, "ledger.jsonl"))).toBe(ledger)
    expect((await entries(item.env)).filter((entry) => entry.event === "workflow-disposition")).toHaveLength(1)
  })

  test("wrong expected position/attempt/sequence holds before all evaluator mutations", async () => {
    for (const expected of [{ position: "other", attempt: 0, ledgerSeq: -1 },
      { position: "first", attempt: 1, ledgerSeq: -1 }, { position: "first", attempt: 0, ledgerSeq: 0 }]) {
      const item = await fixture()
      held(await transition(item.env, { ...item.input, settlement: { ...item.input.settlement, expected } }),
        "WORKFLOW_SETTLEMENT_POSITION_MISMATCH")
      expect(await Bun.file(path.join(item.env.work, "grades")).exists()).toBe(false)
      expect(await Bun.file(path.join(item.env.arm, "agent_id")).exists()).toBe(false)
      expect(await Bun.file(path.join(item.env.arm, "entered_at")).exists()).toBe(false)
      expect(await read(path.join(item.env.arm, "counter"))).toBe("0\n")
    }
  })

  test("partial advance repairs cursor/base/macro from signed receipt without grading", async () => {
    const item = await fixture(false, true)
    // The next base isn't read until disposition writes; force failure after cursor writes reached disk.
    mkdirSync(path.join(item.env.arm, "base_second"))
    held(await transition(item.env, item.input), "WORKFLOW_SETTLEMENT_ACQUISITION")
    expect(await read(path.join(item.env.arm, "position"))).toBe("next.second")
    const ledger = await read(path.join(item.env.arm, "ledger.jsonl"))
    rmSync(path.join(item.env.arm, "base_second"), { recursive: true })
    const resumed = await transition(item.env, item.input)
    expect(resumed._tag).toBe("Success")
    if (resumed._tag === "Success") expect(resumed.success.outcome).toBe("advance")
    expect(await read(path.join(item.env.arm, "counter"))).toBe("1\n")
    expect(await read(path.join(item.env.arm, "base_second"))).toMatch(/^[0-9a-f]{40}$/)
    expect(await Bun.file(path.join(item.env.arm, "macro_next")).exists()).toBe(true)
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
    expect(await read(path.join(item.env.arm, "ledger.jsonl"))).toBe(ledger)
  })

  test("partial failed round repairs retry once", async () => {
    const item = await fixture(true)
    const input = { ...item.input, observe: () => Effect.sync(() => { mkdirSync(path.join(item.env.arm, "round_first")) }) }
    held(await transition(item.env, input), "WORKFLOW_SETTLEMENT_ACQUISITION")
    rmSync(path.join(item.env.arm, "round_first"), { recursive: true })
    const repaired = await transition(item.env, input)
    expect(repaired._tag).toBe("Success")
    expect(await read(path.join(item.env.arm, "retry_first"))).toBe("1\n")
    expect(await read(path.join(item.env.arm, "round_first"))).toMatch(/^[0-9a-f]{64}$/)
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
  })

  test("missing disposition holds even when ordinary old PASS exists", async () => {
    const item = await fixture()
    await run(item.env, LedgerChain.append({ ledger: path.join(item.env.arm, "ledger.jsonl"), gen: 1,
      key: Redacted.make(key), body: JSON.stringify({ event: "checklist-item", wp: "first", verdict: "pass" }) }))
    const input = { ...item.input, settlement: { ...item.input.settlement,
      expected: { ...item.input.settlement.expected, ledgerSeq: 0 } } }
    const fault = { ...input, observe: () => Effect.die("observer failed") }
    held(await transition(item.env, fault), "WORKFLOW_SETTLEMENT_ACQUISITION")
    held(await transition(item.env, input), "WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
    expect(await read(path.join(item.env.arm, "counter"))).toBe("0\n")
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
  })

  test("invalid HMAC chain holds on replay", async () => {
    const item = await fixture(true)
    expect((await transition(item.env, item.input))._tag).toBe("Success")
    const ledger = await read(path.join(item.env.arm, "ledger.jsonl"))
    await write(item.env.arm, { "ledger.jsonl": ledger.replace('"retry":1', '"retry":9') })
    held(await transition(item.env, item.input), "WORKFLOW_LEDGER_INVALID")
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
    expect(await read(path.join(item.env.arm, "retry_first"))).toBe("1\n")
  })

  test("complete saves full durable evaluation before release and replays it", async () => {
    const item = await fixture()
    const result = await transition(item.env, item.input)
    expect(result._tag).toBe("Success")
    if (result._tag === "Success") {
      expect(result.success.outcome).toBe("complete")
      expect(result.success.ledgerSeq).toBe(2)
    }
    expect(await read(path.join(item.env.arm, "state"))).toBe("complete")
    expect(await transition(item.env, item.input)).toEqual(result)
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
    expect(await Bun.file(path.join(item.env.arm, "workflow_pending.json")).exists()).toBe(false)
    expect(ArmState.held(item.env.arm)).toBe(false)
  })

  test("revalidation error cannot bind, grade or advance", async () => {
    const item = await fixture()
    held(await transition(item.env, { ...item.input, agentID: "worker", revalidate: () =>
      Effect.fail(new RelayWorkflowBinding.Held({ reason: "WORKFLOW_PUBLICATION_DRIFT" })) }), "WORKFLOW_PUBLICATION_DRIFT")
    expect(await Bun.file(path.join(item.env.arm, "agent_id")).exists()).toBe(false)
    expect(await Bun.file(path.join(item.env.work, "grades")).exists()).toBe(false)
    expect(await read(path.join(item.env.arm, "counter"))).toBe("0\n")
  })

  test("unsigned settled JSON cannot impersonate a different assistant's receipt", async () => {
    const item = await fixture(true)
    const first = await transition(item.env, item.input)
    expect(first._tag).toBe("Success")
    if (first._tag !== "Success") throw new Error("fixture did not settle")
    const settlement = Schema.decodeUnknownSync(RelayArm.WorkflowSettlement)({ ...item.input.settlement, assistantMessageID: "msg_forged" })
    await write(item.env.arm, { [`workflow_${RelayWorkflowBinding.digest(Buffer.from(settlement.assistantMessageID))}.json`]:
      JSON.stringify({ binding: item.input.binding, settlement, phase: "settled", evaluation: first.success }) })
    held(await transition(item.env, { ...item.input, settlement }), "WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
    expect(await read(path.join(item.env.work, "grades"))).toBe("grade\n")
  })

  test("reconciliation cannot acquire a second lock or repair outside ownership", async () => {
    const item = await fixture()
    const result = await run(item.env, RelayWorkflowEvaluator.native.reconcile(item.input,
      { binding: item.input.binding, settlement: item.input.settlement, phase: "pending" }).pipe(Effect.result), { key })
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.reason).toBe("WORKFLOW_SETTLEMENT_LOCK_REQUIRED")
  })

  test("legacy unbound evaluation keeps ordinary ledger and catch-to-defect behavior", async () => {
    const item = await fixture(true)
    const evaluation = await run(item.env, ArmEvaluate.evaluate({ token: "tok", blockCap: 0 }), { key })
    expect(evaluation.outcome).toBe("gate-fail")
    expect(evaluation.ledgerSeq).toBe(1)
    expect((await entries(item.env)).map((entry) => entry.event)).toEqual(["checklist-item", "gate-fail"])
    expect(await read(path.join(item.env.arm, "retry_first"))).toBe("1\n")
    const broken = await fixture()
    expect((await run(broken.env, ArmEvaluate.evaluate({ token: "tok", observe: () => Effect.die("broken") }), { key })).outcome).toBe("defect")
    expect(await read(path.join(broken.env.arm, "counter"))).toBe("0\n")
    expect(ArmState.held(broken.env.arm)).toBe(false)
  })
})
