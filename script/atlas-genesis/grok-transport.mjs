// Exercise the real compiled ModelClient/socket boundary. No subprocess implementation is duplicated here.
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const answer = "The transport control preserves the complete input envelope."
const prompt = " ".repeat(180000) + `Reply exactly with this sentence and nothing else: ${answer}\n`
const wrapper = fileURLToPath(new URL("./grok-text.sh", import.meta.url))

export async function fixtureTransport(out) {
  const { createCommandClient, ModelCommandError } = await import("../../modules/atlas/packages/adapter-io/dist/src/index.js")
  mkdirSync(join(out, "bin"), { recursive: true })
  mkdirSync(join(out, "private"))
  const hash = createHash("sha256").update(prompt).digest("hex")
  const receipt = join(out, "transport.json")
  writeFileSync(join(out, "bin/grok"), `#!/usr/bin/env node
const fs = require('node:fs'), assert = require('node:assert/strict'), crypto = require('node:crypto')
const args = process.argv.slice(2)
assert(args.every(arg => Buffer.byteLength(arg) < 131072))
assert.equal(args[args.indexOf('--model') + 1], 'grok-4.7')
assert.equal(args[args.indexOf('--max-turns') + 1], '1')
const file = args[args.indexOf('--prompt-file') + 1]
assert.equal(file, '/dev/stdin')
const bytes = fs.readFileSync(file) // Reopen the path, exactly the operation that failed in the actual CLI.
assert(fs.fstatSync(0).isFile())
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), ${JSON.stringify(hash)})
assert.equal(fs.readdirSync(${JSON.stringify(join(out, "private"))}).length, 0, 'prompt must be unlinked before model exec')
fs.writeFileSync(${JSON.stringify(receipt)}, JSON.stringify({bytes:bytes.length,sha256:${JSON.stringify(hash)},regularStdin:true,promptUnlinked:true}))
console.log(${JSON.stringify(answer)})
`, { mode: 0o700 })
  const command = (script) => ({ cmd: "env", args: [
    `PATH=${join(out, "bin")}:${process.env.PATH}`, `RUNNER_TEMP=${join(out, "private")}`, script,
  ] })
  assert.equal(createCommandClient(command(wrapper)).complete(prompt, { timeoutMs: 10000, costCap: 1 }).claim, answer)
  assert.deepEqual(readdirSync(join(out, "private")), [])
  const source = readFileSync(wrapper, "utf8")
  const start = source.indexOf("# socket-to-file:begin\n")
  const end = source.indexOf("# socket-to-file:end\n") + "# socket-to-file:end\n".length
  assert(start >= 0 && end > start && source.split("# socket-to-file:begin\n").length === 2)
  const mutant = join(out, "mutant.sh")
  writeFileSync(mutant, source.slice(0, start) + source.slice(end), { mode: 0o700 })
  writeFileSync(join(out, "grok-agent.json"), readFileSync(new URL("./grok-agent.json", import.meta.url)))
  assert.throws(() => createCommandClient(command(mutant)).complete(prompt, { timeoutMs: 10000, costCap: 1 }),
    (error) => error instanceof ModelCommandError && error.reason === "nonzero-exit" && /ENXIO|ENODEV/.test(error.message))
  return JSON.parse(readFileSync(receipt, "utf8"))
}

async function subscriptionTransport(receipt) {
  const { createCommandClient } = await import("../../modules/atlas/packages/adapter-io/dist/src/index.js")
  const result = createCommandClient({ cmd: wrapper, args: [] }).complete(prompt, { timeoutMs: 600000, costCap: 1 })
  assert.equal(result.claim, answer, "transport: real subscription command must settle the exact socket-fed control")
  writeFileSync(receipt, JSON.stringify({ promptBytes: Buffer.byteLength(prompt), accepted: true,
    transport: "compiled-command-socket-to-unlinked-regular-file", timeoutMs: 600000 }) + "\n", { flag: "wx" })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert(process.env.GITHUB_ACTIONS === "true", "transport: remote runner required")
  const [command, out] = process.argv.slice(2)
  if (command === "fixture") console.log(JSON.stringify(await fixtureTransport(out)))
  else if (command === "subscription") await subscriptionTransport(out)
  else throw new Error("usage: grok-transport.mjs fixture <out> | subscription <receipt.json>")
}
