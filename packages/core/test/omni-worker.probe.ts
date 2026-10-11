// Probe (d), integration plan §7 / H1. Not a test: `bun test` does not pick up *.probe.ts. A Worker loads hugr-omni
// through the core loader and starts a nonce tree, then the host terminates the Worker. The probe prints what it saw
// and exits; the shell reports the host's exit code (Bun aborted with 134 when this was written).
//
//   bun test/omni-worker.probe.ts
//   node --experimental-strip-types test/omni-worker.probe.ts
//
// Needs a built addon and supervisor (bun run omni:build). WP-H turns this into an omni test that must exit 0 with
// the Worker's tree gone.
import { isMainThread, parentPort, Worker } from "node:worker_threads"
import { Omni } from "../src/omni.ts"
import { alive, gone, reap, tree } from "./fixture/process-tree.ts"

if (isMainThread) {
  const worker = new Worker(new URL(import.meta.url))
  const nonce = await new Promise<string>((resolve, reject) => {
    worker.once("message", resolve)
    worker.once("error", reject)
  })
  console.log(`probe(d): worker tree ${nonce} up, ${await alive(nonce)} processes alive`)
  const code = await worker.terminate()
  console.log(`probe(d): worker terminated (code ${code})`)
  const left = await gone(nonce, 5_000)
  console.log(`probe(d): ${left} tree processes alive 5 s after terminate (${left === 0 ? "PASS" : "FAIL"})`)
  await reap(nonce)
}

if (!isMainThread && parentPort) {
  const omni = await Omni.load()
  const fixture = tree(1)
  const child = omni.spawn(fixture.command, fixture.args, { inheritEnv: false, env: Omni.childEnv() })
  for await (const line of child.lines()) if (line.text.includes(fixture.ready)) break
  parentPort.postMessage(fixture.nonce)
  await new Promise(() => {})
}
