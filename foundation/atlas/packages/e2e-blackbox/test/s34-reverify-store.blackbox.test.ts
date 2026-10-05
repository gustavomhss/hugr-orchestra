// @atlas/e2e-blackbox — test/s34-reverify-store.blackbox.test.ts  (REVERIFY-GATE over the REAL built binary)
//
// NARRATIVE. `atlas mine` (dependency arm, ZERO metered spend — the SAME `echo` stand-in S33 uses) stages
// ONE proven dependency candidate, `atlas promote` writes it to the DURABLE CAS, and `atlas verify-store`
// re-proves it against the live index — `re-proven`, exit 0. Then the tree that gave the witness its caller
// is rewritten so the caller is GONE, and the SAME durable fact — untouched, still `seal:'proven'`, still
// carrying the SAME witness — re-verifies to `broken`, exit 2: the store no longer re-proves what it claims,
// and this door is what catches that. `unverifiable` is demonstrated at the store-crafting layer
// (`reverify-gate-compose.test.ts`, `@atlas/adapter-io`) rather than here, because that arm is UNREACHABLE
// from the shipped `mine`/`promote` path by construction (#195 cold review) — nothing this story could mine
// would ever produce it.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

const CURATOR = "seat:orchestrator"
const CURATOR_ENV = { ATLAS_ACTOR: CURATOR, ATLAS_RATIFY_TOKEN: CURATOR }

/** Same corpus shape S33 uses: `greet` DEFINED in util.ts, REFERENCED (called) in app.ts ⇒ one resolved
 *  cross-unit dep edge — the `createUnitDeps` candidate set for `src/app.ts` is exactly `['greet']`. */
const FILES = {
  "src/util.ts": "export function greet(n: string): string {\n  return `hi ${n}`;\n}\n",
  "src/app.ts": "import { greet } from './util';\n\nexport function main(): string {\n  return greet('world');\n}\n",
}
const INDEX_WITH_CALLER = [
  { path: "src/util.ts", defines: ["util/greet()."] },
  { path: "src/app.ts", references: ["util/greet()."] },
]
/** The SAME symbol, still DEFINED — but no document references it any more. A witness naming this target
 *  under `src` can no longer be re-proven: `verifyDependency` finds the definition but no caller in scope. */
const INDEX_CALLER_REMOVED = [{ path: "src/util.ts", defines: ["util/greet()."] }]

const CURATOR_POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { "atlas:mined": [CURATOR] } },
})

const DEPENDS_ON_CLAIM = "DEPENDS-ON: greet"

let repo: FixtureRepo
let modelConfigPath: string
let modelConfigDir: string

beforeAll(() => {
  repo = makeFixtureRepo({ files: FILES, index: INDEX_WITH_CALLER, policy: CURATOR_POLICY })
  modelConfigDir = mkdtempSync(join(tmpdir(), "atlas-s34-operator-"))
  modelConfigPath = join(modelConfigDir, "model.json")
  writeFileSync(modelConfigPath, JSON.stringify({ roles: { propose: { cmd: "echo", args: [DEPENDS_ON_CLAIM] } } }))
})
afterAll(() => {
  repo?.cleanup()
  if (modelConfigDir) rmSync(modelConfigDir, { recursive: true, force: true })
})

describe("S34 — `atlas verify-store` re-proves a promoted witness, then catches it going BROKEN", () => {
  it("mine (dependency arm) stages ONE proven dependency candidate — ZERO metered model spend", () => {
    const mine = runAtlas(repo.repoPath, ["mine", "."], {
      ATLAS_MODEL_CONFIG: modelConfigPath,
      ATLAS_MINE_SLOT: "dependency",
    })
    expect(mine.exitCode).toBe(0)
    expect(mine.stdout).toContain("genesis: seeded 1 candidate fact(s)")
  })

  it("promote writes it to the DURABLE CAS", () => {
    const promote = runAtlas(repo.repoPath, ["promote"], CURATOR_ENV)
    expect(promote.exitCode).toBe(0)
    expect(promote.stdout).toContain("promote: 1 of 1 staged candidate(s) promoted; 0 refused")
  })

  it("RE-PROVEN — `atlas verify-store` replays the SAME index and re-proves it, exit 0", () => {
    const verify = runAtlas(repo.repoPath, ["verify-store"])
    expect(verify.exitCode).toBe(0)
    expect(verify.stdout).toContain("status: ok")
    expect(verify.stdout).toContain("verify-store: 1 sealed-proven fact(s) — 1 re-proven, 0 broken, 0 unverifiable")
    expect(verify.stdout).toMatch(/ {2}re-proven /)
  })

  it("BROKEN — the SAME durable fact stops re-proving once the caller is gone from the index, exit 2", () => {
    // Rewrite `.atlas/index.scip` in place — no re-mine, no re-promote, no CAS edit. The stored witness
    // (target=`util/greet().`, scope=`src`) is UNCHANGED; only what it is re-checked AGAINST moved.
    rewriteIndex(repo.repoPath, INDEX_CALLER_REMOVED)
    const verify = runAtlas(repo.repoPath, ["verify-store"])
    expect(verify.exitCode).toBe(2)
    expect(verify.stdout).toContain("status: rejected")
    expect(verify.stdout).toContain("verify-store: 1 sealed-proven fact(s) — 0 re-proven, 1 broken, 0 unverifiable")
    expect(verify.stdout).toMatch(/ {2}broken /)
    expect(verify.stdout).toContain("no longer re-prove against the live index")
  })
})

// ── S34b — `atlas verify-store` against a TRACKED store (#199 fix-round finding 3) ─────────────────────────
// The prior S34 stories above never construct a TRACKED store — `provenance()` stays `'trusted'` throughout,
// so `reverify`'s old wiring (`reverifyStore(driftFacts, …)` off the WRITE-gated store) happened to see the
// same population the read leg did, by accident of never exercising the OTHER branch. Cold review measured
// the divergence live: on a `tracked-provable` store, `atlas query`'s trailing advisory said "1 of 1 re-
// proven", while `atlas verify-store` — driven by the SAME composed runtime, SAME durable store — said
// "0 sealed-proven fact(s) … nothing to re-verify". This story is the missing end-to-end coverage: mine +
// promote as usual (untracked), COMMIT the durable store (making it `tracked-provable`), then assert
// `atlas query` and `atlas verify-store` name the SAME count — never a live contradiction between the two
// surfaces reading the one store.
const git = (repoPath: string, ...args: string[]): void => {
  execFileSync("git", ["-C", repoPath, ...args], { stdio: "pipe" })
}

describe("S34b — `atlas verify-store` sees the SAME population `atlas query`s advisory names, on a TRACKED store", () => {
  it("mine + promote (untracked), then commit `.atlas/` — verify-store reports 1 re-proven, matching the read leg", () => {
    const trackedRepo = makeFixtureRepo({ files: FILES, index: INDEX_WITH_CALLER, policy: CURATOR_POLICY })
    try {
      const mine = runAtlas(trackedRepo.repoPath, ["mine", "."], {
        ATLAS_MODEL_CONFIG: modelConfigPath,
        ATLAS_MINE_SLOT: "dependency",
      })
      expect(mine.exitCode).toBe(0)
      const promote = runAtlas(trackedRepo.repoPath, ["promote"], CURATOR_ENV)
      expect(promote.exitCode).toBe(0)

      // Make the durable store TRACKED — `provenance()` flips to `tracked-provable` (staging is NOT
      // committed, so this is case 2, not the flat case-3 refusal).
      git(
        trackedRepo.repoPath,
        "add",
        "-f",
        ".atlas/projection.json",
        ".atlas/cas",
        ".atlas/policy.json",
        ".atlas/index.scip",
      )
      git(trackedRepo.repoPath, "commit", "-q", "-m", "ship the durable store (accidental, but re-provable)")

      // The READ leg's own advisory (riding `atlas query`'s trailing note) names "1 of 1 … re-proven".
      const query = runAtlas(trackedRepo.repoPath, ["query", "src", "--by", "scope"])
      expect(query.exitCode).toBe(0)
      expect(query.stdout).toContain("1 of 1")
      expect(query.stdout).toContain("re-proven and are served")

      // `atlas verify-store` — the SAME composed runtime, SAME store — must name the SAME count, not the
      // all-zero "nothing to re-verify" the write-gated-store regression reported.
      const verify = runAtlas(trackedRepo.repoPath, ["verify-store"])
      expect(verify.exitCode).toBe(0)
      expect(verify.stdout).toContain("verify-store: 1 sealed-proven fact(s) — 1 re-proven, 0 broken, 0 unverifiable")
      expect(verify.stdout).not.toContain("0 sealed-proven fact(s)")
    } finally {
      trackedRepo.cleanup()
    }
  })
})

// ── local helper: rewrite `.atlas/index.scip` to a NEW document set, same encoding the harness uses ───────
function rewriteIndex(
  repoPath: string,
  index: readonly { path: string; defines?: readonly string[]; references?: readonly string[] }[],
): void {
  const scip = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: `file://${repoPath}`,
      toolInfo: create(ToolInfoSchema, { name: "atlas-e2e-blackbox", version: "0" }),
    }),
    documents: index.map((doc) =>
      create(DocumentSchema, {
        relativePath: doc.path,
        occurrences: [
          ...(doc.defines ?? []).map((symbol) =>
            create(OccurrenceSchema, { symbol, symbolRoles: SymbolRole.Definition }),
          ),
          ...(doc.references ?? []).map((symbol) => create(OccurrenceSchema, { symbol, symbolRoles: 0 })),
        ],
      }),
    ),
  })
  writeFileSync(join(repoPath, ".atlas", "index.scip"), serializeSCIP(scip))
}
