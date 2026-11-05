// Source routing only. No provider, network, process, or filesystem calls.
// Identity strings are copied at create: later caller mutation cannot redirect a route.
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { decodeChain, sha256 } from "./checkpoint.mjs"

export function createContinuation(records, expected, retryRequest) {
  const identity = expected.identity
  const chain = decodeChain(records, identity)
  assert.equal(identity.mode, "production", "continuation: production mode required")
  assert.equal(records.length, expected.lastSequence, "continuation: last sequence mismatch")
  assert.equal(sha256(records.at(-1)), expected.lastEnvelopeSha256, "continuation: last envelope mismatch")
  const dispatches = chain.envelopes.filter((event) => event.kind === "dispatch")
  const completions = chain.envelopes.filter((event) => event.kind === "completion")
  assert.equal(dispatches.length, expected.dispatches, "continuation: dispatch population mismatch")
  assert.equal(completions.length, expected.completions, "continuation: completion population mismatch")
  // Exactly one original request stays pending. Zero or two are a population failure, not a route.
  assert.equal(chain.inFlight.length, 1, "continuation: pending population mismatch")
  const pending = chain.inFlight[0]
  assert.equal(pending.request, expected.inFlightRequest, "continuation: pending request mismatch")
  assert.equal(pending.promptSha256, expected.inFlightPromptSha256, "continuation: pending prompt mismatch")
  assert.equal(retryRequest, pending.request, "continuation: retry request mismatch")
  bindFinalSnapshot(chain, expected)
  const sourceRun = identity.run
  const sourceAttempt = identity.attempt
  const arms = [...identity.arms]
  const sources = sourceMap(dispatches, completions)
  const issued = new Map()
  const freshHashes = new Set()

  function take(input) {
    const receipt = requireReceipt(input, arms)
    const known = sources.get(receipt.promptSha256)
    if (known) return reserveBound(known, receipt)
    // Unknown prompts stay closed until every original completion AND the selected retry are confirmed.
    // A known source hash never falls through to this fresh path.
    assert([...sources.values()].every((source) => source.confirmed), "continuation: source incomplete")
    assert(!freshHashes.has(receipt.promptSha256), "continuation: already reserved")
    freshHashes.add(receipt.promptSha256)
    return issue(receipt, Object.freeze({ kind: "fresh" }), "fresh")
  }

  // Arm/length mismatch refuses before reservation, so a bad receipt cannot consume the source.
  function reserveBound(bound, receipt) {
    assert(bound.arm === receipt.arm && bound.promptBytes === receipt.promptBytes, "continuation: source binding mismatch")
    assert(!bound.reserved, "continuation: already reserved")
    bound.reserved = true
    const origin = Object.freeze({
      kind: bound.kind,
      sourceRun,
      sourceAttempt,
      sourceRequest: bound.sourceRequest,
    })
    return issue(receipt, origin, bound.kind, bound)
  }

  function issue(receipt, origin, kind, bound) {
    const request = randomUUID()
    const ticket = {
      request,
      arm: receipt.arm,
      promptSha256: receipt.promptSha256,
      promptBytes: receipt.promptBytes,
      origin,
    }
    if (bound?.completion) ticket.completion = bound.completion
    issued.set(request, { kind, confirmed: false, bound })
    return Object.freeze(ticket)
  }

  function confirm(request) {
    const record = issued.get(request)
    assert(record, "continuation: unknown request")
    assert(!record.confirmed, "continuation: already confirmed")
    record.confirmed = true
    if (record.bound) record.bound.confirmed = true
  }

  function summary() {
    let replayed = 0
    let retried = 0
    let fresh = 0
    let inFlight = 0
    for (const record of issued.values()) {
      if (!record.confirmed) {
        inFlight += 1
        continue
      }
      if (record.kind === "replay") replayed += 1
      if (record.kind === "retry") retried += 1
      if (record.kind === "fresh") fresh += 1
    }
    return Object.freeze({ replayed, retried, fresh, inFlight, originalUnresolved: 1 })
  }

  return Object.freeze({ take, confirm, summary })
}

function requireReceipt(input, arms) {
  const arm = input?.arm
  const promptSha256 = input?.promptSha256
  const promptBytes = input?.promptBytes
  assert(arms.includes(arm), "continuation: invalid receipt")
  assert(typeof promptSha256 === "string" && /^[0-9a-f]{64}$/.test(promptSha256), "continuation: invalid receipt")
  assert(Number.isSafeInteger(promptBytes) && promptBytes > 0, "continuation: invalid receipt")
  return { arm, promptSha256, promptBytes }
}

function sourceMap(dispatches, completions) {
  const completed = new Map(completions.map((event) => [event.request, event]))
  const sources = new Map()
  for (const dispatch of dispatches) {
    assert(!sources.has(dispatch.promptSha256), "continuation: ambiguous source hash")
    const completion = completed.get(dispatch.request)
    sources.set(dispatch.promptSha256, {
      kind: completion ? "replay" : "retry",
      arm: dispatch.arm,
      promptBytes: dispatch.promptBytes,
      sourceRequest: dispatch.request,
      completion: completion ? Object.freeze({
        exitCode: completion.exitCode,
        stdout: completion.stdout,
        stderr: completion.stderr,
      }) : undefined,
      reserved: false,
      confirmed: false,
    })
  }
  return sources
}

function bindFinalSnapshot(chain, expected) {
  const snapshot = chain.envelopes.findLast((event) => event.kind === "snapshot")
  assert(snapshot, "continuation: missing final snapshot")
  const plan = snapshot.files.find((file) => file.path === "evidence/plan-advisory.json")
  const staging = snapshot.files.find((file) => file.path === "atlas/staging.json")
  assert(plan, "continuation: plan hash mismatch")
  assert.equal(plan.sha256, expected.planSha256, "continuation: plan hash mismatch")
  assert(staging, "continuation: staging hash mismatch")
  assert.equal(staging.sha256, expected.stagingSha256, "continuation: staging hash mismatch")
  const cas = snapshot.files.filter((file) => file.path.startsWith("atlas/cas/"))
    .map((file) => [file.path.slice("atlas/cas/".length), file.sha256])
    .sort((left, right) => left[0].localeCompare(right[0]))
  assert.equal(cas.length, expected.casFiles, "continuation: CAS population mismatch")
  assert.equal(sha256(JSON.stringify(cas)), expected.casInventorySha256, "continuation: CAS inventory mismatch")
}
