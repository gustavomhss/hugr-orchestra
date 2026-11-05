// Protected campaign composition. Product ranking, admission, budgets and publication remain untouched.
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { once } from "node:events"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Worker } from "node:worker_threads"
import { sha256, snapshotFiles, validateIdentity } from "./checkpoint.mjs"
import { checkpointFailure } from "./checkpoint-failure.mjs"

export function checkpointStore(store, checkpoint) {
  let previous
  return {
    ...store,
    commitStaging(decide) {
      const result = store.commitStaging(decide) // The real atomic door, never a replacement writer.
      if (!result.settled) return result
      const head = store.commitStaging((projection) => ({ out: projection }))
      assert(head.settled, "checkpoint: cannot read back settled staging")
      const digest = sha256(JSON.stringify(head.out, (_key, value) =>
        value instanceof Map ? [...value.entries()] : value instanceof Set ? [...value] : value))
      if (digest === previous) return result
      checkpoint("staging") // A failed external acknowledgement prevents this write from returning.
      previous = digest
      return result
    },
  }
}

export async function startCheckpointWriter(identity, directory, snapshot) {
  validateIdentity(identity)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  writeFileSync(join(directory, "identity.json"), JSON.stringify(identity) + "\n", { flag: "wx", mode: 0o600 })
  const sab = new SharedArrayBuffer(4)
  const done = new Int32Array(sab)
  const nonce = randomBytes(32).toString("hex")
  const worker = new Worker(new URL("./checkpoint-worker.mjs", import.meta.url), {
    workerData: { sab, identity, nonce, directory, snapshot },
  })
  try {
    const ready = await Promise.race([once(worker, "message"), new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("checkpoint: initialization deadline")), 180000)
      timer.unref()
    })])
    assert(typeof ready[0].url === "string", "checkpoint: missing external writer readiness")
    worker.on("error", () => {}) // A dead writer cannot acknowledge the bounded synchronous request below.
    return {
      url: ready[0].url, nonce,
      write: (message) => {
        Atomics.store(done, 0, 0)
        worker.postMessage(message)
        const waited = Atomics.wait(done, 0, 0, 300000)
        assert(waited !== "timed-out" && Atomics.load(done, 0) === 1, "checkpoint: external snapshot not acknowledged")
      },
      close: () => worker.terminate(),
    }
  } catch (error) {
    await worker.terminate()
    throw error
  }
}

export function mineEnvironment(identity, env) {
  const result = { ...env, ATLAS_MINE_BUDGET: String(identity.budget) }
  if (identity.arms.length === 1) result.ATLAS_MINE_SLOT = identity.arms[0]
  if (identity.arms.length !== 1) delete result.ATLAS_MINE_SLOT
  return result
}

export async function protectedMine(repo, env = process.env) {
  assert(env.GITHUB_ACTIONS === "true", "checkpoint: use the remote workflow")
  assert(/^[1-9][0-9]*$/.test(env.BUDGET ?? ""), "checkpoint: missing production budget")
  const identity = {
    mode: "production",
    revision: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    indexRun: env.INDEX_RUN || env.GITHUB_RUN_ID, retainedRuns: (env.RETAINED_RUNS ?? "").split(",").filter(Boolean),
    budget: env.BUDGET, arms: (env.ARMS ?? "").split(",").map((arm) => arm.trim()),
    wrapperSha256: sha256(readFileSync(new URL("./grok-text.sh", import.meta.url))),
    profileSha256: sha256(readFileSync(new URL("./grok-agent.json", import.meta.url))),
  }
  validateIdentity(identity)
  assert(identity.arms.slice().sort().join(",") === "advisory,count,dependency" || identity.arms.length === 1,
    "checkpoint: protected composition supports the shared default set or one arm")
  const writer = await startCheckpointWriter(identity, join(env.OUT, "checkpoints"), {
    repo, evidence: env.ATLAS_MINE_EVIDENCE_DIR,
  })
  process.env.ATLAS_CHECKPOINT_URL = writer.url
  process.env.ATLAS_CHECKPOINT_NONCE = writer.nonce
  const checkpoint = (boundary) => writer.write({ kind: "snapshot", boundary, files: snapshotFiles(repo, env.ATLAS_MINE_EVIDENCE_DIR) })
  try {
    const { createDiskStore, createHistorySource, gitSidecarTrust, initAst } = await import("../../modules/atlas/packages/adapter-io/dist/src/index.js")
    const { driveMineArms, driveMinePass, foldArms } = await import("../../modules/atlas/packages/cli/dist/src/mine.js")
    await initAst()
    const rawStore = createDiskStore(join(repo, ".atlas/cas"), () => identity.revision, gitSidecarTrust(repo))
    if (!existsSync(join(repo, ".atlas/staging.json"))) {
      assert(rawStore.commitStaging((projection) => ({ out: null, next: projection })).settled,
        "checkpoint: cannot initialize empty candidate store")
    }
    checkpoint("initial") // Before ranking or model execution, prove that retained state is externally safe.
    const store = checkpointStore(rawStore, checkpoint)
    const deps = { history: createHistorySource(repo, "HEAD"), store,
      env: mineEnvironment(identity, { ...env, ATLAS_CHECKPOINT_URL: writer.url, ATLAS_CHECKPOINT_NONCE: writer.nonce }) }
    const arms = driveMineArms(repo, deps, (root, passDeps) => {
      checkpoint(`arm-start:${passDeps.slot}`)
      const pass = driveMinePass(root, passDeps)
      checkpoint(`arm-end:${passDeps.slot}`)
      return pass
    })
    checkpoint("final")
    return foldArms(arms, Number(env.BUDGET))
  } finally {
    await writer.close()
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
  } catch (error) {
    console.error(`atlas-checkpoint-failure ${JSON.stringify(checkpointFailure(error, "runner"))}`)
    console.error("protected genesis failed; recover external checkpoints before another mining attempt")
    process.exitCode = 2
  }
}
