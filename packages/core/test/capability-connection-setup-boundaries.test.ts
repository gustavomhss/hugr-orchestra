import { expect, test } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Cause, Context, Effect } from "effect"
import { CapabilityConnectionInput } from "../src/capability/connection/input"
import { CapabilityConnectionSetup } from "../src/capability/connection/setup"
import type { CapabilityConnectionSetupContract } from "../src/capability/connection/setup-contract"
import { CapabilityOperator } from "../src/capability/operator/index"
import { CapabilityConnectionManagementFixture } from "./fixture/capability-connection-management"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionSetupFixture.layer)
const input = CapabilityConnectionSetupFixture.input
const placement = CapabilityConnectionSetupFixture.placement

it.live("operator approval precedes network for missing, foreign and provider/placement-denied frames", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const before = yield* f.rows
  CapabilityConnectionSetupFixture.expectCode(yield* f.setup.connect(placement, input).pipe(Effect.exit), "invocation_binding_missing")
  const other = yield* CapabilityOperator.make({ principal: "foreign-setup-owner", scope: { placements: "instance", actions: ["*"] } })
  CapabilityConnectionSetupFixture.expectCode(yield* other.withRequest(other.configured,
    { requestID: "foreign-frame", idempotencyKey: "foreign" }, f.setup.connect(placement, input)).pipe(Effect.exit), "invocation_binding_mismatch")
  const denied = yield* f.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["connection.connect"],
    resources: [{ kind: "provider", id: "discord" }] } })
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement, input), "provider", denied.authority).pipe(Effect.exit), "target_denied")
  const elsewhere = { ...placement, location: { directory: AbsolutePath.make("/other-scope") } }
  const scoped = yield* f.operators.issue({ origin: "sdk", scope: { placements: [elsewhere], actions: ["connection.connect"] } })
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(placement, input), "placement", scoped.authority).pipe(Effect.exit), "target_denied")
  expect(f.seen).toEqual([])
  expect(f.writerStates).toEqual([])
  expect(yield* f.rows).toEqual(before)
}))

test("safe DTO capture never runs getters, proxies, inherited serializers, toJSON or huge/cyclic structures", () => {
  const calls = { getter: 0, proxy: 0, serializer: 0 }
  const accessor = Object.defineProperty({}, "key", { enumerable: true, get() { calls.getter++; return input.key } })
  const proxy = new Proxy({}, { ownKeys() { calls.proxy++; return [] }, getPrototypeOf() { calls.proxy++; return null } })
  const serializer = { toJSON() { calls.serializer++; return {} } }
  const inherited = Object.setPrototypeOf({}, serializer)
  const cycle: { child?: unknown } = {}
  cycle.child = cycle
  ;[accessor, proxy, { nested: proxy }, serializer, inherited, cycle,
    { large: "x".repeat(65537) }, Array.from({ length: 2049 }, () => 0), new Date()].forEach((value) => {
    expect(CapabilityConnectionInput.capture(value, (data) => data)).toEqual({ ok: false })
  })
  expect(calls).toEqual({ getter: 0, proxy: 0, serializer: 0 })
  const value = { optional: undefined, nested: { text: "before" }, array: [1, 2] }
  const captured = CapabilityConnectionInput.capture(value, (data) => data)
  expect(captured.ok).toBe(true)
  value.nested.text = "after"
  value.array[0] = 3
  if (!captured.ok) throw new Error("DTO control did not capture")
  expect(captured.value).toEqual({ optional: undefined, nested: { text: "before" }, array: [1, 2] })
  expect(Object.isFrozen(captured.value)).toBe(true)
})

it.live("setup snapshots input/placement immediately; strict public fields, key and secret-bearing labels reject before HTTP", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const mutable = { ...input }
  const location = { ...placement.location }
  const effect = f.setup.connect({ ...placement, location }, mutable)
  mutable.key += "-changed"
  mutable.label = "changed"
  location.directory = AbsolutePath.make("/changed-after-capture")
  const receipt = yield* f.run(effect)
  const rows = yield* f.rows
  expect(rows.credentials[0].value).toEqual({ type: "key", key: input.key })
  expect(rows.connections[0].directory).toBe(placement.location.directory)
  expect(f.seen[0].authorization).toBe(`Bearer ${input.key}`)
  const calls = { getter: 0, proxy: 0, serializer: 0 }
  const bad = [
    { ...input, key: "" }, { ...input, key: "x".repeat(4097) }, { ...input, key: ` ${input.key}` },
    { ...input, key: `${input.key}\r\nX-Forged: value` }, { ...input, key: input.key + "\t" },
    { ...input, label: "x".repeat(129) }, { ...input, label: `account ${input.key}` },
    { ...input, endpoint: "http://127.0.0.1" }, { ...input, subjectID: "T123" }, { ...input, credentialID: "cred_other" },
    { ...input, agentID: "actor" }, { ...input, invocation: {} },
    Object.defineProperty({ ...input }, "key", { enumerable: true, get() { calls.getter++; return input.key } }),
    new Proxy({ ...input }, { ownKeys() { calls.proxy++; return [] } }),
    { ...input, toJSON() { calls.serializer++; return input } },
  ]
  yield* Effect.forEach(bad, (value) => f.run(f.setup.connect(placement, value)).pipe(Effect.exit,
    Effect.tap((exit) => Effect.sync(() => CapabilityConnectionSetupFixture.expectCode(exit, "connection_unavailable")))))
  const missing = { ...placement, projectID: Project.ID.make("missing-project") }
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(f.setup.connect(missing, input)).pipe(Effect.exit), "connection_unavailable")
  expect(f.seen).toHaveLength(1)
  expect(yield* f.rows).toEqual(rows)
  expect(calls).toEqual({ getter: 0, proxy: 0, serializer: 0 })
  expect(CapabilityConnectionSetupFixture.result(receipt).verification).toBe("verified")
}))

it.live("malicious proof provider/endpoint/integration/identity/fingerprint/descriptors never persists", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const before = yield* f.rows
  const calls = { getter: 0, proxy: 0 }
  const changes: readonly ((proof: CapabilityConnectionSetupContract.Proof) => CapabilityConnectionSetupContract.Proof)[] = [
    (proof) => ({ ...proof, provider: "discord" }),
    (proof) => ({ ...proof, endpoint: "https://untrusted.invalid/api" }),
    (proof) => ({ ...proof, integrationID: Integration.ID.make("capability.discord") }),
    (proof) => ({ ...proof, subjectID: "" }),
    (proof) => ({ ...proof, subjectID: input.key }),
    (proof) => ({ ...proof, scopeHash: "not-a-hash" }),
    (proof) => ({ ...proof, scopeHash: "0".repeat(64) }),
    (proof) => ({ ...proof, subjectID: '["T999","U456",null]' }),
    // Counterfeit a typed proof source using descriptors, without weakening the public DTO types.
    (proof) => Object.defineProperty({ ...proof }, "provider", { value: 17 }),
    (proof) => Object.defineProperty({ ...proof }, "subjectID", { value: [] }),
    (proof) => Object.defineProperty({ ...proof }, "scopeHash", { value: null }),
    (proof) => Object.defineProperty({ ...proof }, "endpoint", { value: undefined }),
    (proof) => Object.defineProperty({ ...proof }, "subjectID", { enumerable: true,
      get() { calls.getter++; return "untrusted" } }),
    (proof) => new Proxy(proof, { ownKeys() { calls.proxy++; return [] } }),
  ]
  yield* Effect.forEach(changes, (change) => Effect.gen(function* () {
    const setup = yield* CapabilityConnectionSetup.make({ operators: f.operators, ledger: f.ledger,
      verifier: { verify: (value) => f.verifier.verify(value).pipe(Effect.map(change)) } })
    const exit = yield* f.run(setup.connect(placement, input)).pipe(Effect.exit)
    CapabilityConnectionSetupFixture.expectCode(exit, "connection_unavailable")
    expect(CapabilityConnectionManagementFixture.publicFailures(exit)).toEqual([{ _tag: "Capability.Failure",
      code: "connection_unavailable", message: "Capability connection is unavailable" }])
    expect(yield* f.rows).toEqual(before)
  }))
  const wrongKey = yield* CapabilityConnectionSetup.make({ operators: f.operators, ledger: f.ledger,
    verifier: { verify: (value) => f.verifier.verify({ ...value, key: value.key + "-different-key" }) } })
  CapabilityConnectionSetupFixture.expectCode(yield* f.run(wrongKey.connect(placement, input)).pipe(Effect.exit), "connection_unavailable")
  expect(yield* f.rows).toEqual(before)
  expect(f.seen).toHaveLength(changes.length + 1)
  expect(calls).toEqual({ getter: 0, proxy: 0 })
}))

it.live("empty/absent labels default to provider; bounded user metadata projects without proof or secret material", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const receipts = yield* Effect.forEach([undefined, "", "x".repeat(128)], (label) => f.run(f.setup.connect(placement, { ...input, label })))
  const rows = yield* f.rows
  expect(rows.connections.map((row) => row.label)).toEqual(["slack", "slack", "x".repeat(128)])
  expect(rows.credentials.map((row) => row.label)).toEqual(["slack", "slack", "x".repeat(128)])
  expect(new Set(rows.connections.map((row) => row.scope_hash)).size).toBe(1)
  const receipt = yield* f.run(f.setup.connect(placement, { ...input, label: undefined }), "optional-label")
  const replay = yield* f.run(f.setup.connect(placement, { provider: input.provider, key: input.key }), "optional-label")
  expect(replay).toEqual({ ...receipt, reused: true })
  CapabilityConnectionSetupFixture.publicReceipts([...receipts, receipt, replay], yield* f.rows, [input.key])
}))

it.live("reconcile/verifier/writer mixed SQL+quota+auth+Die+Interrupt causes retain reasons and annotations", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const before = yield* f.rows
  const sql = CapabilityConnectionSetupFixture.failed(yield* f.database.db.run("SELECT * FROM setup_nonexistent_table").pipe(Effect.exit))
  const Marker = Context.Service<{ boundary: string }>("setup-test/Cause")
  const mixed = Cause.annotate(Cause.combine(sql, Cause.combine(
    Cause.fail(new Capability.Failure({ code: "quota_exceeded", message: "quota rejected" })), Cause.combine(
      Cause.fail(new Capability.Failure({ code: "authentication_required", message: "auth rejected" })),
      Cause.combine(Cause.die("setup-defect"), Cause.interrupt(123))))), Context.make(Marker, { boundary: "setup" }))
  yield* Effect.forEach(["reconcile", "verifier", "writer"] as const, (phase) => Effect.gen(function* () {
    const setup = yield* CapabilityConnectionSetup.make({ operators: f.operators,
      verifier: phase === "verifier" ? { verify: (value) => f.verifier.verify(value).pipe(Effect.andThen(Effect.failCause(mixed))) } : f.verifier,
      ledger: { ...f.ledger,
        reconcile: (target, payload, verify) => f.ledger.reconcile(target, payload, verify).pipe(
          Effect.andThen((previous) => phase === "reconcile" ? Effect.failCause(mixed) : Effect.succeed(previous))),
        commit: (target, payload, write, verify) => f.ledger.commit(target, payload, (tx) => write(tx).pipe(
          Effect.andThen((data) => phase === "writer" ? Effect.failCause(mixed) : Effect.succeed(data))), verify),
      } })
    const actual = CapabilityConnectionSetupFixture.failed(yield* f.run(setup.connect(placement, input)).pipe(Effect.exit))
    CapabilityConnectionSetupFixture.expectCause(actual, mixed)
    actual.reasons.forEach((reason) => expect(Context.getOrUndefined(Cause.reasonAnnotations(reason), Marker)).toEqual({ boundary: "setup" }))
    expect(yield* f.rows).toEqual(before)
  }))
}))
