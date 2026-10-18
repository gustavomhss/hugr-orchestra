// harness/probes/a2r-corpus.test.mjs — SHAPE calibration of the A2r corpus, runnable under `npm test`.
//
// Unlike `a2-staleness.test.mjs` (which drives the real `reDerives` oracle inline — no external tool
// dependency), `a2r-reproof.mjs` needs `scip-typescript`, which is NOT an npm dependency of this repo (CI's
// `npm ci` never installs it — see `a2r-reproof.mjs`'s module header). Driving the real oracle here would
// make `npm test` fail on every machine/CI run that lacks the global binary, which is not this repo's own
// unsoundness — it is an environment gap. This file instead pins the corpus's own SHAPE: both classes
// present, every entry `real` (or explicitly labeled `synthetic` with a stated reason), ids unique, every
// `edits` entry syntactically well-formed, and every entry's `witness`/`expected` pair internally consistent
// with its `class`. `harness/probes/a2r-reproof.mjs` is the one file that actually runs the corpus through
// the shipped oracle — run it BY NAME (`node harness/probes/a2r-reproof.mjs`), not via `npm test`.

import { describe, it, expect } from "vitest"
import { CORPUS } from "./a2r-corpus/index.mjs"

describe("A2r corpus — shape calibration (no build required)", () => {
  it("both classes present, non-empty, ids unique", () => {
    const ids = CORPUS.map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CORPUS.filter((e) => e.class === "invalidating").length).toBeGreaterThan(0)
    expect(CORPUS.filter((e) => e.class === "preserving").length).toBeGreaterThan(0)
  })

  it("multiple entries per class (a single-entry class cannot show a technique is discriminating, not a fluke)", () => {
    expect(CORPUS.filter((e) => e.class === "invalidating").length).toBeGreaterThan(1)
    expect(CORPUS.filter((e) => e.class === "preserving").length).toBeGreaterThan(1)
  })

  it("every entry is real (or explicitly labeled synthetic with a reason) — the real/synthetic split must be STATED, never implicit", () => {
    for (const e of CORPUS) {
      if (e.real === true) continue
      expect(e.real, `${e.id}: real must be exactly true or false`).toBe(false)
      expect(
        typeof e.syntheticReason,
        `${e.id}: a synthetic entry must state WHY real data could not supply this case`,
      ).toBe("string")
    }
  })

  it("class and expected verdict agree ('invalidating' ⇒ 'broken', 'preserving' ⇒ 're-proven')", () => {
    for (const e of CORPUS) {
      if (e.class === "invalidating") expect(e.expected, e.id).toBe("broken")
      else expect(e.expected, e.id).toBe("re-proven")
    }
  })

  it("every witness names a dependency-slot target/scope and a non-empty edits list", () => {
    for (const e of CORPUS) {
      expect(e.witness.slot, e.id).toBe("dependency")
      expect(e.witness.target.length, e.id).toBeGreaterThan(0)
      expect(e.witness.scope.length, e.id).toBeGreaterThan(0)
      expect(e.anchor.startsWith(e.witness.scope), `${e.id}: anchor must sit under the witness's own scope`).toBe(true)
      expect(e.edits.length, e.id).toBeGreaterThan(0)
    }
  })

  it("every edit is a genuine change (find !== replace) — a no-op edit would silently shrink the corpus to fewer real mutations than claimed", () => {
    for (const e of CORPUS) {
      for (const edit of e.edits) {
        expect(edit.find, `${e.id}/${edit.file}`).not.toBe(edit.replace)
        expect(edit.find.length, `${e.id}/${edit.file}`).toBeGreaterThan(0)
      }
    }
  })

  it("at least two distinct mutation techniques appear in EACH class (a class must not rest on one trick)", () => {
    const techniquesOf = (cls) => new Set(CORPUS.filter((e) => e.class === cls).map((e) => e.technique))
    expect(techniquesOf("invalidating").size, "invalidating techniques").toBeGreaterThan(1)
    expect(techniquesOf("preserving").size, "preserving techniques").toBeGreaterThan(1)
  })
})
