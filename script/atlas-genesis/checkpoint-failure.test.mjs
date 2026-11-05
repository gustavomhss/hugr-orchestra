import assert from "node:assert/strict"
import { test } from "node:test"
import { checkpointFailure } from "./checkpoint-failure.mjs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { controlIdentity } from "./checkpoint-fixture.mjs"

test("failure receipts expose only closed diagnostic fields, never error messages or arbitrary properties", () => {
  const secret = "synthetic-private-failure-detail-0123456789"
  for (const reason of ["timeout", "not-found", "nonzero-exit"]) {
    assert.deepEqual(checkpointFailure({ name: "ModelCommandError", reason, message: secret, stdout: secret }, "runner"),
      { version: 1, phase: "runner", kind: "model-command", reason })
  }
  for (const error of [new Error(secret), secret, null, { name: secret, reason: secret },
    { name: "ModelCommandError", reason: secret }, { name: "CheckpointRemoteError", status: secret }]) {
    const receipt = checkpointFailure(error, "http")
    assert.deepEqual(receipt, { version: 1, phase: "http", kind: "unknown" })
    assert(!JSON.stringify(receipt).includes(secret))
  }
  assert.throws(() => checkpointFailure(new Error(secret), secret), /invalid failure phase/)
})

test("remote refusal retains HTTP status and operation without echoing response bodies or credentials", async () => {
  const secret = "synthetic-private-remote-detail-0123456789"
  for (const status of [403, 429, 503]) {
    const remote = checkpointRemote({ repository: "owner/repo", token: secret,
      request: async () => new Response(secret, { status }) })
    await assert.rejects(remote.append(controlIdentity, 1, Buffer.from("control")), (error) => {
      assert.deepEqual(checkpointFailure(error, "publish"),
        { version: 1, phase: "publish", kind: "remote-http", status, method: "PUT" })
      assert(!String(error).includes(secret))
      return true
    })
  }
})

test("network deadlines and known transport codes remain distinct from model command failures", () => {
  assert.deepEqual(checkpointFailure({ name: "TimeoutError", message: "private" }, "publish"),
    { version: 1, phase: "publish", kind: "transport", reason: "deadline" })
  assert.deepEqual(checkpointFailure({ cause: { code: "ECONNRESET", message: "private" } }, "publish"),
    { version: 1, phase: "publish", kind: "transport", reason: "ECONNRESET" })
  assert.deepEqual(checkpointFailure({ name: "CheckpointRemoteError", status: 503, method: "private" }, "publish"),
    { version: 1, phase: "publish", kind: "unknown" })
})

test("the diagnostic oracle rejects a classifier that silently discards the model failure reason", () => {
  const oracle = (classify) => assert.deepEqual(classify({ name: "ModelCommandError", reason: "timeout" }, "runner"),
    { version: 1, phase: "runner", kind: "model-command", reason: "timeout" })
  oracle(checkpointFailure)
  const source = checkpointFailure.toString()
  const needle = 'return { ...receipt, kind: "model-command", reason: error.reason }'
  assert.equal(source.split(needle).length, 2)
  const mutant = Function("assert", `return ${source.replace(needle, "return receipt")}`)(assert)
  assert.throws(() => oracle(mutant), assert.AssertionError)
})
