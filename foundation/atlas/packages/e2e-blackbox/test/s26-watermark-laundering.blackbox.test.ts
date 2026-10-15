// @atlas/e2e-blackbox — test/s26-watermark-laundering.blackbox.test.ts  (S26 — the watermark is PER-ROW)
//
// NARRATIVE: S15 proved the watermark FIRES when HEAD advances. This story proves it cannot be LAUNDERED.
// The projection-level `builtAt` was stamped with live HEAD by EVERY publication, so ANY subsequent write —
// an emit about a completely unrelated file — re-stamped the whole projection at the new HEAD and the
// behind-HEAD signal for the ALREADY-DRIFTED fact vanished. One write, `stale` back to `false`, exit 0, and
// `atlas doctor why` still printing the drift with the same anchorWas/anchorNow. A read that reports clean
// while the diagnostic port reports drift is the false-PASS class: the signal is worse than no signal.
//
// TEETH: the ONLY thing that happens between the `stale: true` read and the laundering read is an emit whose
// grounding anchor is a DIFFERENT file in a DIFFERENT sub-tree. Fact A is never touched — not its bytes, not
// its stored freshness, not its anchor. So a `stale: false` after that emit is attributable to the watermark
// ALONE, and `doctor why A` is carried in the same test as the independent oracle that says it is a lie.
//
// The per-row watermark additionally makes staleness PER-SCOPE accurate: `src/app` (holding the drifted fact)
// is stale, `src/lib` (holding only the just-verified fact) is not — where one projection-wide flag had to
// answer both the same way.
//
// Driven ONLY through the real doors — the `atlas` CLI subprocess.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { makeFixtureRepo, runAtlas } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { draftFact } from "./support.js"
import { ACTOR, RATIFIER, emitFact, invLines, scopedPolicy } from "./support.js"

const APP = "src/app/foo.ts"
const LIB = "src/lib/other.ts"

/** The rendered `  stale: <bool>` line of a query verdict — the observable watermark. */
function staleOf(stdout: string): string {
  return (
    stdout
      .split("\n")
      .find((l) => l.trimStart().startsWith("stale:"))
      ?.trim() ?? "<no stale line>"
  )
}

let repo: FixtureRepo
let priorActor: string | undefined
let priorRatify: string | undefined
let factA: string
let factB: string

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER

  repo = makeFixtureRepo({
    files: { [APP]: "export const foo = 1;\n", [LIB]: "export const other = 2;\n" },
    policy: scopedPolicy("src"),
  })
  // Fact A at genesis (C1), grounded at src/app/foo.ts — the fact that will DRIFT.
  const a = draftFact(repo, APP, "invariant", "foo is one").fact
  factA = a.id as unknown as string
  const e = emitFact(repo, a)
  if (e.exitCode !== 0) throw new Error(`S26 setup: emit A failed:\n${e.stdout}`)
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

describe("S26 — an unrelated write cannot LAUNDER the freshness watermark (it is per-ROW, not per-file)", () => {
  it("AT HEAD: fact A is served and the pack is honestly fresh", () => {
    const r = runAtlas(repo.repoPath, ["query", "src"])
    expect(r.exitCode).toBe(0)
    expect(invLines(r.stdout)).toEqual([`  inv T1 ${factA} [FRESH]: foo is one`])
    expect(staleOf(r.stdout)).toBe("stale: false")
  })

  it("AFTER THE ANCHORED CODE CHANGES (C2): the read is honestly stale, and doctor agrees it drifted", () => {
    const before = repo.sha()
    const after = repo.commit({ [APP]: "export const foo = 99;\n// semantic change\n" })
    expect(after).not.toBe(before)

    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    expect(staleOf(q.stdout)).toBe("stale: true")

    const why = runAtlas(repo.repoPath, ["doctor", "why", factA])
    expect(why.exitCode).toBe(0)
    expect(why.stdout).toContain(`fact=${factA}`)
    expect(why.stdout).toContain("class=semantic") // the independent oracle: A really is drifted
  })

  it("THE DEFECT: an UNRELATED emit must not re-stamp the drifted fact — `stale` stays true", () => {
    // The unrelated write. Fact B is grounded at src/lib/other.ts — a different file, a different sub-tree,
    // untouched by the C2 commit. It re-derives FRESH, so the emit legitimately settles at C2.
    const b = draftFact(repo, LIB, "invariant", "other is two").fact
    factB = b.id as unknown as string
    const e = emitFact(repo, b)
    expect(e.exitCode).toBe(0)

    // Fact A was NOT touched by that emit: same bytes, same stored freshness, same anchor. doctor still says so.
    const why = runAtlas(repo.repoPath, ["doctor", "why", factA])
    expect(why.stdout).toContain("class=semantic")

    const q = runAtlas(repo.repoPath, ["query", "src"])
    expect(q.exitCode).toBe(0)
    // [ADR-0013] MEASURED through the binary: the two rows now disagree, per fact, and correctly. Fact A's
    // anchored unit really did move at C2 — `doctor why` says `class=semantic` three lines up — and the READ
    // door finally says the same thing on A's own row. Fact B, derived at HEAD, says FRESH. Before this WP
    // the read door had no way to say either: it had one pack-wide boolean and both rows looked alike.
    expect(invLines(q.stdout)).toEqual([
      ...[`  inv T1 ${factA} [STALE]: foo is one`, `  inv T1 ${factB} [FRESH]: other is two`].sort(),
    ])
    // BEFORE THE FIX this read said `stale: false` — one unrelated emit laundered the whole projection's
    // watermark, so the drifted fact A was served as verified-fresh while doctor printed its drift.
    expect(staleOf(q.stdout)).toBe("stale: true")
  })

  it("PER-SCOPE ACCURACY: the drifted sub-tree is stale, the just-verified sub-tree is not", () => {
    const app = runAtlas(repo.repoPath, ["query", "src/app"])
    expect(app.exitCode).toBe(0)
    expect(invLines(app.stdout)).toEqual([`  inv T1 ${factA} [STALE]: foo is one`])
    expect(staleOf(app.stdout)).toBe("stale: true") // A's row was derived at C1, HEAD is C2

    const lib = runAtlas(repo.repoPath, ["query", "src/lib"])
    expect(lib.exitCode).toBe(0)
    expect(invLines(lib.stdout)).toEqual([`  inv T1 ${factB} [FRESH]: other is two`])
    // B's row was derived AT the current HEAD, and nothing under src/lib drifted — a projection-wide flag
    // could not say this without also saying it about src/app.
    expect(staleOf(lib.stdout)).toBe("stale: false")
  })

  // LAST — it rewrites the durable store in place to look like one an OLDER build wrote, so nothing may run
  // after it.
  it("BACK-COMPAT: a store with NO per-row stamps still reads, and falls back to the projection watermark", () => {
    // Downgrade the on-disk store to the pre-fix shape: strip `derivedAt` from every row of every sidecar
    // file, keeping the projection-level `builtAt` exactly as it is. This is what every store written before
    // the per-row stamp existed looks like, and the upgrade path must neither refuse it nor flip it wholesale.
    const dir = join(repo.repoPath, ".atlas")
    const files = readdirSync(dir).filter((n) => n.startsWith("projection") && n.endsWith(".json"))
    expect(files.length).toBeGreaterThan(0) // non-vacuous: there really is a store to downgrade
    let stripped = 0
    for (const name of files) {
      const path = join(dir, name)
      const wire = JSON.parse(readFileSync(path, "utf8")) as {
        builtAt?: string
        current: [string, Record<string, unknown>][]
      }
      expect(typeof wire.builtAt).toBe("string") // the old signal is present and is what must be fallen back to
      for (const [, row] of wire.current) {
        if ("derivedAt" in row) stripped++
        delete row.derivedAt
      }
      writeFileSync(path, JSON.stringify(wire))
    }
    expect(stripped).toBeGreaterThan(0) // the stamps really were there — the downgrade is not a no-op

    // The rows still SERVE (an unstamped store is not refused, not emptied, not silently dropped)...
    const atHead = runAtlas(repo.repoPath, ["query", "src"])
    expect(atHead.exitCode).toBe(0)
    expect(invLines(atHead.stdout).length).toBe(2)
    expect(staleOf(atHead.stdout)).toBe("stale: false") // builtAt == HEAD ⇒ the old signal says fresh

    // ...and the projection-level watermark is what decides them, exactly as it did before this change.
    repo.commit({ "src/lib/later.ts": "export const later = 4;\n" })
    const behind = runAtlas(repo.repoPath, ["query", "src"])
    expect(behind.exitCode).toBe(0)
    expect(invLines(behind.stdout).length).toBe(2) // still served — behind ≠ gone
    expect(staleOf(behind.stdout)).toBe("stale: true") // the FALLBACK fired: no row stamp ⇒ use builtAt
  })
})
