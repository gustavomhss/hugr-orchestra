// @atlas/e2e-blackbox — test/s27-reconcile-merge-base.blackbox.test.ts  (S27 — reconcile VALIDATES its base)
//
// NARRATIVE: `atlas reconcile <mergeBase>` is a MERGE GATE — exit 2 blocks, exit 0 clears. It never checked
// that the rev it was handed resolves. An unresolvable base made `resolveAnchorAt(base, …)` answer `undefined`
// for EVERY fact, every fact took the per-fact "no baseline anchor" skip, the drift set came back EMPTY, and
// the gate printed `status: ok` and exited 0 — in a repo with real, blocking, semantic drift against its
// actual base. A typo in a sha, a branch name that has been deleted, a shell variable that expanded to the
// empty string: each of them turns the gate GREEN. That is the false-PASS class in its most expensive form,
// because the answer it gives is the one a CI job merges on.
//
// TEETH, and this story is deliberately BI-DIRECTIONAL: a one-sided test would be worthless here, since the
// whole defect is that the failing case was byte-indistinguishable from the passing one. So the SAME repo,
// in the SAME state, is reconciled against
//   (a) its REAL base            ⇒ exit 2, the semantic flip still blocks (the fix did not blunt the gate);
//   (b) a well-formed-but-absent sha, a non-sha token, and the empty string ⇒ a STATED refusal, exit 1;
//   (c) a REAL base at which a fact's anchor genuinely did not exist ⇒ exit 0, the per-fact skip SURVIVES.
// (c) is what keeps the two conditions apart from the outside: "this one fact has no baseline anchor" is a
// legitimately different answer from "the base you named does not exist", and after the fix they are still
// distinguishable — by exit code AND by the named `unresolvable-merge-base:` discriminant on the reason line.
//
// Driven ONLY through the real doors — the `atlas` CLI subprocess.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"

/** The `reason: <discriminant>: …` line of a rejected/errored verdict (the attributed refusal channel). */
function reasonOf(stdout: string): string {
  return (
    stdout
      .split("\n")
      .find((l) => l.startsWith("reason:"))
      ?.trim() ?? "<no reason line>"
  )
}

let repo: FixtureRepo
let genesis: string // the REAL merge base — the sha the drifted fact was grounded at
let later: string //   a REAL later base, at which `src/late.ts` did not yet exist
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER

  repo = makeFixtureRepo({ files: { "src/foo.ts": "export const foo = 1;\n" }, policy: scopedPolicy("src") })
  genesis = repo.sha()
  const fact = draftFact(repo, "src/foo.ts", "invariant", "foo is 1").fact
  const emit = emitFact(repo, fact)
  if (emit.exitCode !== 0) throw new Error(`S27 setup: grounded emit failed:\n${emit.stdout}`)
  // A code change that MOVES the grounding ⇒ real, semantic, BLOCKING drift against `genesis`.
  later = repo.commit({ "src/foo.ts": "export const foo = 99;\n// semantic change\n" })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S27 — `atlas reconcile` refuses an unresolvable merge base instead of reporting a clean gate", () => {
  it("DIRECTION 1 (the gate still bites): the REAL base with real drift BLOCKS the merge (exit 2)", () => {
    const r = runAtlas(repo.repoPath, ["reconcile", genesis])
    expect(r.exitCode).toBe(2)
    expect(r.stdout).toContain("status: rejected")
    expect(r.stdout).toContain("semantic flip")
  })

  it.each([
    ["a well-formed sha that names no object", "deadbeef"],
    ["a token that is not a sha at all", "not-a-sha-at-all"],
    ["the empty string (an unexpanded shell variable)", ""],
  ])("DIRECTION 2 (%s): REFUSES — never a silent clean gate", (_label, base) => {
    const r = runAtlas(repo.repoPath, ["reconcile", base])
    // BEFORE THE FIX all three exited 0 with `status: ok` — a green merge gate in a repo with blocking drift.
    expect(r.exitCode).not.toBe(0)
    expect(r.stdout).not.toContain("status: ok")
    expect(reasonOf(r.stdout)).toContain("unresolvable-merge-base:")
    expect(reasonOf(r.stdout)).toContain("NOTHING WAS CLASSIFIED") // it says what it did NOT do
  })

  it("the refusal is NOT the internal-fault class — it is an attributed, caller-facing refusal", () => {
    const r = runAtlas(repo.repoPath, ["reconcile", "not-a-sha-at-all"])
    expect(r.stdout).not.toContain("internal-fault")
    expect(r.stdout).not.toContain("malformed-args")
  })

  it("DIRECTION 3 (the per-fact skip SURVIVES): a REAL base where the anchor did not exist ⇒ exit 0", () => {
    // A fact grounded at a file introduced AFTER `later`. Reconciled against `later` (a real, resolvable rev),
    // `resolveAnchorAt(later, 'src/late.ts')` is `undefined` — a genuine "no baseline anchor for THIS fact".
    // That must stay a per-fact skip: the base exists, so the gate has a real answer and the answer is clean.
    repo.commit({ "src/late.ts": "export const late = 3;\n" })
    const late = draftFact(repo, "src/late.ts", "invariant", "late is 3").fact
    const emit = emitFact(repo, late)
    expect(emit.exitCode).toBe(0)

    const r = runAtlas(repo.repoPath, ["reconcile", later])
    expect(r.exitCode).toBe(0) // resolvable base, nothing drifted across it ⇒ an HONEST clean gate
    expect(r.stdout).toContain("status: ok")
    expect(r.stdout).not.toContain("unresolvable-merge-base") // and it is NOT the refusal above
  })
})
