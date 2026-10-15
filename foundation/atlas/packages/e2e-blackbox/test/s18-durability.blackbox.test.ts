// S18 — DURABILITY: the governed store under concurrent writers and under a torn sidecar.
//
// Black-box, real `atlas emit` subprocesses. Both cases were REPRODUCED on the pre-fix build with the exact
// numbers quoted below, and both are now regressions rather than anecdotes.
//
//   LEG 1 — LOST UPDATE. `.atlas/projection.json` was persisted by a bare in-place `writeFileSync`, and both
//     governed doors are read-modify-whole-file-write. Measured: 8 concurrent `atlas emit` processes over a
//     1000-node store lost 1–5 nodes in 6/6 trials; 4 writers over a 50-node store lost in 3/3. Every writer
//     exited 0, printed `status: ok`, and printed a content-address for a fact that was not there. Because
//     the overwrite replaces the whole node map without reading `tier`, a billy-ratified T0 node was
//     losable — every governance gate bypassed AFTER it passed. Post-fix: 0 losses in 18 trials at W=8,
//     K=1000 and 0 in 10 trials at W=4, K=50.
//
//   LEG 2 — ANNIHILATION. A reader that caught that write mid-flight saw a PREFIX; `JSON.parse` threw; the
//     store's (correct, deliberate) totality guard returned "none persisted"; `rehydrateProjection` turned
//     that into `emptyStore()`; the door upserted into empty and overwrote everything. Measured with ONE
//     emit and no concurrency: 90,610 bytes / 402 nodes → 469 bytes / 1 node, exit 0, `status: ok`.
//
// This suite is deliberately SMALL (W=4, one trial): its job is to fail if the protocol regresses, not to
// re-derive the statistics. The full tables live in the seat report and in `adapter-io/test/sidecar.test.ts`.

import { describe, expect, it } from "vitest"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync, truncateSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { CLI_BIN, makeFixtureRepo } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import { ACTOR, scopedPolicy } from "./support.js"
import { IDENTITY_SCHEMA } from "@atlas/adapter-io"
import type { GroundedFact } from "@atlas/knowledge"

interface Run {
  stdout: string
  stderr: string
  exitCode: number
}

/** The CLI as a real child process, so N of them are genuinely concurrent. */
function emit(repoPath: string, factPath: string, at: string): Promise<Run> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI_BIN, "emit", factPath, `--at=${at}`], {
      cwd: repoPath,
      env: { ...process.env, ATLAS_ACTOR: ACTOR, ATLAS_RATIFY_TOKEN: "billy" },
    })
    let out = ""
    let err = ""
    child.stdout.on("data", (d) => {
      out += String(d)
    })
    child.stderr.on("data", (d) => {
      err += String(d)
    })
    child.on("close", (code) => resolve({ stdout: out, stderr: err, exitCode: code ?? 1 }))
  })
}

const atlasDir = (repo: FixtureRepo): string => join(repo.repoPath, ".atlas")

/** Read the durable projection the way the PRODUCT reads it: the highest readable generation, then its
 *  predecessor, then the pre-protocol mirror. Filename-agnostic on purpose — a black-box suite must not
 *  depend on which file the protocol happens to publish, only on what is durable. */
function durable(repo: FixtureRepo): { file: string; nodes: number | "UNPARSEABLE" } {
  const gens = readdirSync(atlasDir(repo))
    .map((n) => /^projection\.(\d+)\.json$/.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => b - a)
  const files = [
    ...gens.map((g) => join(atlasDir(repo), `projection.${g}.json`)),
    join(atlasDir(repo), "projection.json"),
  ]
  for (const file of files) {
    if (!existsSync(file)) continue
    try {
      const w = JSON.parse(readFileSync(file, "utf8")) as { current: unknown[] }
      if (Array.isArray(w.current)) return { file, nodes: w.current.length }
    } catch {
      return { file, nodes: "UNPARSEABLE" }
    }
  }
  return { file: "(none)", nodes: 0 }
}

/** Seed K synthetic current-nodes so the projection has real mass (a wider read-modify-write window). */
function seed(repo: FixtureRepo, k: number): void {
  const hex = "a".repeat(64)
  const current = Array.from({ length: k }, (_, i) => [
    `synthetic:${i}`,
    {
      nodeKey: `synthetic:${i}`,
      family: "advisory",
      contentHash: hex,
      claims: [`seeded claim ${i} with body text for mass`],
    },
  ])
  // THE `identity` STAMP IS NOT OPTIONAL DRESSING — without it this hand-written store is `unstamped`, and
  // the #112 guard REFUSES every write over a store whose identity schema is unknown. That refusal is the
  // product behaving as designed: an unstamped store may have been minted by any older Atlas, and reading
  // its anchors as though they were current is exactly the silent mis-read the guard exists to stop. What
  // was wrong was this fixture, which wrote a projection by hand and then expected the doors to treat it as
  // one they had written. A real store carries the stamp because `publish` puts it there; so does this one.
  // (Same shape as the harness `.gitignore`: a fixture that does not look like a real repo tests a product
  // nobody runs. Verified end-to-end first — `s1-genesis` init→emit→query is green, so the guard is not
  // refusing any path a user actually takes.)
  const sidecar = { current, cas: [hex], identity: IDENTITY_SCHEMA }
  writeFileSync(join(atlasDir(repo), "projection.json"), JSON.stringify(sidecar), "utf8")
}

function factFile(repo: FixtureRepo, fact: GroundedFact, tag: string): string {
  const p = join(repo.repoPath, `fact-${tag}.json`)
  writeFileSync(p, JSON.stringify(fact))
  return p
}

describe("S18 — durability of the governed store", () => {
  it("LEG 1: 4 concurrent `atlas emit`s over a seeded store ⇒ every accepted write is durable", async () => {
    const W = 4
    const K = 50
    const files: Record<string, string> = {}
    for (let i = 0; i < W; i++) files[`src/f${i}.ts`] = `export const f${i} = ${i};\n`
    const repo = makeFixtureRepo({ files, policy: scopedPolicy("src") })
    seed(repo, K)
    const at = repo.sha()
    // T0 on purpose: the pre-fix overwrite never read `tier`, so the strictest, human-ratified class was as
    // losable as any other. If a T0 fact can be lost, the ratification gate protected nothing durable.
    const paths = Array.from({ length: W }, (_, i) =>
      factFile(repo, draftFact(repo, `src/f${i}.ts`, "invariant", `C${i}`, "T0").fact, `w${i}`),
    )
    const runs = await Promise.all(paths.map((p) => emit(repo.repoPath, p, at)))
    const accepted = runs.filter((r) => r.exitCode === 0).length
    // WHATEVER THE CLI REPORTED AS ACCEPTED MUST BE DURABLE — that equality is the whole property, and it is
    // the one the pre-fix build broke while printing `status: ok` and a content-address for every writer.
    expect(durable(repo).nodes).toBe(K + accepted)
    // A refusal is a LEGITIMATE outcome of a governed write under contention; what may never happen is a
    // SILENT one. So the rejected writers are held to being visibly rejected, rather than the count being
    // held to W — an assertion on the count is a LIVENESS claim, and a loaded machine can falsify a liveness
    // claim without anything being wrong. (At this width the measured exhaustion rate is 0%, which is why
    // the floor below is a floor and not the equality it looks like it wants to be.)
    for (const r of runs.filter((x) => x.exitCode !== 0)) {
      expect(r.stdout).toContain("status: rejected")
      expect(r.stdout).toMatch(/^reason: contended:/m)
    }
    expect(accepted).toBeGreaterThanOrEqual(1)
    repo.cleanup()
  }, 300_000)

  it("LEG 2: an emit onto a TORN projection REFUSES visibly and leaves the store exactly as it found it", async () => {
    const repo = makeFixtureRepo({ files: { "src/f0.ts": "export const f0 = 0;\n" }, policy: scopedPolicy("src") })
    seed(repo, 402)
    const target = join(atlasDir(repo), "projection.json")
    const before = { bytes: statSync(target).size, nodes: durable(repo).nodes }
    expect(before.nodes).toBe(402)
    // EXACTLY what a reader observed mid-`writeFileSync`: a prefix of the bytes, on the live inode.
    truncateSync(target, Math.floor(before.bytes * 0.6))
    const torn = readFileSync(target, "utf8")

    const p = factFile(repo, draftFact(repo, "src/f0.ts", "invariant", "one innocent claim").fact, "x")
    const r = await emit(repo.repoPath, p, repo.sha())

    // PRE-FIX: exit 0, `status: ok`, and the store silently became 1 node. The door must instead refuse,
    // say why, and touch nothing — a corrupt store is a human's problem, not a licence to start over.
    expect(r.exitCode).not.toBe(0)
    expect(r.stdout).toContain("status: rejected")
    // The DISCRIMINANT, anchored — the black-box twin of `reasonOf` equality. A bare /unreadable store/
    // would also be satisfied by any other reason whose prose happens to MENTION it, and these constants
    // quote each other by name on purpose (see `door-regression-support.ts`). Anchoring to the start of the
    // rendered `reason:` line and requiring the trailing `:` pins the reason NAME, not a mention of it.
    expect(r.stdout).toMatch(/^reason: unreadable store:/m)
    expect(readFileSync(target, "utf8")).toBe(torn) // byte-identical: nothing was rewritten
    expect(readdirSync(atlasDir(repo)).filter((n) => /^projection\.\d+\.json$/.test(n))).toEqual([])
    repo.cleanup()
  }, 300_000)
})
