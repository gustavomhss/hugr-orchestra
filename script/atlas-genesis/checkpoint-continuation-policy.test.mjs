import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import { test } from "node:test"

const sourceReceipt = JSON.parse(readFileSync(new URL("./checkpoint-replay-source.json", import.meta.url), "utf8"))
const proofReceipt = JSON.parse(readFileSync(new URL("./checkpoint-continuation-proof.json", import.meta.url), "utf8"))
const moduleUrl = new URL("./checkpoint-continuation-policy.mjs", import.meta.url)
const ORCHESTRATOR = "0123456789abcdef0123456789abcdef01234567"
const CANARY = "canary-secret"

function genuine() {
  const identity = sourceReceipt.identity
  return {
    sourceRun: identity.run,
    sourceRevision: identity.revision,
    retryRequest: sourceReceipt.inFlightRequest,
    budget: identity.budget,
    arms: [...identity.arms],
    indexRun: identity.indexRun,
    retainedRuns: [...identity.retainedRuns],
    wrapperSha256: identity.wrapperSha256,
    profileSha256: identity.profileSha256,
    grokVersion: sourceReceipt.grokVersion,
    model: sourceReceipt.model,
    maxTurns: sourceReceipt.maxTurns,
    commandTimeoutMs: sourceReceipt.commandTimeoutMs,
    poolWidth: 8,
    authMode: "subscription",
    initialEnvelopeSha256: sourceReceipt.initialEnvelopeSha256,
    initialStagingSha256: sourceReceipt.initialStagingSha256,
    originalPlanSha256: sourceReceipt.planSha256,
    orchestratorRevision: ORCHESTRATOR,
    proof: {
      repository: proofReceipt.repository,
      workflow: proofReceipt.workflow,
      event: proofReceipt.event,
      branch: proofReceipt.branch,
      run: proofReceipt.run,
      attempt: proofReceipt.attempt,
      head: proofReceipt.head,
      status: "completed",
      conclusion: "success",
      artifact: { ...proofReceipt.artifact, expired: false },
    },
  }
}

let nonce = 0
function loadPolicy() {
  nonce += 1
  return import(`${moduleUrl.href}?n=${nonce}`)
}

function exact(reason) {
  return (error) => error instanceof Error && error.message === `continuation policy: ${reason}`
}

test("accepts frozen source and proof receipts", async () => {
  const { requireContinuationPolicy } = await loadPolicy()
  const observed = genuine()
  const policy = requireContinuationPolicy(observed, sourceReceipt, proofReceipt)
  assert.deepEqual(policy, { ...observed, version: 1, source: sourceReceipt, proofReceipt })
  assert.notEqual(policy.orchestratorRevision, sourceReceipt.identity.revision)
  assert.notEqual(policy.orchestratorRevision, proofReceipt.head)
  assert.equal(policy.version, 1)
  assert.equal(policy.poolWidth, 8)
  assert.equal(policy.authMode, "subscription")
})

const drifts = [
  ["sourceRun", (o) => { o.sourceRun = "0" }, "observed.sourceRun"],
  ["sourceRevision", (o) => { o.sourceRevision = "f".repeat(40) }, "observed.sourceRevision"],
  ["retryRequest", (o) => { o.retryRequest = "retry-other" }, "observed.retryRequest"],
  ["budget", (o) => { o.budget = "201" }, "observed.budget"],
  ["budget type", (o) => { o.budget = 200 }, "observed.budget"],
  ["arms order", (o) => { o.arms = ["dependency", "advisory", "count"] }, "observed.arms"],
  ["arms length", (o) => { o.arms = ["advisory"] }, "observed.arms"],
  ["indexRun", (o) => { o.indexRun = "0" }, "observed.indexRun"],
  ["retainedRuns order", (o) => { o.retainedRuns = [...o.retainedRuns].reverse() }, "observed.retainedRuns"],
  ["wrapperSha256", (o) => { o.wrapperSha256 = "0".repeat(64) }, "observed.wrapperSha256"],
  ["profileSha256", (o) => { o.profileSha256 = "0".repeat(64) }, "observed.profileSha256"],
  ["grokVersion", (o) => { o.grokVersion = "0.0.0" }, "observed.grokVersion"],
  ["model", (o) => { o.model = "grok-4" }, "observed.model"],
  ["maxTurns", (o) => { o.maxTurns = 2 }, "observed.maxTurns"],
  ["commandTimeoutMs", (o) => { o.commandTimeoutMs = 1 }, "observed.commandTimeoutMs"],
  ["poolWidth", (o) => { o.poolWidth = 7 }, "observed.poolWidth"],
  ["authMode", (o) => { o.authMode = "other" }, "observed.authMode"],
  ["initialEnvelopeSha256", (o) => { o.initialEnvelopeSha256 = "0".repeat(64) }, "observed.initialEnvelopeSha256"],
  ["initialStagingSha256", (o) => { o.initialStagingSha256 = "0".repeat(64) }, "observed.initialStagingSha256"],
  ["originalPlanSha256", (o) => { o.originalPlanSha256 = "0".repeat(64) }, "observed.originalPlanSha256"],
  ["orchestratorRevision", (o) => { o.orchestratorRevision = "A".repeat(40) }, "observed.orchestratorRevision"],
  ["proof.repository", (o) => { o.proof.repository = "other/repo" }, "observed.proof.repository"],
  ["proof.workflow", (o) => { o.proof.workflow = "other.yml" }, "observed.proof.workflow"],
  ["proof.event", (o) => { o.proof.event = "push" }, "observed.proof.event"],
  ["proof.branch", (o) => { o.proof.branch = "other" }, "observed.proof.branch"],
  ["proof.run", (o) => { o.proof.run = "0" }, "observed.proof.run"],
  ["proof.attempt", (o) => { o.proof.attempt = "2" }, "observed.proof.attempt"],
  ["proof.head", (o) => { o.proof.head = "f".repeat(40) }, "observed.proof.head"],
  ["proof.status", (o) => { o.proof.status = "queued" }, "observed.proof.status"],
  ["proof.conclusion", (o) => { o.proof.conclusion = "failure" }, "observed.proof.conclusion"],
  ["artifact.id", (o) => { o.proof.artifact.id = "0" }, "observed.proof.artifact.id"],
  ["artifact.name", (o) => { o.proof.artifact.name = "other" }, "observed.proof.artifact.name"],
  ["artifact.digest", (o) => { o.proof.artifact.digest = "sha256:" + "0".repeat(64) }, "observed.proof.artifact.digest"],
  ["artifact.expired", (o) => { o.proof.artifact.expired = true }, "observed.proof.artifact.expired"],
  ["artifact.expired string", (o) => { o.proof.artifact.expired = "false" }, "observed.proof.artifact.expired"],
]

for (const [name, apply, reason] of drifts) {
  test(`refuses ${name} drift`, async () => {
    const { requireContinuationPolicy } = await loadPolicy()
    const observed = genuine()
    apply(observed)
    assert.throws(() => requireContinuationPolicy(observed, sourceReceipt, proofReceipt), exact(reason))
  })
}

const shapes = [
  ["null observed", () => [null, sourceReceipt, proofReceipt], "observed shape"],
  ["array observed", () => [[], sourceReceipt, proofReceipt], "observed shape"],
  ["null source receipt", () => [genuine(), null, proofReceipt], "expectedSourceReceipt shape"],
  ["null proof receipt", () => [genuine(), sourceReceipt, null], "expectedProofReceipt shape"],
  ["missing sourceRun", () => { const o = genuine(); delete o.sourceRun; return [o, sourceReceipt, proofReceipt] }, "missing observed.sourceRun"],
  ["missing proof", () => { const o = genuine(); delete o.proof; return [o, sourceReceipt, proofReceipt] }, "missing observed.proof"],
  ["null proof", () => [{ ...genuine(), proof: null }, sourceReceipt, proofReceipt], "observed.proof shape"],
  ["string proof", () => [{ ...genuine(), proof: "no" }, sourceReceipt, proofReceipt], "observed.proof shape"],
  ["null artifact", () => { const o = genuine(); o.proof.artifact = null; return [o, sourceReceipt, proofReceipt] }, "observed.proof.artifact shape"],
  ["array artifact", () => { const o = genuine(); o.proof.artifact = []; return [o, sourceReceipt, proofReceipt] }, "observed.proof.artifact shape"],
  ["missing status", () => { const o = genuine(); delete o.proof.status; return [o, sourceReceipt, proofReceipt] }, "missing observed.proof.status"],
  ["missing artifact id", () => { const o = genuine(); delete o.proof.artifact.id; return [o, sourceReceipt, proofReceipt] }, "missing observed.proof.artifact.id"],
  ["string arms", () => [{ ...genuine(), arms: "advisory" }, sourceReceipt, proofReceipt], "observed.arms shape"],
  ["null budget", () => [{ ...genuine(), budget: null }, sourceReceipt, proofReceipt], "observed.budget shape"],
  ["string poolWidth", () => [{ ...genuine(), poolWidth: "8" }, sourceReceipt, proofReceipt], "observed.poolWidth shape"],
  ["short revision", () => [{ ...genuine(), orchestratorRevision: "abc" }, sourceReceipt, proofReceipt], "observed.orchestratorRevision"],
  ["null identity", () => [genuine(), { ...sourceReceipt, identity: null }, proofReceipt], "expectedSourceReceipt.identity shape"],
  ["missing inFlightRequest", () => { const source = { ...sourceReceipt }; delete source.inFlightRequest; return [genuine(), source, proofReceipt] }, "missing expectedSourceReceipt.inFlightRequest"],
  ["status on expected proof", () => [genuine(), sourceReceipt, { ...proofReceipt, status: "completed" }], "extra expectedProofReceipt.status"],
  ["conclusion on expected proof", () => [genuine(), sourceReceipt, { ...proofReceipt, conclusion: "success" }], "extra expectedProofReceipt.conclusion"],
  ["extra artifact field", () => { const o = genuine(); o.proof.artifact = { ...o.proof.artifact, note: "x" }; return [o, sourceReceipt, proofReceipt] }, "extra observed.proof.artifact.note"],
  ["extra proof field", () => { const o = genuine(); o.proof = { ...o.proof, note: "x" }; return [o, sourceReceipt, proofReceipt] }, "extra observed.proof.note"],
]

for (const [name, args, reason] of shapes) {
  test(`refuses ${name}`, async () => {
    const { requireContinuationPolicy } = await loadPolicy()
    assert.throws(() => requireContinuationPolicy(...args()), exact(reason))
  })
}

test("refuses a canary secret in an unknown field", async () => {
  const { requireContinuationPolicy } = await loadPolicy()
  const observed = genuine()
  observed.note = CANARY
  const hidden = genuine()
  Object.defineProperty(hidden, "note", { value: CANARY, enumerable: false })
  const symbolic = genuine()
  symbolic[Symbol("note")] = CANARY
  for (const [input, reason] of [
    [observed, "extra observed.note"],
    [hidden, "extra observed.note"],
    [symbolic, "extra observed.symbol"],
  ]) {
    let thrown = null
    try {
      requireContinuationPolicy(input, sourceReceipt, proofReceipt)
    } catch (error) {
      thrown = error
    }
    assert.equal(thrown instanceof Error, true)
    assert.equal(thrown.message, `continuation policy: ${reason}`)
    assert.equal(thrown.message.includes(CANARY), false)
  }
})

test("does not mutate caller inputs and freezes returned nests", async () => {
  const { requireContinuationPolicy } = await loadPolicy()
  const observed = genuine()
  const source = structuredClone(sourceReceipt)
  const proof = structuredClone(proofReceipt)
  const observedBefore = structuredClone(observed)
  const policy = requireContinuationPolicy(observed, source, proof)
  assert.deepEqual(observed, observedBefore)
  assert.deepEqual(source, sourceReceipt)
  assert.deepEqual(proof, proofReceipt)
  observed.budget = "changed"
  observed.arms.push("fresh")
  observed.proof.status = "changed"
  observed.proof.artifact.expired = true
  source.identity.run = "changed"
  source.identity.arms.push("fresh")
  source.identity.retainedRuns.push("fresh")
  proof.head = "changed"
  proof.artifact.digest = "changed"
  assert.equal(policy.budget, sourceReceipt.identity.budget)
  assert.deepEqual(policy.arms, [...sourceReceipt.identity.arms])
  assert.equal(policy.proof.status, "completed")
  assert.equal(policy.proof.artifact.expired, false)
  assert.equal(policy.source.identity.run, sourceReceipt.identity.run)
  assert.deepEqual(policy.source.identity.arms, [...sourceReceipt.identity.arms])
  assert.deepEqual(policy.source.identity.retainedRuns, [...sourceReceipt.identity.retainedRuns])
  assert.equal(policy.proofReceipt.head, proofReceipt.head)
  assert.equal(policy.proofReceipt.artifact.digest, proofReceipt.artifact.digest)
  for (const value of [
    policy, policy.arms, policy.retainedRuns, policy.proof, policy.proof.artifact, policy.source,
    policy.source.identity, policy.source.identity.arms, policy.source.identity.retainedRuns,
    policy.proofReceipt, policy.proofReceipt.artifact,
  ]) assert.equal(Object.isFrozen(value), true)
  assert.notEqual(policy.arms, observed.arms)
  assert.notEqual(policy.source, source)
  assert.notEqual(policy.source.identity, source.identity)
  assert.notEqual(policy.proof, observed.proof)
  assert.notEqual(policy.proofReceipt, proof)
  assert.throws(() => { policy.poolWidth = 1 })
  assert.throws(() => { policy.arms[0] = "fresh" })
  assert.throws(() => { policy.proof.head = "changed" })
  assert.throws(() => { policy.proof.artifact.expired = true })
  assert.throws(() => { policy.source.model = "changed" })
  assert.throws(() => { policy.source.identity.budget = "1" })
  assert.throws(() => { policy.proofReceipt.artifact.id = "changed" })
  assert.equal(Object.isFrozen(observed), false)
  assert.equal(Object.isFrozen(source), false)
  assert.equal(Object.isFrozen(proof), false)
})

async function outcome(apply) {
  const { requireContinuationPolicy } = await loadPolicy()
  const observed = genuine()
  apply(observed)
  try {
    requireContinuationPolicy(observed, sourceReceipt, proofReceipt)
    return "accepted"
  } catch (error) {
    if (!(error instanceof Error)) return "other"
    return error.message
  }
}

async function proveRemoval(needle, probes) {
  const original = await readFile(moduleUrl, "utf8")
  assert.equal(original.includes(needle), true)
  assert.equal(original.split(needle).length, 2)
  for (const [apply, reason] of probes) assert.equal(await outcome(apply), `continuation policy: ${reason}`)
  await writeFile(moduleUrl, original.replace(needle, ""))
  try {
    for (const [apply, reason] of probes) {
      const after = await outcome(apply)
      console.log(`mutant ${reason} before=continuation policy: ${reason} after=${after}`)
      assert.equal(after, "accepted")
    }
  } finally {
    await writeFile(moduleUrl, original)
    assert.equal(await readFile(moduleUrl, "utf8"), original)
  }
}

test("mutation oracle rejects removed configuration checks", async () => {
  const needle = [
    'if (observed.grokVersion !== expectedSourceReceipt.grokVersion) refuse("observed.grokVersion")',
    'if (observed.model !== expectedSourceReceipt.model) refuse("observed.model")',
    'if (observed.maxTurns !== expectedSourceReceipt.maxTurns) refuse("observed.maxTurns")',
    'if (observed.commandTimeoutMs !== expectedSourceReceipt.commandTimeoutMs) refuse("observed.commandTimeoutMs")',
    'if (observed.poolWidth !== 8) refuse("observed.poolWidth")',
    'if (observed.authMode !== "subscription") refuse("observed.authMode")',
  ].join("\n")
  await proveRemoval(needle, [
    [(o) => { o.poolWidth = 1 }, "observed.poolWidth"],
    [(o) => { o.authMode = "other" }, "observed.authMode"],
    [(o) => { o.model = "other" }, "observed.model"],
    [(o) => { o.maxTurns = 2 }, "observed.maxTurns"],
    [(o) => { o.commandTimeoutMs = 1 }, "observed.commandTimeoutMs"],
    [(o) => { o.grokVersion = "0" }, "observed.grokVersion"],
  ])
})

test("mutation oracle rejects removed proof-head check", async () => {
  await proveRemoval(
    'if (observed.proof.head !== expectedProofReceipt.head) refuse("observed.proof.head")',
    [[(o) => { o.proof.head = "f".repeat(40) }, "observed.proof.head"]],
  )
})
