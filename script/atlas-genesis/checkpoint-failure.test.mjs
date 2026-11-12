import assert from "node:assert/strict"
import { test } from "node:test"
import { checkpointFailure } from "./checkpoint-failure.mjs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { controlIdentity } from "./checkpoint-fixture.mjs"
import { fileURLToPath } from "node:url"
import { createCommandClient, ModelCommandError } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"

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
    await assert.rejects(remote.initialize(), (error) => {
      assert.deepEqual(checkpointFailure(error, "snapshot"),
        { version: 1, phase: "snapshot", kind: "remote-http", status, method: "GET" })
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
  const needle = 'return { ...receipt, kind: "model-command", reason }'
  assert.equal(source.split(needle).length, 2)
  const mutant = Function("assert", `return ${source.replace(needle, "return receipt")}`)(assert)
  assert.throws(() => oracle(mutant), assert.AssertionError)
})

test("throwing and changing accessors cannot escape or swap a validated value for private data", () => {
  const secret = "synthetic-private-accessor-0123456789"
  const throwing = { get name() { throw new Error(secret) } }
  assert.deepEqual(checkpointFailure(throwing, "runner"), { version: 1, phase: "runner", kind: "unknown" })
  let reads = 0
  assert.deepEqual(checkpointFailure({ name: "ModelCommandError", get reason() { return ++reads === 1 ? "timeout" : secret } }, "runner"),
    { version: 1, phase: "runner", kind: "model-command", reason: "timeout" })
  assert.equal(reads, 1)
})

test("the actual runner catch emits a structured receipt and keeps the governed nonzero refusal", () => {
  const client = createCommandClient({ cmd: "env", args: ["GITHUB_ACTIONS=false", process.execPath,
    fileURLToPath(new URL("./checkpoint-runner.mjs", import.meta.url))] })
  assert.throws(() => client.complete("diagnostic wiring control\n", { timeoutMs: 10000, costCap: 1 }), (error) => {
    assert(error instanceof ModelCommandError)
    assert.equal(error.reason, "nonzero-exit")
    assert(error.message.includes('atlas-checkpoint-failure {"version":1,"phase":"runner","kind":"unknown"}'))
    assert(error.message.includes("protected genesis failed; recover external checkpoints before another mining attempt"))
    return true
  })
})
