// @atlas/e2e-blackbox — test/s4-drift.blackbox.test.ts  (S4 — Drift & reconcile lifecycle)
//
// NARRATIVE: a user emits a grounded fact, then commits a code change that MOVES the grounding; `atlas
// reconcile <mergeBase>` detects the drift and classifies it; `atlas doctor why|hotset` explains it read-only.
// All through the real CLI subprocesses, against a real git history (the fixture `commit()` advances HEAD).
//
// SOTA invariants pinned: DRIFT IS A DETERMINISTIC FUNCTION OF THE GIT STATE (RETR-1 — re-running reconcile
// against the same revs yields byte-identical output; a mergeBase with NO drift verdicts 0 vs one WITH drift
// verdicts a block), and DOCTOR IS ADVISORY-ONLY (TOOLS-12 — the diagnostic port mutates NOTHING: the
// `.atlas/cas` bytes are byte-identical before and after every doctor call).

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

/** A stable, order-independent snapshot of every byte under `.atlas/cas` (proves doctor mutates nothing). */
function casSnapshot(repoPath: string): string {
  const dir = join(repoPath, ".atlas", "cas")
  let names: string[]
  try {
    names = (readdirSync(dir, { recursive: true }) as string[]).filter((n) => typeof n === "string")
  } catch {
    return "NONE"
  }
  return names
    .map((n) => {
      try {
        return `${n}=${readFileSync(join(dir, n), "utf8")}`
      } catch {
        return `${n}=<dir>`
      }
    })
    .sort()
    .join("\n")
}

let repo: FixtureRepo
let fact: GroundedFact
let genesis: string // the sha the fact was grounded at (the merge-base WITH drift)
let head: string //    the sha after the grounding-moving commit (a merge-base with NO drift vs itself)
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — T1 fact routes to full-ratify
  repo = makeFixtureRepo({ files: { "src/foo.ts": "export const foo = 1;\n" }, policy: scopedPolicy("src") })
  fact = draftFact(repo, "src/foo.ts", "invariant", "foo is 1").fact
  genesis = repo.sha()
  const emit = emitFact(repo, fact)
  if (emit.exitCode !== 0) throw new Error(`S4 setup: grounded emit failed:\n${emit.stdout}`)
  // A code change that MOVES the grounding: the file body changes ⇒ its subtreeHash changes ⇒ the anchor drifts.
  head = repo.commit({ "src/foo.ts": "export const foo = 99;\n// semantic change\n" })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S4 — reconcile detects + classifies drift; doctor is read-only", () => {
  it("`atlas reconcile <genesis>` DETECTS the drift and blocks on the semantic flip (exit 2)", () => {
    const r = runAtlas(repo.repoPath, ["reconcile", genesis])
    // A moved-and-edited grounding no longer re-derives ⇒ SEMANTIC drift ⇒ block the merge (exit 2).
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
    expect(r.stdout).toContain("semantic flip") // the guidance names the blocking class (TOOLS-8)
  })

  it("SOTA determinism: reconciling the SAME revs re-runs BYTE-IDENTICAL (drift = f(git state))", () => {
    const a = runAtlas(repo.repoPath, ["reconcile", genesis])
    const b = runAtlas(repo.repoPath, ["reconcile", genesis])
    expect(b.stdout).toBe(a.stdout)
    expect(b.exitCode).toBe(a.exitCode)
  })

  it("SOTA determinism: a mergeBase with NO drift (HEAD vs HEAD) verdicts 0 — a DIFFERENT git state", () => {
    const r = runAtlas(repo.repoPath, ["reconcile", head])
    // no anchor moved between HEAD and HEAD ⇒ no drift ⇒ exit 0 (the verdict tracks the git state, not a clock).
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("status: ok")
  })

  it("`atlas doctor why <fact>` explains the drift CLASSIFICATION read-only (exit 0)", () => {
    const r = runAtlas(repo.repoPath, ["doctor", "why", String(fact.id)])
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toContain("doctor: why")
    // the drift is classified (mechanical vs semantic) and surfaced for the specific fact.
    expect(r.stdout).toContain(`fact=${fact.id}`)
    expect(r.stdout).toContain("class=semantic")
  })

  it("SOTA doctor is advisory-only: `.atlas/cas` is BYTE-UNCHANGED across doctor why + hotset", () => {
    const before = casSnapshot(repo.repoPath)
    expect(before).not.toBe("NONE") // the emitted fact really is on disk (non-vacuous baseline)
    const why = runAtlas(repo.repoPath, ["doctor", "why", String(fact.id)])
    const hot = runAtlas(repo.repoPath, ["doctor", "hotset", "5"])
    expect(why.exitCode).toBe(0)
    expect(hot.exitCode).toBe(0)
    expect(hot.stdout).toContain("hotSet: size=") // the advisory report actually ran
    expect(casSnapshot(repo.repoPath)).toBe(before) // persisted NOTHING (read-only)
  })
})
