// @atlas/e2e-blackbox — test/s8-doctor.blackbox.test.ts  (S8 — the `atlas doctor` advisory surface + totality)
//
// NARRATIVE: a lead emits TWO grounded, ratified facts, then commits ONE code change that drifts BOTH — but
// in OPPOSITE ways. A symbol-anchored fact's cited code MOVES (a new declaration is prepended above it, so
// the symbol's byte-start shifts) yet its body is byte-identical: it still RE-DERIVES at HEAD ⇒ a MECHANICAL
// drift the anchor can be re-grounded to. A file-anchored fact's cited code is genuinely CHANGED (its body is
// rewritten) so the claim no longer re-derives ⇒ a SEMANTIC drift that must be retired. `atlas doctor` then
// diagnoses the store READ-ONLY across ALL FOUR advisory legs — `archive` (supersede lineage, optionally
// scoped), `why` (drift classification), `hotset` (hot-set size vs a budget), and `reground` (a
// re-ground/retire PROPOSAL). Every leg runs through the REAL `atlas` bin as a subprocess, against a real git
// history (the fixture `commit()` advances HEAD). No in-process shortcut.
//
// SOTA invariants pinned:
//   - BOTH DRIFT VERDICTS ARE REACHABLE (KNOW-5) — `doctor why`/`doctor reground` classify a moved-but-alive
//     claim `mechanical`/`reground` and a rotted claim `semantic`/`retire`. The two verdicts genuinely
//     DISAGREE on the same HEAD. (This flips the earlier finding: the composed `DoctorSource` used to
//     re-compare the recorded hash to itself on the SAME anchor, so a detected drift was ALWAYS `semantic` and
//     `mechanical`/`reground` were structurally unreachable — WP-N9 fixes `drift()` to classify by whether the
//     recorded CONTENT re-derives SOMEWHERE at HEAD, and folds the arbitrary-rev index so symbol anchors resolve.)
//   - DOCTOR IS ADVISORY-ONLY (TOOLS-12) — the diagnostic port mutates NOTHING: `.atlas/cas` is BYTE-IDENTICAL
//     across every doctor call, and `reground` (the only leg that even proposes a write) leaves both the CAS
//     AND the durable `projection.json` sidecar byte- and mtime-unchanged. Doctor carries no write authority.
//   - CLI TOTALITY (CLI-1b/CLI-1c) — an unknown subcommand, a missing required arg, and a bare `doctor` all
//     fail CLOSED to a STRUCTURED error (`status: error`) + guidance + non-zero exit — never a throw / crash.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import type { GroundedFact } from "@atlas/knowledge"
import { ACTOR, RATIFIER, emitFact, scopedPolicy } from "./support.js"
import { draftFact, symbolAnchorKey } from "./support.js"

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

/** The durable projection sidecar's `{ bytes, mtimeMs }` — `.atlas/projection.json` lives OUTSIDE the CAS
 *  root (store.ts), so a doctor call that persisted anything would move EITHER. `NONE` if absent. */
function projectionStamp(repoPath: string): string {
  const path = join(repoPath, ".atlas", "projection.json")
  try {
    return `${readFileSync(path, "utf8")}@${statSync(path).mtimeMs}`
  } catch {
    return "NONE"
  }
}

/** The single rendered payload line of a doctor verdict (the `archive:`/`whyBroken:`/`hotSet:`/`plan:` row). */
function payloadLine(stdout: string, prefix: string): string {
  return stdout.split("\n").find((l) => l.startsWith(prefix)) ?? ""
}

let repo: FixtureRepo
let mechFact: GroundedFact // symbol-anchored: its code MOVES but re-derives ⇒ MECHANICAL
let semFact: GroundedFact //  file-anchored: its code is rewritten ⇒ SEMANTIC
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // KNOW-8 ratifier — the emitted T1 facts route to full-ratify (N7)
  repo = makeFixtureRepo({
    files: {
      "src/keep.ts": "export const foo = 1;\n", //  the symbol `foo` — will MOVE (content preserved)
      "src/rot.ts": "export const gone = 1;\n", //   the file `rot.ts` — its body will be REWRITTEN
    },
    policy: scopedPolicy("src"),
  })
  // MECHANICAL: a fact grounded at the `::` symbol unit `foo` (a sub-file anchor whose subtreeHash is `foo`'s
  // own body). A body-preserving move re-keys the unit (byte-start shifts) but the content re-derives at HEAD.
  mechFact = draftFact(repo, symbolAnchorKey(repo, "src/keep.ts", "foo"), "invariant", "foo is 1").fact
  // SEMANTIC: a fact grounded at the FILE `src/rot.ts`; rewriting its body makes the recorded content vanish.
  semFact = draftFact(repo, "src/rot.ts", "invariant", "rot exists").fact
  const e1 = emitFact(repo, mechFact)
  if (e1.exitCode !== 0) throw new Error(`S8 setup: mechanical grounded emit failed:\n${e1.stdout}`)
  const e2 = emitFact(repo, semFact)
  if (e2.exitCode !== 0) throw new Error(`S8 setup: semantic grounded emit failed:\n${e2.stdout}`)
  // ONE commit drifting BOTH: `foo` MOVES TO ANOTHER FILE (its body is byte-identical, so the unit's
  // subtreeHash survives and `resolveBySubtreeAt` finds it at HEAD ⇒ mechanical) AND `gone`'s body in
  // rot.ts is rewritten (the file's recorded content vanishes ⇒ semantic).
  //
  // WHY NOT "prepend a declaration above `foo`": that is what this fixture used to do, and it manufactured
  // its mechanical drift by exploiting a BUG — the anchor key carried the symbol's BYTE START INDEX, so an
  // added import above a unit re-keyed it. With the key now `<parent>::<kind>:<ordinal>[:<name>]`, a
  // prepend correctly drifts NOTHING, and `doctor why` correctly reports `whyBroken: none`. The doctor's
  // `mechanical` verdict was, in this fixture, only ever reachable through the false drift.
  repo.commit({
    "src/keep.ts": "// foo moved to src/moved.ts\n",
    "src/moved.ts": "export const foo = 1;\n",
    "src/rot.ts": "export const gone = 999;\n// semantic change\n",
  })
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S8 — atlas doctor: four read/advisory legs + CLI totality (read-only)", () => {
  it("1. `doctor archive [scope]` renders the scope-filtered supersede lineage (exit 0, read-only)", () => {
    // No scope: the whole current-node CAS chain. Two facts are on disk ⇒ a bracketed list of CAS hashes.
    const all = runAtlas(repo.repoPath, ["doctor", "archive"])
    expect(all.exitCode).toBe(0)
    expect(all.stdout).toContain("status: ok")
    expect(all.stdout).toContain("doctor: archive")
    expect(all.stdout).toContain("invariant: TOOLS-12") // the advisory guidance always ships (INV-TOOLS-4)
    expect(payloadLine(all.stdout, "archive:")).toMatch(/^archive: \[[0-9a-f]+(, [0-9a-f]+)*\]$/) // CAS hashes, bracketed

    // Scoped to `src` (both facts' scope): still the same non-empty lineage.
    const scoped = runAtlas(repo.repoPath, ["doctor", "archive", "src"])
    expect(scoped.exitCode).toBe(0)
    expect(payloadLine(scoped.stdout, "archive:")).toMatch(/^archive: \[[0-9a-f]+(, [0-9a-f]+)*\]$/)

    // A scope NO fact lives under filters the chain to empty — an empty-BUT-STRUCTURED result (never a throw).
    const empty = runAtlas(repo.repoPath, ["doctor", "archive", "no-such-scope"])
    expect(empty.exitCode).toBe(0)
    expect(payloadLine(empty.stdout, "archive:")).toBe("archive: []")
  })

  it("2. `doctor why <fact>` classifies BOTH a mechanical AND a semantic drift (exit 0, read-only)", () => {
    // MECHANICAL — the symbol MOVED but its body re-derives at HEAD ⇒ re-groundable (not broken).
    const mech = runAtlas(repo.repoPath, ["doctor", "why", String(mechFact.id)])
    expect(mech.exitCode).toBe(0)
    expect(mech.stdout).toContain("doctor: why")
    expect(mech.stdout).toContain(`whyBroken: fact=${mechFact.id}`)
    expect(mech.stdout).toContain("class=mechanical") // REACHABLE — the drift moved but survives
    expect(mech.stdout).toMatch(/anchorWas=\S+ anchorNow=\S+/)

    // SEMANTIC — the file body was rewritten, so the recorded content no longer re-derives ANYWHERE ⇒ broken.
    const sem = runAtlas(repo.repoPath, ["doctor", "why", String(semFact.id)])
    expect(sem.exitCode).toBe(0)
    expect(sem.stdout).toContain(`whyBroken: fact=${semFact.id}`)
    expect(sem.stdout).toContain("class=semantic")
    expect(sem.stdout).toMatch(/anchorWas=\S+ anchorNow=\S+/)
  })

  it("3. `doctor hotset <budget>` renders hot-set size vs budget with the over-budget flag (exit 0)", () => {
    // Exactly two current nodes ⇒ size=2. A budget above it is NOT over; a zero budget IS over (advisory flag).
    const under = runAtlas(repo.repoPath, ["doctor", "hotset", "5"])
    expect(under.exitCode).toBe(0)
    expect(under.stdout).toContain("doctor: hotset")
    expect(payloadLine(under.stdout, "hotSet:")).toBe("hotSet: size=2 budget=5 over=false")

    const over = runAtlas(repo.repoPath, ["doctor", "hotset", "0"])
    expect(over.exitCode).toBe(0)
    expect(payloadLine(over.stdout, "hotSet:")).toBe("hotSet: size=2 budget=0 over=true")
  })

  it("4. `doctor reground <fact>` proposes reground (mechanical) AND retire (semantic) — PERSISTS NOTHING", () => {
    const casBefore = casSnapshot(repo.repoPath)
    const projBefore = projectionStamp(repo.repoPath)
    expect(casBefore).not.toBe("NONE") //   the emitted facts really are on disk (non-vacuous baseline)
    expect(projBefore).not.toBe("NONE") //  the durable sidecar exists (governed-emit persisted it)

    // MECHANICAL ⇒ a `reground` proposal (the primary anchor swapped to its new HEAD location).
    const mech = runAtlas(repo.repoPath, ["doctor", "reground", String(mechFact.id)])
    expect(mech.exitCode).toBe(0)
    expect(mech.stdout).toContain("doctor: reground")
    expect(payloadLine(mech.stdout, "plan:")).toBe(
      `plan: action=reground fact=${mechFact.id} — PROPOSAL only; persists nothing. Run through atlas-emit to persist.`,
    )

    // SEMANTIC ⇒ a `retire` proposal (the claim tagged SUPERSEDED).
    const sem = runAtlas(repo.repoPath, ["doctor", "reground", String(semFact.id)])
    expect(sem.exitCode).toBe(0)
    expect(payloadLine(sem.stdout, "plan:")).toBe(
      `plan: action=retire fact=${semFact.id} — PROPOSAL only; persists nothing. Run through atlas-emit to persist.`,
    )

    // The write doors stay shut across BOTH proposals: doctor carries no write authority (TOOLS-12).
    expect(casSnapshot(repo.repoPath)).toBe(casBefore) //     CAS byte-identical
    expect(projectionStamp(repo.repoPath)).toBe(projBefore) // projection bytes AND mtime unchanged
  })

  it("5. doctor is READ-ONLY overall: `.atlas/cas` is BYTE-IDENTICAL across ALL FOUR legs (both verdicts)", () => {
    const before = casSnapshot(repo.repoPath)
    expect(before).not.toBe("NONE") // non-vacuous
    const runs = [
      runAtlas(repo.repoPath, ["doctor", "archive", "src"]),
      runAtlas(repo.repoPath, ["doctor", "why", String(mechFact.id)]),
      runAtlas(repo.repoPath, ["doctor", "why", String(semFact.id)]),
      runAtlas(repo.repoPath, ["doctor", "hotset", "3"]),
      runAtlas(repo.repoPath, ["doctor", "reground", String(mechFact.id)]),
      runAtlas(repo.repoPath, ["doctor", "reground", String(semFact.id)]),
    ]
    for (const run of runs) expect(run.exitCode).toBe(0) // every advisory leg actually ran
    expect(casSnapshot(repo.repoPath)).toBe(before) // persisted NOTHING across the whole surface
  })

  it("6. CLI totality: an unknown sub / a missing arg / a bare `doctor` all fail CLOSED (structured, no crash)", () => {
    // Unknown subcommand ⇒ structured error + the enumerated surface as guidance (never a throw).
    const bogus = runAtlas(repo.repoPath, ["doctor", "bogus-sub"])
    expect(bogus.exitCode).not.toBe(0)
    expect(bogus.exitCode).toBe(1)
    expect(bogus.stdout).toContain("status: error")
    expect(bogus.stdout).toContain("unknown doctor subcommand 'bogus-sub'")
    expect(bogus.stdout).toContain("archive|why|hotset|reground|cas|index") // the finite surface is named
    expect(bogus.stderr).toBe("") // no thrown stack leaked to stderr

    // A missing required numeric arg ⇒ structured error (arity is met by `hotset`, so runDoctor guards it).
    const noBudget = runAtlas(repo.repoPath, ["doctor", "hotset"])
    expect(noBudget.exitCode).toBe(1)
    expect(noBudget.stdout).toContain("status: error")
    expect(noBudget.stdout).toContain("doctor hotset requires a numeric <budget>")
    expect(noBudget.stderr).toBe("")

    // A bare `doctor` (no sub) trips the parser's arity floor FIRST — still a structured non-zero error.
    const bare = runAtlas(repo.repoPath, ["doctor"])
    expect(bare.exitCode).toBe(1)
    expect(bare.stdout).toContain("status: error")
    expect(bare.stdout).toMatch(/requires 1 positional argument/)
    expect(bare.stderr).toBe("")
  })
})
