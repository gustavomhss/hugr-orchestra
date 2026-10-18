// @atlas/cli — test/mine-provenance-seam.test.ts  (`mine` builds its OWN store; it must build it the same way)
//
// Every governed door rides a store the composition root built WITH the provenance seam
// (`compose.ts` → `gitSidecarTrust(repoPath)`), so a durable store that arrived by COMMIT is refused rather
// than read or written. `mine` does not use that store: it composes its own inside `withDefaults`, and it
// composed it with the N11 freshness watermark and WITHOUT the tripwire.
//
// Nothing was being SERVED through that hole — staging is a candidate sidecar, and ADR-0008 keeps it out of
// every read path. What was wrong is subtler and worth a suite of its own: `mine.ts` already SHIPPED the
// operator text for a `untrusted` staging refusal (`STAGING_REFUSAL_TEXT.untrusted`, complete with the
// `git rm --cached` remediation) while the seam that could produce that refusal was never wired — so the
// branch was dead code that read, to any reviewer, as coverage. The next person to read staging into a door
// would have inherited the hole rather than found it.
//
// The assertion is on `MinePass.refusal`, the `CommitRefusal` DISCRIMINANT, never on the prose.

import { describe, it, expect, afterEach } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { driveMinePass } from "../src/mine.js"
import { skeletonSource, injectedHistory, recordingProposer, gateEmitAll } from "./mine-fixtures.js"

interface Repo {
  readonly repoPath: string
  cleanup(): void
}

/** A real git repo. `commitAtlas` decides the ONE variable: whether the durable store is TRACKED. */
function repoWithStore(opts: { commitAtlas: boolean }): Repo {
  const repoPath = mkdtempSync(join(tmpdir(), "atlas-mine-prov-"))
  const git = (...args: string[]): void => void execFileSync("git", ["-C", repoPath, ...args], { stdio: "ignore" })
  git("init", "-q")
  // Obviously-synthetic identity on the RFC 2606 reserved TLD; not a credential of any kind.
  git("config", "user.email", "fixture@example.invalid")
  git("config", "user.name", "synthetic-fixture")
  git("config", "commit.gpgsign", "false")
  mkdirSync(join(repoPath, "src"), { recursive: true })
  writeFileSync(join(repoPath, "src", "a.ts"), "export const a = 1;\n")
  mkdirSync(join(repoPath, ".atlas"), { recursive: true })
  writeFileSync(join(repoPath, ".atlas", "projection.json"), '{"current":[],"cas":[]}')
  git("add", "src")
  if (opts.commitAtlas) git("add", "-f", ".atlas")
  git("commit", "-q", "-m", "fixture")
  return { repoPath, cleanup: () => rmSync(repoPath, { recursive: true, force: true }) }
}

/** A pass with real sites and an admitting gate, so it REACHES the staging commit — the store is the ONLY
 *  seam left to the default, which is exactly the thing under test. */
function pass(repoPath: string): ReturnType<typeof driveMinePass> {
  return driveMinePass(repoPath, {
    skeleton: skeletonSource,
    history: injectedHistory,
    proposer: recordingProposer().proposer,
    gate: gateEmitAll(),
  })
}

let live: Repo | undefined
afterEach(() => {
  live?.cleanup()
  live = undefined
})

describe("the mine driver composes its default store WITH the provenance seam", () => {
  it("RED: a pass over a COMMITTED durable store refuses `untrusted` instead of staging into it", () => {
    live = repoWithStore({ commitAtlas: true })
    const out = pass(live.repoPath)
    expect(out.refusal).toBe("untrusted") // the DISCRIMINANT — not `unreadable`, not `contended`
  })

  it("CONTROL: the identical repo with the store NOT committed stages normally", () => {
    live = repoWithStore({ commitAtlas: false })
    const out = pass(live.repoPath)
    expect(out.refusal).toBeUndefined()
    expect(out.report.seeded.length).toBeGreaterThan(0)
  })
})
