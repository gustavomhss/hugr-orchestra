// Replay real file candidates through the COMPILED proposer pool, without ranking, indexing or storing facts.
// Prompts/readers/parsers/model-command handling are production code. Only candidate selection is a fixture.
import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function prepareProbe(staging, out) {
  const doc = readProbeJson(staging)
  assert(Array.isArray(doc.current) && doc.current.length >= 3, "probe: need three durable staged candidates")
  const rows = doc.current.map((row) => {
    assert(Array.isArray(row) && typeof row[1] === "object" && row[1] !== null, "probe: malformed staged row")
    return row[1]
  })
  const revision = rows[0].derivedAt
  assert(typeof revision === "string" && /^[0-9a-f]{40}$/.test(revision), "probe: missing source revision")
  assert(rows.every((row) => row.derivedAt === revision), "probe: mixed source revisions")
  const paths = [...new Set(rows.map((row) => row.primaryAnchor))].slice(0, 3)
  assert(paths.length === 3, "probe: need three distinct source files")
  assert(paths.every((path) => typeof path === "string" && /^packages\/[\w./-]+\.ts$/.test(path) &&
    !path.split("/").includes("..")), "probe: fixture requires contained TypeScript file anchors")
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ revision, paths }, null, 2) + "\n")
  writeFileSync(join(out, "paths.txt"), paths.join("\n") + "\n")
  console.log(`adapter-probe: prepared three file candidates at ${revision}`)
}

async function runProbe(out, slot, control) {
  assert(["advisory", "dependency", "count"].includes(slot), "probe: unknown arm")
  const manifest = readProbeJson(join(out, "manifest.json"))
  assert(Array.isArray(manifest.paths) && manifest.paths.length === 3, "probe: missing prepared candidates")
  const { createProposerPool, proposerPoolAvailable } = await import("../../modules/atlas/packages/cli/dist/src/mine-pool.js")
  assert(proposerPoolAvailable(), "probe: compiled worker entry is missing")
  const barrier = join(out, "barrier")
  if (control) {
    mkdirSync(barrier)
    writeFileSync(join(out, "control-model.json"), JSON.stringify({
      roles: { propose: { cmd: process.execPath, args: [resolve("script/atlas-genesis/pool-control.mjs"), barrier, "3"] } },
      timeoutMs: 20000,
    }))
  }
  const pool = createProposerPool(process.cwd(), {
    ...process.env,
    ...(control ? { ATLAS_MODEL_CONFIG: join(out, "control-model.json") } : {}),
  }, slot, 3)
  const candidates = manifest.paths.map((path, i) => ({
    site: { kind: "file", qualifiedPath: path, subtreeHash: "adapter-probe-fixture" },
    rank: i + 1,
    ppr: 1,
    signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  }))
  const start = performance.now()
  console.log(`adapter-probe: start ${control ? "concurrency-control" : slot}, three compiled workers`)
  try {
    const answers = pool.proposeAll(candidates)
    assert(answers.length === candidates.length, "probe: pool result count mismatch")
    const results = Array.from(answers, (answer) => {
      if (!answer) return { status: "missing" }
      if (!answer.ok) return {
        status: "command-failed",
        kind: answer.error.message.includes("Max turns reached") ? "max-turns" :
          answer.error.message.includes("ETIMEDOUT") ? "timeout" : answer.error.name,
      }
      if (answer.seed === null) return { status: "abstained" }
      if ("abstain" in answer.seed) return { status: "malformed", reason: answer.seed.abstain }
      return { status: "proposed" }
    })
    writeFileSync(join(out, `${control ? "control" : slot}.json`), JSON.stringify({
      slot, control, elapsedMs: performance.now() - start, results,
    }, null, 2) + "\n")
    assert(results.every((result) => result.status === "proposed" || result.status === "abstained"),
      `probe: ${slot} did not settle valid proposals/abstentions (see sanitized result file)`)
    if (control) assert(results.every((result) => result.status === "abstained"), "probe: control must abstain")
    console.log(`adapter-probe: settled ${control ? "concurrency-control" : slot}`)
  } finally {
    pool.close()
  }
}

function readProbeJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"))
  } catch {
    throw new Error("adapter-probe: evidence unavailable or invalid")
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [command, input, out] = process.argv.slice(2)
  if (command === "prepare") prepareProbe(input, out)
  else if (command === "control") await runProbe(input, "advisory", true)
  else if (command === "run") await runProbe(input, out, false)
  else throw new Error("usage: adapter-probe.mjs prepare <staging> <out> | control <out> | run <out> <slot>")
}
