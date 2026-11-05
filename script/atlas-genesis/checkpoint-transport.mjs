// Real compiled ModelClient + protected shell controls. The fake executable is the model, not the transport.
import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { createCommandClient, ModelCommandError } from "../../modules/atlas/packages/adapter-io/dist/src/index.js"
import { controlIdentity, controlStore } from "./checkpoint-fixture.mjs"
import { checkpointRemote } from "./checkpoint-remote.mjs"
import { startCheckpointWriter } from "./checkpoint-runner.mjs"
import { decodeChain, sha256, snapshotFiles } from "./checkpoint.mjs"

const wrapper = fileURLToPath(new URL("./grok-checkpoint.sh", import.meta.url))
const answer = "The original checkpoint transport completion is preserved."
const prompt = " ".repeat(180000) + "one complete prompt\n"

function model(directory, hang = false) {
  mkdirSync(join(directory, "bin"), { recursive: true })
  mkdirSync(join(directory, "private"), { recursive: true })
  writeFileSync(join(directory, "bin/grok"), `#!/usr/bin/env node
const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const args = process.argv.slice(2)
assert.equal(args[args.indexOf('--model') + 1], 'grok-4.7')
assert.equal(args[args.indexOf('--max-turns') + 1], '1')
assert(args.every(arg => Buffer.byteLength(arg) < 131072))
assert(fs.fstatSync(0).isFile())
const bytes = fs.readFileSync(args[args.indexOf('--prompt-file') + 1])
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), ${JSON.stringify(sha256(prompt))})
fs.writeFileSync(${JSON.stringify(join(directory, "model.pid"))}, String(process.pid))
${hang ? "setInterval(() => {}, 60000)" : `console.log(${JSON.stringify(answer)})`}
`, { mode: 0o700 })
  return createCommandClient({ cmd: "env", args: [`PATH=${join(directory, "bin")}:${process.env.PATH}`,
    `RUNNER_TEMP=${join(directory, "private")}`, wrapper] })
}

function capability(url, nonce) {
  const previous = { url: process.env.ATLAS_CHECKPOINT_URL, nonce: process.env.ATLAS_CHECKPOINT_NONCE }
  process.env.ATLAS_CHECKPOINT_URL = url
  process.env.ATLAS_CHECKPOINT_NONCE = nonce
  return () => {
    if (previous.url === undefined) delete process.env.ATLAS_CHECKPOINT_URL
    if (previous.url !== undefined) process.env.ATLAS_CHECKPOINT_URL = previous.url
    if (previous.nonce === undefined) delete process.env.ATLAS_CHECKPOINT_NONCE
    if (previous.nonce !== undefined) process.env.ATLAS_CHECKPOINT_NONCE = previous.nonce
  }
}

export async function refusedTransport(directory) {
  const server = new Worker(new URL("./checkpoint-http-control.mjs", import.meta.url))
  const [url] = await once(server, "message")
  const release = capability(url, "local-negative-control-only")
  try {
    const client = model(join(directory, "failed-upload"))
    assert.throws(() => client.complete(prompt, { timeoutMs: 10000, costCap: 1 }), (error) =>
      error instanceof ModelCommandError && error.reason === "nonzero-exit" && !error.message.includes(answer))
    const hanging = model(join(directory, "terminated"), true)
    assert.throws(() => hanging.complete(prompt, { timeoutMs: 2000, costCap: 1 }), (error) =>
      error instanceof ModelCommandError && error.reason === "timeout")
    const pid = Number(readFileSync(join(directory, "terminated/model.pid")))
    assert(Number.isSafeInteger(pid) && pid > 0)
    assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH")
  } finally {
    release()
    await server.terminate()
  }
}

export async function remoteTransport(directory) {
  assert(process.env.GITHUB_ACTIONS === "true", "checkpoint transport: remote runner required")
  mkdirSync(directory, { recursive: true })
  controlStore(join(directory, "store"))
  const identity = { ...controlIdentity, mode: "transport", revision: process.env.GITHUB_SHA,
    run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT }
  const evidence = join(directory, "evidence")
  mkdirSync(evidence)
  const writer = await startCheckpointWriter(identity, join(directory, "writer"), { repo: join(directory, "store"), evidence })
  const release = capability(writer.url, writer.nonce)
  try {
    writer.write({ kind: "snapshot", boundary: "initial", files: snapshotFiles(join(directory, "store"), join(directory, "unused")) })
    writeFileSync(join(evidence, "plan-advisory.json"), '{"sites":[{"rank":1,"path":"src/control.ts"}]}\n', { flag: "wx" })
    assert.equal(model(directory).complete(prompt, { timeoutMs: 600000, costCap: 1 }).claim, answer)
    const remote = checkpointRemote({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GH_TOKEN })
    const chain = decodeChain(await remote.read(identity), identity)
    assert.equal(chain.completions.length, 1)
    assert.equal(chain.inFlight.length, 0)
    assert.equal(chain.completions[0].promptSha256, sha256(prompt))
    assert.equal(chain.completions[0].promptBytes, Buffer.byteLength(prompt))
    assert.equal(Buffer.from(chain.completions[0].stdout, "base64").toString(), `${answer}\n`)
    assert.equal(chain.completions[0].exitCode, 0)
    const dispatchAt = chain.envelopes.findIndex((envelope) => envelope.kind === "dispatch")
    const planAt = chain.envelopes.findIndex((envelope) => envelope.kind === "snapshot" &&
      envelope.files.some((file) => file.path === "evidence/plan-advisory.json"))
    assert(planAt >= 0 && planAt < dispatchAt, "checkpoint transport: plan must be durable before dispatch")
    writeFileSync(join(directory, "verified.json"), JSON.stringify({ compiledClient: true, protectedWrapper: true,
      externallyAcknowledgedCompletion: true, promptBytes: Buffer.byteLength(prompt), modelCalls: 0 }) + "\n", { flag: "wx" })
  } finally {
    release()
    await writer.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.argv.length === 3, "usage: checkpoint-transport.mjs <output-directory>")
  await remoteTransport(process.argv[2])
}
