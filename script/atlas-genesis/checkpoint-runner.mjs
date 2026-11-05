// Protected campaign composition. Product ranking, admission, budgets and publication remain untouched.
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { once } from "node:events"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { sha256, snapshotFiles, validateIdentity } from "./checkpoint.mjs"

export function checkpointStore(store, checkpoint) {
  let previous
  return {
    ...store,
    commitStaging(decide) {
      const result = store.commitStaging(decide) // The real atomic door, never a replacement writer.
      if (!result.settled) return result
      const head = store.commitStaging((projection) => ({ out: projection }))
      assert(head.settled, "checkpoint: cannot read back settled staging")
      const digest = sha256(JSON.stringify(head.out))
      if (digest === previous) return result
      checkpoint("staging") // A failed external acknowledgement prevents this write from returning.
      previous = digest
      return result
    },
  }
}

export async function protectedMine(repo, env = process.env) {
  assert(env.GITHUB_ACTIONS === "true", "checkpoint: use the remote workflow")
  assert(/^[1-9][0-9]*$/.test(env.BUDGET ?? ""), "checkpoint: missing production budget")
  const identity = {
    revision: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    indexRun: env.INDEX_RUN, retainedRuns: (env.RETAINED_RUNS ?? "").split(","),
    budget: env.BUDGET, arms: (env.ARMS ?? "").split(",").map((arm) => arm.trim()),
    wrapperSha256: sha256(readFileSync(new URL("./grok-text.sh", import.meta.url))),
    profileSha256: sha256(readFileSync(new URL("./grok-agent.json", import.meta.url))),
  }
  validateIdentity(identity)
  assert(identity.arms.slice().sort().join(",") === "advisory,count,dependency" || identity.arms.length === 1,
    "checkpoint: protected composition supports the shared default set or one arm")
  const sab = new SharedArrayBuffer(4)
  const done = new Int32Array(sab)
  const nonce = randomBytes(32).toString("hex")
  const worker = new Worker(new URL("./checkpoint-worker.mjs", import.meta.url), {
    workerData: { sab, identity, nonce, directory: join(env.OUT, "checkpoints") },
  })
  const ready = await Promise.race([once(worker, "message"), new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error("checkpoint: initialization deadline")), 180000)
    timer.unref()
  })])
  assert(typeof ready[0].url === "string", "checkpoint: missing external writer readiness")
  process.env.ATLAS_CHECKPOINT_URL = ready[0].url
  process.env.ATLAS_CHECKPOINT_NONCE = nonce
  const checkpoint = (boundary) => {
    Atomics.store(done, 0, 0)
    worker.postMessage({ kind: "snapshot", boundary, files: snapshotFiles(repo, env.ATLAS_MINE_EVIDENCE_DIR) })
    const waited = Atomics.wait(done, 0, 0, 300000)
    assert(waited !== "timed-out" && Atomics.load(done, 0) === 1, "checkpoint: external snapshot not acknowledged")
  }
  try {
    const { createDiskStore, createHistorySource, gitSidecarTrust, initAst } = await import("../../modules/atlas/packages/adapter-io/dist/src/index.js")
    const { driveMineArms, driveMinePass, foldArms } = await import("../../modules/atlas/packages/cli/dist/src/mine.js")
    await initAst()
    checkpoint("initial") // Before ranking or model execution, prove that retained state is externally safe.
    const store = checkpointStore(createDiskStore(join(repo, ".atlas/cas"), () => identity.revision, gitSidecarTrust(repo)), checkpoint)
    const deps = { history: createHistorySource(repo, "HEAD"), store, env: process.env,
      onPlan: () => checkpoint("plan") }
    const arms = driveMineArms(repo, deps, (root, passDeps) => {
      checkpoint(`arm-start:${passDeps.slot}`)
      const pass = driveMinePass(root, passDeps)
      checkpoint(`arm-end:${passDeps.slot}`)
      return pass
    })
    checkpoint("final")
    return foldArms(arms, Number(env.BUDGET))
  } finally {
    await worker.terminate()
    delete process.env.ATLAS_CHECKPOINT_URL
    delete process.env.ATLAS_CHECKPOINT_NONCE
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const verdict = await protectedMine(process.cwd())
    process.stdout.write(verdict.stdout)
    if (verdict.stderr) process.stderr.write(verdict.stderr)
    process.exitCode = verdict.exitCode
  } catch {
    console.error("protected genesis failed; recover external checkpoints before another mining attempt")
    process.exitCode = 2
  }
}
