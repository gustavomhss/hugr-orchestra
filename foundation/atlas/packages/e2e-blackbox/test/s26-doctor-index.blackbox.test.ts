// @atlas/e2e-blackbox — test/s26-doctor-index.blackbox.test.ts  (S26 — `atlas doctor index`: the SCIP plan)
//
// NARRATIVE: a user runs `atlas mine` on their repository and gets `0 sites visited`. The message tells them
// wiring a model would not help — true, and useless on its own. They run `atlas doctor index`, and the
// product finally says the thing it knew all along: `axes.edges` is derived from SCIP occurrences and from
// nothing else, this repository has no `.atlas/index.scip`, here is the exact pinned command that produces
// one, and here are the languages for which Atlas has no indexer at all. Every step runs the REAL `atlas`
// bin as a subprocess against a real git repo. No in-process shortcut.
//
// SOTA invariants pinned:
//   - ATLAS PLANS, THE OPERATOR RUNS (the frozen posture). The leg is observably PROCESS-FREE: run against a
//     repository with no dump, it reports the dump ABSENT and leaves `.atlas` byte-identical — no indexer is
//     spawned, no `.scip` appears. Printing the command keeps what executes on the machine the operator's
//     decision, and keeps the SCIP dependency visible instead of hidden behind an invocation that fails
//     opaquely when the binary is absent.
//   - THE PLAN WRITES WHERE THE READER READS. The `--output` path parsed OUT of the printed command line is
//     resolved against the repo and compared, byte-for-byte, with the dump the product actually reads. A
//     plan that names a real binary and the wrong path is worse than no plan: the indexer would succeed and
//     the frontier would stay empty.
//   - THE HOLE IS NAMED (INDEX-13). A language with no configured indexer is reported BY NAME as a hole. A
//     user must be able to tell "Atlas has no indexer for this language" from "Atlas found nothing here".
//   - READ-ONLY (TOOLS-12), like every other doctor leg: exit 0, no write door, nothing persisted.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"

/** Where every reader in the product opens the dump (`adapter-io` `SCIP_INDEX_REL`) — pinned as a LITERAL
 *  so this black-box story never imports in-process product source. */
const SCIP_REL = ".atlas/index.scip"

/** A stable snapshot of `.atlas`: name, size and mtime per entry. Any spawned indexer would move it. */
function atlasDirStamp(repoPath: string): string {
  const dir = join(repoPath, ".atlas")
  return readdirSync(dir)
    .sort()
    .map((n) => {
      const st = statSync(join(dir, n))
      return `${n}:${st.size}:${st.mtimeMs}`
    })
    .join("\n")
}

/** The `run:` line's `--output` argument — i.e. the path an operator pasting the command would write to. */
function plannedOutput(stdout: string, tool: string): string {
  const line = stdout.split("\n").find((l) => l.trim().startsWith(`run:`) && l.includes(tool)) ?? ""
  const parts = line.trim().split(/\s+/)
  return parts[parts.indexOf("--output") + 1] ?? ""
}

let repo: FixtureRepo

beforeAll(() => {
  repo = makeFixtureRepo({
    files: {
      "src/app.ts": "import { greet } from './util.js';\nexport const hi = greet('a');\n",
      "src/util.ts": "export const greet = (n: string): string => `hi ${n}`;\n",
      "svc/compute.py": "def compute():\n    return 1\n",
      "lib/legacy.rb": "def legacy\n  1\nend\n", //  no configured indexer ⇒ the honest hole
      "README.md": "# fixture\n", //                 no language at all ⇒ neither planned nor a hole
    },
    // A dump with one real occurrence pair, so the PRESENT branch reports a real document count.
    index: [
      { path: "src/util.ts", defines: ["util/greet()."] },
      { path: "src/app.ts", references: ["util/greet()."] },
    ],
  })
})

afterAll(() => repo?.cleanup())

describe("S26 — atlas doctor index: Atlas plans the SCIP index, the operator runs it", () => {
  it("1. reports the dump, the PINNED per-language command, and NAMES the honest hole (exit 0)", () => {
    const r = runAtlas(repo.repoPath, ["doctor", "index"])
    expect(r.exitCode).toBe(0)
    expect(r.stderr).toBe("") // no thrown stack leaked — the diagnosis is total
    expect(r.stdout).toContain("status: ok")
    expect(r.stdout).toContain("doctor: index")
    expect(r.stdout).toContain("invariant: TOOLS-12") // the read/advisory guidance always ships

    // The dump this fixture ships is real, and the leg says so with its document count.
    expect(r.stdout).toContain(`scip: present at ${SCIP_REL} — 2 indexed document(s)`)

    // Both configured languages are planned, each with a PINNED binary (REQ-INDEX-3a: "a separate installed,
    // version-pinned binary per language") and a runnable command. The pin is asserted as a shape, not a
    // literal, so bumping the pin does not lie here — but a plan with NO version fails.
    expect(r.stdout).toMatch(/lang: ts — 2 tracked file\(s\) — indexer scip-typescript, pinned \d+\.\d+\.\d+/)
    expect(r.stdout).toMatch(/lang: py — 1 tracked file\(s\) — indexer scip-python, pinned \d+\.\d+\.\d+/)
    expect(r.stdout).toContain(`run:    scip-typescript index --output ${SCIP_REL}`)
    expect(r.stdout).toContain(`run:    scip-python index --output ${SCIP_REL}`)
    // …and how to check WHAT IS INSTALLED, which is the other half of a pin.
    expect(r.stdout).toContain("verify: scip-typescript --version")

    // TEETH: the hole is named. Dropping the honest-hole line makes "no indexer for rb" indistinguishable
    // from "no rb here" — the exact confusion the sentinel exists to prevent.
    expect(r.stdout).toMatch(/lang: rb — 1 tracked file\(s\) — honest-hole: NO indexer is configured/)
    // A markdown file is neither planned nor a hole: not-a-language is not a diagnosis.
    expect(r.stdout).not.toMatch(/lang: md\b/)
  })

  it("2. TEETH — the printed --output is the path the product actually READS (resolved on disk)", () => {
    const r = runAtlas(repo.repoPath, ["doctor", "index"])
    const planned = plannedOutput(r.stdout, "scip-typescript")
    expect(planned).not.toBe("")
    // Byte-identical to the dump the fixture wrote at the path every reader opens. If the plan named
    // `index.scip` at the root, or `.scip/index`, or anything else, these bytes differ or the read throws.
    expect(readFileSync(join(repo.repoPath, planned))).toEqual(readFileSync(join(repo.repoPath, SCIP_REL)))
  })

  it("3. ATLAS RUNS NOTHING: with no dump it says ABSENT, and produces none (`.atlas` unchanged)", () => {
    const bare = makeFixtureRepo({ files: { "src/a.ts": "export const a = 1;\n" } })
    try {
      rmSync(join(bare.repoPath, SCIP_REL)) // the state of every repository that has never been indexed
      const before = atlasDirStamp(bare.repoPath)

      const r = runAtlas(bare.repoPath, ["doctor", "index"])
      expect(r.exitCode).toBe(0)
      expect(r.stdout).toContain(`scip: ABSENT at ${SCIP_REL}`)
      // The sentence that connects the absent dump to the 0 the user actually saw.
      expect(r.stdout).toContain("`atlas mine` visits 0 sites")
      expect(r.stdout).toContain("Atlas does NOT run indexers")

      // The observable proof of the posture: had the leg SHELLED OUT to scip-typescript, a dump would now
      // exist and this stamp would differ. It does not, on a machine where that binary is installed.
      expect(atlasDirStamp(bare.repoPath)).toBe(before)
      expect(() => statSync(join(bare.repoPath, SCIP_REL))).toThrow()
    } finally {
      bare.cleanup()
    }
  })

  it("4. `mine` on an unindexed repo now POINTS at the leg that explains it (the loop closes)", () => {
    const bare = makeFixtureRepo({ files: { "src/a.ts": "export const a = 1;\n" } })
    try {
      // ATLAS_MINE_SLOT pinned to the advisory arm: this story tests the unindexed-repo diagnostic leg, not
      // the multi-arm default (which is proven in s-sound-default + the mine-arms unit suite).
      const mine = runAtlas(bare.repoPath, ["mine", "."], { ATLAS_MINE_SLOT: "advisory" })
      expect(mine.stdout).toContain("0 sites visited")
      // It still refuses to blame the unreached model, AND it now names where the answer is.
      expect(mine.stdout).toContain("wiring a model would not change this 0")
      expect(mine.stdout).toContain("atlas doctor index")
    } finally {
      bare.cleanup()
    }
  })

  it("5. the enumerated doctor surface names `index` when a subcommand is unknown", () => {
    const bogus = runAtlas(repo.repoPath, ["doctor", "not-a-leg"])
    expect(bogus.exitCode).toBe(1)
    expect(bogus.stdout).toContain("archive|why|hotset|reground|cas|index")
  })
})
