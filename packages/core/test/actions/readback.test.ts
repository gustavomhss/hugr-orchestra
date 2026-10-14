import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { ActionsError } from "../../src/actions/error"
import { ActionsGitHubRead } from "../../src/actions/github/index"
import { ActionsReadback } from "../../src/actions/readback"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { fixture, github, gitlab, intent, it, runID } from "./assembly-fixture"
import { fault } from "./operations-fixture"

type Fixture = Effect.Success<ReturnType<typeof fixture>>

it.live("unknown and unattributed readback does no provider lookup, re-execution or new admission", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create()
    const executions: string[] = []
    const prepared = yield* f.api.prepare(binding, intent(binding, f.commit))
    yield* fault(
      f.operations.execute(binding, { id: prepared.id, input: {} }, () =>
        Effect.sync(() => {
          executions.push("unknown")
        }).pipe(
          Effect.andThen(
            Effect.fail(
              new ActionsError({ kind: "outcome_unknown", message: "Native reply lost", disposition: "unknown" }),
            ),
          ),
        ),
      ),
      "outcome_unknown",
    )
    const receipts = [yield* f.api.operation(binding, prepared.id)]
    yield* Effect.forEach([{}, { unattributed: true }, { runID, unattributed: true }], (acknowledgement) =>
      Effect.gen(function* () {
        const command = intent(binding, f.commit)
        const admitted = yield* f.api.prepare(binding, command)
        receipts.push(
          yield* f.operations.execute(binding, { id: admitted.id, input: {} }, () =>
            Effect.sync(() => {
              executions.push(command.clientID)
              return acknowledgement
            }),
          ),
        )
      }),
    )
    const before = yield* f.database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all()
    yield* Effect.forEach(receipts, (receipt) =>
      Effect.gen(function* () {
        expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(receipt)
        expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(receipt)
      }),
    )
    expect(f.requests).toEqual([])
    expect(executions).toHaveLength(4)
    expect(yield* f.database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all()).toEqual(
      before,
    )
  }),
)

const mismatches: { name: string; native?: Schema.JsonObject; target?: Actions.OperationTarget }[] = [
  { name: "workflow", native: { workflow_id: "43" } },
  { name: "branch ref", native: { head_branch: "release" } },
  { name: "commit", native: { head_sha: "f".repeat(40) } },
  { name: "dispatch event", native: { event: "push" } },
  { name: "target run", target: { workflowID: "42", ref: "refs/heads/main", runID: "43" } },
  { name: "immutable SHA ref", target: { workflowID: "42", ref: "f".repeat(40) } },
]
mismatches.forEach((mismatch) => {
  it.live(`GitHub dispatch readback keeps wrong ${mismatch.name} pending using actual reader`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const binding = yield* f.create()
      Object.assign(f.native.github, { head_branch: "main", status: "queued" }, mismatch.native)
      const command = intent(binding, f.commit, mismatch.target ? { target: mismatch.target } : {})
      const receipt = yield* accepted(f, binding, command, { runID })
      const before = yield* row(f, receipt.id)
      expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(receipt)
      expect(yield* row(f, receipt.id)).toEqual(before)
      expect(f.requests.map((call) => call.input.path)).toEqual([
        "repositories/1234",
        `repositories/1234/actions/runs/${runID}`,
      ])
    }),
  )
})

const gitlabMismatches: { name: string; native?: Schema.JsonObject; target?: Actions.OperationTarget }[] = [
  { name: "workflow slot", target: { workflowID: "gitlab:project:999:pipeline", ref: "refs/heads/main" } },
  { name: "branch ref", native: { ref: "release" } },
  { name: "commit", native: { sha: "f".repeat(40) } },
  { name: "target run", target: { workflowID: "gitlab:project:5678:pipeline", ref: "refs/heads/main", runID: "43" } },
]
gitlabMismatches.forEach((mismatch) => {
  it.live(`GitLab dispatch readback keeps wrong ${mismatch.name} pending using actual reader`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const binding = yield* f.create(gitlab)
      Object.assign(f.native.gitlab, { ref: "main", status: "running" }, mismatch.native)
      const command = intent(binding, f.commit, mismatch.target ? { target: mismatch.target } : {})
      const receipt = yield* accepted(f, binding, command, { runID })
      const before = yield* row(f, receipt.id)
      expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(receipt)
      expect(yield* row(f, receipt.id)).toEqual(before)
      expect(f.requests.map((call) => call.input.path)).toEqual(["projects/5678", `projects/5678/pipelines/${runID}`])
    }),
  )
})

Array.of(github, gitlab).forEach((provider) => {
  it.live(`${provider.kind} dispatch confirms exact native acknowledgement, commit, workflow and ref`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const binding = yield* f.create(provider)
      Object.assign(f.native.github, { head_branch: "main" })
      Object.assign(f.native.gitlab, { ref: "main" })
      const command = intent(binding, f.commit)
      const acknowledgement = { runID }
      const receipt = yield* accepted(f, binding, command, acknowledgement)
      const confirmed = yield* f.api.reconcile(binding, receipt.id)
      expect(confirmed).toMatchObject({
        id: receipt.id,
        state: "confirmed",
        target: command.target,
        result: acknowledgement,
      })
      expect(Schema.is(Actions.Operation)(confirmed)).toBe(true)
      const before = yield* row(f, receipt.id)
      const requests = f.requests.length
      expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(confirmed)
      expect(f.requests).toHaveLength(requests)
      expect(yield* row(f, receipt.id)).toEqual(before)
    }),
  )
})

it.live("immutable SHA dispatch ref matches commit without inventing branch name", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create()
    const command = intent(binding, f.commit, { target: { workflowID: "42", ref: f.commit.toUpperCase() } })
    const receipt = yield* accepted(f, binding, command, { runID })
    expect((yield* f.api.reconcile(binding, receipt.id)).state).toBe("confirmed")
  }),
)

it.live("reader rejects different native run ID and keeps durable receipt intact", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create()
    const receipt = yield* accepted(f, binding, intent(binding, f.commit), { runID })
    const before = yield* row(f, receipt.id)
    Object.assign(f.native.github, { id: "43", head_branch: "main" })
    yield* fault(f.api.reconcile(binding, receipt.id), "transport_failed")
    expect(yield* row(f, receipt.id)).toEqual(before)
  }),
)

it.live("GitLab reader rejects foreign native pipeline ID and keeps durable receipt intact", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create(gitlab)
    const receipt = yield* accepted(f, binding, intent(binding, f.commit), { runID })
    const before = yield* row(f, receipt.id)
    Object.assign(f.native.gitlab, { id: "43", ref: "main" })
    yield* fault(f.api.reconcile(binding, receipt.id), "binding_stale")
    expect(yield* row(f, receipt.id)).toEqual(before)
  }),
)

const retries: { name: string; attempt?: number; acknowledged?: number; state: Actions.Operation["state"] }[] = [
  { name: "missing native attempt", acknowledged: 4, state: "accepted" },
  { name: "old native attempt", attempt: 3, acknowledged: 4, state: "accepted" },
  { name: "missing acknowledged attempt", attempt: 4, state: "accepted" },
  { name: "matching native attempt", attempt: 4, acknowledged: 4, state: "confirmed" },
  { name: "later native attempt", attempt: 5, acknowledged: 4, state: "confirmed" },
]
retries.forEach((retry) => {
  it.live(`retry readback requires native attempt: ${retry.name}`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const binding = yield* f.create()
      f.native.github = {
        ...Object.fromEntries(Object.entries(f.native.github).filter(([key]) => key !== "run_attempt")),
        ...(retry.attempt === undefined ? {} : { run_attempt: retry.attempt }),
      }
      const command = intent(binding, f.commit, {
        kind: "run.retryFailed",
        target: { runID },
        expected: { commit: f.commit, attempt: 3 },
      })
      const receipt = yield* accepted(f, binding, command, {
        runID,
        ...(retry.acknowledged === undefined ? {} : { attempt: retry.acknowledged }),
      })
      expect((yield* f.api.reconcile(binding, receipt.id)).state).toBe(retry.state)
      expect((yield* row(f, receipt.id))?.expected).toEqual(command.expected)
    }),
  )
})

it.live("GitLab retry stays pending when native pipeline exposes no attempt", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create(gitlab)
    const receipt = yield* accepted(f, binding, intent(binding, f.commit, { kind: "run.retry", target: { runID } }), {
      runID,
      attempt: 4,
    })
    expect(yield* f.api.reconcile(binding, receipt.id)).toEqual(receipt)
    expect(f.requests.map((call) => call.input.path)).toEqual(["projects/5678", `projects/5678/pipelines/${runID}`])
  }),
)
const cancellations = [
  { provider: github, status: "in_progress", conclusion: null, state: "accepted" },
  { provider: github, status: "completed", conclusion: "cancelled", state: "confirmed" },
  { provider: gitlab, status: "canceling", conclusion: null, state: "accepted" },
  { provider: gitlab, status: "canceled", conclusion: null, state: "confirmed" },
] satisfies {
  provider: Actions.Provider
  status: string
  conclusion: string | null
  state: Actions.Operation["state"]
}[]
cancellations.forEach((cancel) => {
  it.live(`${cancel.provider.kind} cancel requires desired native status: ${cancel.status}`, () =>
    Effect.gen(function* () {
      const f = yield* fixture()
      const binding = yield* f.create(cancel.provider)
      Object.assign(f.native.github, { status: cancel.status, conclusion: cancel.conclusion })
      Object.assign(f.native.gitlab, { status: cancel.status })
      const receipt = yield* accepted(
        f,
        binding,
        intent(binding, f.commit, { kind: "run.forceCancel", target: { runID } }),
        { runID },
      )
      expect((yield* f.api.reconcile(binding, receipt.id)).state).toBe(cancel.state)
    }),
  )
})

it.live("readback uses temporary intent clone; caller and observer edits cannot change durable commit/target", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    yield* f.clone()
    const binding = yield* f.create()
    Object.assign(f.native.github, { head_branch: "main" })
    const target = { workflowID: "42", ref: "refs/heads/main" }
    const expected = { commit: f.commit }
    const command = intent(binding, f.commit, { target, expected })
    const snapshot = structuredClone(command)
    const acknowledgement = { runID }
    const receipt = yield* accepted(f, binding, command, acknowledgement)
    target.ref = "refs/heads/edited"
    expected.commit = "f".repeat(40)
    const reader = ActionsGitHubRead.make({ transport: f.transport })
    const confirmed = yield* f.operations.reconcile(binding, receipt.id, (admitted, acknowledged) =>
      Effect.gen(function* () {
        expect(admitted).toEqual(snapshot)
        expect(acknowledged).toEqual(acknowledgement)
        const observed = yield* ActionsReadback.observe(reader, binding, admitted, acknowledged)
        expect(admitted).toEqual(snapshot)
        Object.assign(admitted.target, { ref: "observer-edited" })
        Object.assign(admitted.expected ?? {}, { commit: "observer-edited" })
        return observed
      }),
    )
    expect(confirmed.state).toBe("confirmed")
    expect(yield* row(f, receipt.id)).toMatchObject({
      target: snapshot.target,
      expected: snapshot.expected,
      result: acknowledgement,
    })
  }),
)

it.live("execute secret payload and invalid native result extras never become durable receipt data", () =>
  Effect.gen(function* () {
    const f = yield* fixture()
    const binding = yield* f.create()
    const payload = { token: "execute-secret-123", values: { password: "nested-secret-456" } }
    const received: unknown[] = []
    const prepared = yield* f.api.prepare(binding, intent(binding, f.commit))
    const acceptedReceipt = yield* f.operations.execute(
      binding,
      { id: prepared.id, input: payload },
      (_intent, input) =>
        Effect.sync(() => {
          received.push(input)
          return { runID }
        }),
    )
    expect(received).toEqual([payload])
    expect(acceptedReceipt.result).toEqual({ runID })
    const invalid = yield* f.api.prepare(binding, intent(binding, f.commit))
    const extra = { runID, token: "native-result-secret-789" }
    yield* fault(
      f.operations.execute(binding, { id: invalid.id, input: payload }, () => Effect.succeed(extra)),
      "outcome_unknown",
    )
    expect((yield* f.api.operation(binding, invalid.id)).state).toBe("outcome_unknown")
    expect((yield* row(f, invalid.id))?.result).toBeNull()
    const durable = JSON.stringify(yield* f.database.db.select().from(ActionsOperationTable).all())
    Array.of("execute-secret-123", "nested-secret-456", "native-result-secret-789").forEach((secret) =>
      expect(durable).not.toContain(secret),
    )
    expect(f.requests).toEqual([])
  }),
)

const accepted = (
  f: Fixture,
  binding: Actions.Binding,
  command: Actions.OperationIntent,
  acknowledgement: Actions.OperationAcknowledgement,
) =>
  Effect.gen(function* () {
    const prepared = yield* f.api.prepare(binding, command)
    const receipt = yield* f.operations.execute(binding, { id: prepared.id, input: {} }, () =>
      Effect.succeed(acknowledgement),
    )
    expect(receipt.state).toBe("accepted")
    return receipt
  })

const row = (f: Fixture, id: Actions.OperationID) =>
  f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, id)).get()
