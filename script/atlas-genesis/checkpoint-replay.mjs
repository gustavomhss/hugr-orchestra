// Offline recovery only: no provider, network or process-creation capability is imported or invoked.
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { decodeChain, restoreChain, sha256, validateIdentity } from "./checkpoint.mjs"

export function prepareReplay(records, identity, destination) {
  assert.equal(identity.mode, "production", "checkpoint replay: production identity required")
  const chain = decodeChain(records, identity)
  const requests = {}
  for (const event of chain.envelopes.filter((event) => event.kind === "dispatch")) {
    assert(!Object.hasOwn(requests, event.promptSha256), "checkpoint replay: ambiguous prompt")
    requests[event.promptSha256] = { request: event.request, arm: event.arm, promptBytes: event.promptBytes }
  }
  assert(Object.keys(requests).length > 0, "checkpoint replay: no dispatches")
  const snapshot = chain.envelopes.findLast((event) => event.kind === "snapshot")
  const plans = Object.fromEntries(snapshot.files.filter((file) => file.path.startsWith("evidence/plan-"))
    .map((file) => [file.path.slice("evidence/plan-".length, -".json".length), file.sha256]))
  for (const entry of Object.values(requests)) assert(Object.hasOwn(plans, entry.arm), "checkpoint replay: missing original plan")
  restoreChain(records, identity, destination)
  for (const event of chain.completions) {
    requests[event.promptSha256].completionSha256 = sha256(readFileSync(join(destination, "responses", `${event.request}.json`)))
  }
  const bytes = Buffer.from(JSON.stringify({ version: 1, identity, requests, plans }) + "\n")
  writeFileSync(join(destination, "replay.json"), bytes, { flag: "wx", mode: 0o600 })
  writeFileSync(join(destination, "replay.sha256"), sha256(bytes), { flag: "wx", mode: 0o600 })
  mkdirSync(join(destination, "usage"), { mode: 0o700 })
}

function manifestAt(directory) {
  const bytes = readFileSync(join(directory, "replay.json"))
  assert.equal(sha256(bytes), readFileSync(join(directory, "replay.sha256"), "utf8"), "checkpoint replay: manifest hash mismatch")
  const manifest = JSON.parse(bytes)
  validateIdentity(manifest.identity)
  assert.equal(manifest.version, 1, "checkpoint replay: unsupported manifest")
  assert.equal(manifest.identity.mode, "production", "checkpoint replay: production identity required")
  return manifest
}

export function verifyReplayPlan(directory, arm, bytes) {
  assert.equal(manifestAt(directory).plans[arm], sha256(bytes), "checkpoint replay: plan mismatch")
}

export function readReplay(directory, prompt) {
  const manifest = manifestAt(directory)
  const key = sha256(prompt)
  const entry = manifest.requests[key]
  const matched = entry !== undefined && entry.promptBytes === prompt.length
  const response = matched && entry.completionSha256 !== undefined ? readFileSync(join(directory, "responses", `${entry.request}.json`)) : undefined
  if (response !== undefined) assert.equal(sha256(response), entry.completionSha256, "checkpoint replay: response hash mismatch")
  const completed = response === undefined ? undefined : JSON.parse(response)
  if (completed !== undefined) {
    assert(completed.kind === "completion" && completed.request === entry.request && completed.arm === entry.arm &&
      completed.promptSha256 === key && completed.promptBytes === prompt.length, "checkpoint replay: response binding mismatch")
    assert.deepEqual(completed.identity, manifest.identity, "checkpoint replay: response identity mismatch")
  }
  const kind = !matched ? "unmatched" : completed === undefined ? "in-flight" : "completion"
  // Reserve delivery atomically across independent processes. A crash cannot silently deliver it twice.
  // The immutable source response remains available for a fresh, explicitly audited recovery attempt.
  try {
    writeFileSync(join(directory, "usage", `${key}.json`), JSON.stringify({ kind, promptSha256: key,
      promptBytes: prompt.length, ...(matched ? { request: entry.request } : {}) }) + "\n", { flag: "wx", mode: 0o600 })
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("checkpoint replay: already delivered")
    throw error
  }
  assert(matched, "checkpoint replay: prompt mismatch")
  if (completed === undefined) return { kind: "in-flight" }
  return { kind: "completion", exitCode: completed.exitCode,
    stdout: Buffer.from(completed.stdout, "base64"), stderr: Buffer.from(completed.stderr, "base64") }
}

export function replaySummary(directory) {
  const requests = Object.values(manifestAt(directory).requests)
  const usage = readdirSync(join(directory, "usage")).map((name) => {
    assert(/^[0-9a-f]{64}\.json$/.test(name), "checkpoint replay: invalid usage path")
    const entry = JSON.parse(readFileSync(join(directory, "usage", name)))
    assert(["completion", "in-flight", "unmatched"].includes(entry.kind), "checkpoint replay: invalid usage disposition")
    return entry
  })
  const completed = requests.filter((entry) => entry.completionSha256 !== undefined).length
  return { dispatched: requests.length, completed, inFlight: requests.length - completed,
    delivered: usage.filter((entry) => entry.kind === "completion").length,
    encounteredInFlight: usage.filter((entry) => entry.kind === "in-flight").length,
    unmatched: usage.filter((entry) => entry.kind === "unmatched").length, providerCalls: 0 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assert(process.argv.length === 4 && process.argv[2] === "command", "checkpoint replay: invalid command")
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const result = readReplay(process.argv[3], Buffer.concat(chunks))
    if (result.kind === "in-flight") {
      process.stderr.write("checkpoint replay: unresolved dispatch; no provider called\n")
      process.exitCode = 2
    }
    if (result.kind === "completion") {
      process.stdout.write(result.stdout)
      process.stderr.write(result.stderr)
      process.exitCode = result.exitCode
    }
  } catch (error) {
    // No unknown error text, paths, prompt bytes or original response bytes enter refusal diagnostics.
    const reason = error?.message
    process.stderr.write(reason === "checkpoint replay: already delivered" ? `${reason}\n` : "checkpoint replay refused; no provider called\n")
    process.exitCode = 2
  }
}
