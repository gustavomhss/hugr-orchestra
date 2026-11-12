// Deployment fault injection at the compiled pool's default worker path, not a Worker mock.
// This covers pool liveness/reassembly, NOT production worker initialization or model execution.
// The caller must trap restore even when its outer timeout kills a blocked run.
import assert from "node:assert/strict"
import { readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const workerEntry = new URL("../../modules/atlas/packages/cli/dist/src/mine-worker.js", import.meta.url)
const poolEntry = new URL("../../modules/atlas/packages/cli/dist/src/mine-pool.js", import.meta.url)
const repoRoot = realpathSync(fileURLToPath(new URL("../../", import.meta.url)))
const fixtures = {
  healthy: `import { workerData } from "node:worker_threads"
const data = workerData
const done = new Int32Array(data.sab)
data.port.on("message", (job) => {
  data.port.postMessage({ slot: job.slot, answer: { ok: true, seed: null } })
  Atomics.add(done, 0, 1)
  Atomics.notify(done, 0)
})
`,
  dead: "process.exit(17)\n",
}

function outsideRepo(path) {
  const local = relative(repoRoot, path)
  assert(isAbsolute(local) || local.startsWith(`..${sep}`), "pool-liveness: path must be outside the repository")
  return path
}

function backupPath(path) {
  // Resolve the parent as well, so a symlink cannot put the backup inside the checkout.
  return outsideRepo(join(realpathSync(dirname(resolve(path))), basename(resolve(path))))
}

function prepare(mode, backup) {
  const original = readFileSync(workerEntry)
  assert(!Object.values(fixtures).some((fixture) => original.equals(Buffer.from(fixture))),
    "pool-liveness: restore the original worker before preparing another fixture")
  // Exclusive creation rejects an existing backup before touching the compiled worker.
  writeFileSync(backupPath(backup), original, { flag: "wx", mode: 0o600 })
  writeFileSync(workerEntry, fixtures[mode])
}

function restore(backup) {
  const original = readFileSync(outsideRepo(realpathSync(backup)))
  writeFileSync(workerEntry, original)
  assert.deepEqual(readFileSync(workerEntry), original, "pool-liveness: compiled worker restoration drift")
  console.log("pool-liveness: original compiled worker restored")
}

async function run(mode, directory) {
  const temp = outsideRepo(realpathSync(directory))
  assert(statSync(temp).isDirectory(), "pool-liveness: temporary path must be a directory")
  // Refuse to create a pool over an unprepared worker: the model command must never execute.
  assert.equal(readFileSync(workerEntry, "utf8"), fixtures[mode], "pool-liveness: controlled worker fixture is not installed")
  const config = join(temp, `pool-liveness-${mode}-model.json`)
  writeFileSync(config, JSON.stringify({
    roles: { propose: { cmd: process.execPath, args: ["-e", 'console.log("NO-FACT")'] } },
    timeoutMs: 1000,
  }) + "\n", { flag: "wx", mode: 0o600 })
  const { createProposerPool, proposerPoolAvailable } = await import(poolEntry.href)
  assert.equal(typeof createProposerPool, "function", "pool-liveness: compiled pool factory is missing")
  assert.equal(typeof proposerPoolAvailable, "function", "pool-liveness: compiled capability check is missing")
  assert.equal(proposerPoolAvailable(), true, "pool-liveness: compiled worker entry is unavailable")
  const pool = createProposerPool(process.cwd(), {
    ATLAS_MODEL_CONFIG: config,
    HOME: temp,
    XDG_CONFIG_HOME: temp,
  }, "advisory", 1)
  const candidates = [0, 1].map((index) => ({
    site: { kind: "file", qualifiedPath: `pool-liveness-${index}.ts`, subtreeHash: "pool-liveness-fixture" },
    rank: index + 1,
    ppr: 1,
    signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  }))
  try {
    const before = performance.now()
    // On the old pool dead mode never returns; only the caller's outer timeout can stop it.
    const answers = pool.proposeAll(candidates)
    const elapsedMs = Math.round(performance.now() - before)
    // Two queued 1s command caps + 30s initialization allowance; 2s is scheduling/measurement slack,
    // not extra model time. A 40s return must not satisfy the 32s liveness policy.
    assert(elapsedMs <= 34_000, "pool-liveness: exceeded 32000ms deadline plus 2000ms scheduling allowance")
    assert(Array.isArray(answers), "pool-liveness: pool results must be an array")
    assert.equal(answers.length, 2, "pool-liveness: result count must match both candidate positions")
    // Array#every/map skip holes: assert each position's density before inspecting its result.
    for (const index of [0, 1]) {
      assert(Object.hasOwn(answers, index), `pool-liveness: missing own result at position ${index}`)
      const answer = answers[index]
      assert(answer !== null && typeof answer === "object", `pool-liveness: invalid result at position ${index}`)
      assert.equal(answer.ok, mode === "healthy", `pool-liveness: wrong result kind at position ${index}`)
      if (mode === "healthy") {
        assert.equal(answer.seed, null, `pool-liveness: healthy seed must be null at position ${index}`)
        continue
      }
      assert(answer.error instanceof Error, `pool-liveness: missing error at position ${index}`)
      assert.equal(answer.error.name, "ModelCommandError", `pool-liveness: wrong fault name at position ${index}`)
    }
    return {
      mode,
      results: answers.length,
      ok: answers.filter((answer) => answer.ok).length,
      faults: answers.filter((answer) => !answer.ok).length,
      elapsedMs,
    }
  } finally {
    assert.doesNotThrow(() => pool.close(), "pool-liveness: pool close must not throw")
    assert.doesNotThrow(() => pool.close(), "pool-liveness: repeated pool close must be idempotent")
  }
}

async function ranges(directory) {
  const temp = outsideRepo(realpathSync(directory))
  assert.equal(readFileSync(workerEntry, "utf8"), fixtures.healthy, "pool-liveness: healthy fixture required")
  const { createProposerPool } = await import(poolEntry.href)
  for (const timeoutMs of [1e308, Number.MAX_SAFE_INTEGER]) {
    const config = join(temp, `pool-range-${timeoutMs}-model.json`)
    writeFileSync(config, JSON.stringify({
      roles: { propose: { cmd: process.execPath, args: ["-e", 'console.log("NO-FACT")'] } }, timeoutMs,
    }), { flag: "wx", mode: 0o600 })
    const env = { ATLAS_MODEL_CONFIG: config, HOME: temp, XDG_CONFIG_HOME: temp }
    if (timeoutMs === 1e308) {
      assert.throws(() => createProposerPool(process.cwd(), env, "advisory", 1),
        (error) => error?.name === "ModelConfigError" && error.message.includes("proposer pool timeout"))
      continue
    }
    const pool = createProposerPool(process.cwd(), env, "advisory", 1)
    let cloned = 0
    try {
      const answers = pool.proposeAll([0, 1].map((rank) => ({
        get site() { cloned++; return { kind: "file", qualifiedPath: "unused.ts", subtreeHash: "unused" } },
        rank, ppr: 1, signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
      })))
      assert.equal(cloned, 0, "pool-liveness: invalid batch bound must refuse before structured-clone dispatch")
      assert.equal(answers.length, 2)
      for (const index of [0, 1]) {
        assert(Object.hasOwn(answers, index))
        assert.equal(answers[index].ok, false)
        assert.equal(answers[index].error.name, "ModelCommandError")
        assert.match(answers[index].error.message, /cannot represent/)
      }
    } finally {
      pool.close()
    }
  }
  console.log("pool-liveness: unrepresentable operator/batch bounds refused before dispatch")
}

const args = process.argv.slice(2)
const [command, mode, path] = args
const usage = "usage: pool-liveness.mjs prepare <healthy|dead> <backup-path> | run <healthy|dead> <temp-directory> | restore <backup-path> | ranges <temp-directory>"
assert(
  (command === "restore" && args.length === 2) ||
  (command === "ranges" && args.length === 2) ||
  ((command === "prepare" || command === "run") && args.length === 3 && (mode === "healthy" || mode === "dead")),
  usage,
)
if (command === "prepare") prepare(mode, path)
if (command === "run") console.log(JSON.stringify(await run(mode, path)))
if (command === "restore") restore(mode)
if (command === "ranges") await ranges(mode)
