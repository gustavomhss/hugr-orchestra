import assert from "node:assert/strict"
import { test } from "node:test"
import { mutationSource, verifyMutation } from "./recovery-mutation.mjs"

test("mutation must hit one real expression, never zero or multiple", () => {
  const source = "return signals ??= deps.history.signals(c.site)"
  assert(mutationSource(source, "signals").includes("hotspot: 0"))
  assert.throws(() => mutationSource("", "signals"), /exactly one/)
  assert.throws(() => mutationSource(source + source, "signals"), /exactly one/)
})

test("mutation oracle requires the named assertion failure, not a crash/empty/green/other test", () => {
  const assertion = { title: "defers all reads, memoizes each candidate, and preserves the exact unvisited tail",
    status: "failed", failureMessages: ["AssertionError: expected real signals"] }
  const report = { numTotalTests: 3, numFailedTests: 1, testResults: [{ assertionResults: [assertion] }] }
  verifyMutation(report, "signals", 1)
  assert.throws(() => verifyMutation(report, "signals", 0), /test failure/)
  assert.throws(() => verifyMutation({ ...report, numTotalTests: 0 }, "signals", 1), /no failed tests/)
  assert.throws(() => verifyMutation({ ...report, testResults: [] }, "signals", 1), /named behavioral/)
  assert.throws(() => verifyMutation(report, "authors", 1), /named behavioral/)
  assert.throws(() => verifyMutation({ ...report, testResults: [{ assertionResults: [
    { ...assertion, failureMessages: ["Error: module missing"] },
  ] }] }, "signals", 1), /named behavioral/)
})

for (const [name, source] of [
  ["claim-store", "      ...evidence,"],
  ["claim-union", "replaces ? undefined : prior.claimEvidenceByClaim"],
  ["claim-prune", "const entries = claims.flatMap((claim) => {"],
  ["claim-own", "Object.hasOwn(source, claim) && "],
  ["claim-replace", "replaces ? undefined : prior.claimEvidenceByClaim"],
  ["claim-answer", "[claimNorm]: { factRef, ...(receipt !== undefined ? { answerRef: receipt.answerRef } : {}) },"],
]) {
  test(`${name} mutation requires exactly one target expression`, () => {
    assert.notEqual(mutationSource(source, name), source)
    assert.throws(() => mutationSource("", name), /exactly one/)
    assert.throws(() => mutationSource(source + source, name), /exactly one/)
  })
}
