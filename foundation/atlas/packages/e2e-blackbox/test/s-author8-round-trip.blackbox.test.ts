// @atlas/e2e-blackbox — test/s-author8-round-trip.blackbox.test.ts  (WP-10.A2-a.E2E — PROP-AUTH-8)
//
// THE ROUND-TRIP PROPERTY, BLACK-BOX, OVER THE WHOLE FIXTURE — not one hand-picked anchor. `atlas anchors`
// / `atlas slots` / `atlas draft --json` / `atlas emit` are all driven as SUBPROCESS invocations of the
// SHIPPED `atlas` bin (`../src/harness.js`'s `runAtlas`, the same seam every sibling `*.blackbox.test.ts`
// uses). This file imports NOTHING from `@atlas/*` in any EXECUTION or ASSERTION path.
//
// A TRUE BYTE RELAY, NOT A RECONSTRUCTION. WP-10.A2-a.CLI-JSON shipped `atlas draft <anchor> <slot> <claim>
// --json`, which prints the WHOLE `DraftOut` envelope (`JSON.stringify`'d verbatim) instead of the old
// human-text subset. `./author8-subprocess.ts`'s `draftThenEmit` captures that stdout UNTOUCHED, writes the
// EXACT SAME bytes to the file `atlas emit <file> --at <rev>` reads, and reads only `.rev` off the captured
// JSON (needed because the CLI wire requires a positional `--at <sha>`) — no field of the envelope is
// inspected, hand-picked, or rebuilt anywhere in this story. The envelope crossing draft→emit is produced
// ENTIRELY by product doors; this story supplies the anchor/slot/claim in, and asserts the exit code out.
// (An earlier revision of this file DID reconstruct the envelope by hand, off the pre-`--json` human-text
// render plus frozen `packages/tools/src/draft.ts` literals — that code and its helper `envelope.ts` are
// DELETED now that the CLI closes the gap directly; see the campaign history for why it existed at all.)
//
// THE `fix-author` FIXTURE (goldens-authoring.md §Fixture universe) — TWO COMMITS, a `.ts` + a `.rs` + a
// non-code file: R1 commits `.gitignore` + the two TypeScript files (symbol-capable, folds `::` units); R2
// adds the grammar-less `.rs` pair (declares ONE hole, `A-D5`/AUTHOR-4) and the non-code `docs/notes.md`
// (a file unit with no symbol children). Every SCN/PROP below runs at the FINAL rev (R2) — "an unchanged
// repository" means no commit happens BETWEEN a draft and its paired emit, not that the fixture has only one
// commit.
//
// SCOPE NOTE (own the framing decision, not just the code). PROP-AUTH-8's law is `∀ unit × ∀ slot(13) × arb
// claim`. A literal cross of EVERY unit (11, excluding the `.atlas/*` fixture plumbing and `.gitignore`)
// against ALL 13 slots is 143 combos × 2 subprocess spawns — correct, but well past "keep the fixture small
// enough to run under the global timeout" for a single `it()`/file. This file instead:
//   (1) SCN-AUTH-8a-1 — ONE anchor, ONE slot: the smallest possible witness.
//   (2) SCN-AUTH-8b-1 (guard) — EVERY real unit in the fixture (dir, file, symbol, grammar-less file), each
//       drafted+emitted at least once — the "not one anchor" guarantee, at unit-kind granularity.
//   (3) PROP-AUTH-8 (the ∀ law) — ONE representative anchor per DISTINCT unit KIND (dir / ts file / ts
//       symbol / grammar-less `.rs` file / non-code file) × the FULL 13-member slot union — the teeth this
//       property specifically calls out ("a drafter correct for file anchors and wrong for the folded `::`
//       symbol unit path... only the ∀ over the real unit set reaches the symbol case") fire on EVERY kind,
//       for EVERY slot, not just the one the hand-written SCN happens to pick.
// Together, (2)+(3) cover strictly MORE of the ∀'s two dimensions than either alone, at a fraction of the
// literal full cross's subprocess count — a stated, deliberate instantiation of the property, not a silent
// narrowing.

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { makeFixtureRepo } from "../src/harness.js"
import type { FixtureRepo } from "../src/harness.js"
import { anchorsOf, draftThenEmit, slotNames } from "./author8-subprocess.js"
import type { AnchorRow } from "./author8-subprocess.js"

const ACTOR = "e2e@atlas.local"
const RATIFIER = "lead"

// ── the fix-author fixture — R1 (ts) then R2 (rs + non-code) ─────────────────────────────────────────────
const R1_FILES: Readonly<Record<string, string>> = {
  ".gitignore": "dist/\n",
  "src/app.ts":
    "export function run(): string {\n  return `running`;\n}\n\nexport function helper(): number {\n  return 1;\n}\n",
  "src/util.ts": "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
}
const R2_FILES: Readonly<Record<string, string>> = {
  "core/engine.rs": "pub fn engine() -> u32 {\n    42\n}\n",
  "core/mod.rs": "pub mod engine;\n",
  "docs/notes.md": "# notes\n\nsome prose, no symbols.\n",
}

/** The `authz.scopes` every draft's `scopeOf(anchor)` (the first `/`-segment — AUTHOR-6d's structural
 *  default) resolves to over this fixture — `src`/`core`/`docs`, each granting {@link ACTOR}. Sized by
 *  INSPECTING the fixture's own path layout, not by importing the product's `scopeOf` implementation. */
const POLICY = JSON.stringify({
  nearDup: { claimNormThreshold: 1 },
  t0Heuristic: { keywords: [] },
  authz: { scopes: { src: [ACTOR], core: [ACTOR], docs: [ACTOR] } },
})

/** Fixture plumbing, never a golden unit under test: the `.atlas/*` tracked artifacts + `.gitignore` — the
 *  goldens-authoring.md fixture-universe table names them by their PLUMBING role ("contains `dist/`"), not
 *  as a drafted anchor. */
function isRealUnit(u: AnchorRow): boolean {
  return u.qualifiedPath !== ".gitignore" && !u.qualifiedPath.startsWith(".atlas")
}

let repo: FixtureRepo
let rev: string
let units: readonly AnchorRow[]
let slots: readonly string[]
let priorActor: string | undefined
let priorRatify: string | undefined

beforeAll(() => {
  priorActor = process.env.ATLAS_ACTOR
  priorRatify = process.env.ATLAS_RATIFY_TOKEN
  process.env.ATLAS_ACTOR = ACTOR
  process.env.ATLAS_RATIFY_TOKEN = RATIFIER // `draft` always states `full-ratify` (AUTHOR-9's safe direction)

  repo = makeFixtureRepo({ files: R1_FILES, policy: POLICY })
  repo.commit(R2_FILES) // R2 — the second commit; every SCN/PROP below runs at this FINAL, unchanged rev
  rev = repo.sha()

  const listing = anchorsOf(repo.repoPath, ".") // the WHOLE tree in one call — root's descendants, ADR-0004
  expect(listing.rev).toBe(rev) // sanity: the planner's own rev agrees with git HEAD
  units = listing.units.filter(isRealUnit)
  slots = slotNames(repo.repoPath)
})

afterAll(() => {
  repo?.cleanup()
  if (priorActor === undefined) delete process.env.ATLAS_ACTOR
  else process.env.ATLAS_ACTOR = priorActor
  if (priorRatify === undefined) delete process.env.ATLAS_RATIFY_TOKEN
  else process.env.ATLAS_RATIFY_TOKEN = priorRatify
})

// ── sanity: the fixture's own unit census is what the goldens-authoring.md table promises ──────────────────
describe("fix-author — the real unit census (sanity, not the property itself)", () => {
  it("carries every kind SCN-AUTH-8b-1 requires: dir, file, symbol, AND a grammar-less file", () => {
    const kinds = new Set(units.map((u) => u.kind))
    expect(kinds).toEqual(new Set(["dir", "file", "symbol"]))
    // the `.rs` pair anchors at FILE level only (no `::` fold — no configured grammar, A-D5/AUTHOR-4)
    expect(units.some((u) => u.qualifiedPath === "core/engine.rs" && u.kind === "file")).toBe(true)
    expect(units.some((u) => u.qualifiedPath.startsWith("core/engine.rs::"))).toBe(false)
    // the .ts files fold `::` symbol units (grammar is warm)
    expect(units.some((u) => u.kind === "symbol" && u.qualifiedPath.startsWith("src/app.ts::"))).toBe(true)
    // the non-code file is a plain file unit with no symbol children and no declared hole (`.md` is not a
    // recognised structured-source extension — GRAMMARLESS_SOURCE excludes it, AUTHOR-4's "no overclaim")
    expect(units.some((u) => u.qualifiedPath === "docs/notes.md" && u.kind === "file")).toBe(true)
    expect(units.length).toBeGreaterThanOrEqual(11) // 3 dirs + 5 files + 3 `::` symbols, at minimum
  })

  it("the closed slot vocabulary is the real 13-member union, not a guessed subset", () => {
    expect(slots.length).toBe(13)
    expect(new Set(slots).size).toBe(13) // genuinely distinct — no duplicate row
  })
})

// ── (1) SCN-AUTH-8a-1 — the round trip closes for ONE anchor ─────────────────────────────────────────────
describe("SCN-AUTH-8a-1 — the round trip closes", () => {
  it("`src/app.ts::…run` drafted with slot 'invariant' and emitted at R2 is ACCEPTED (draft --json | emit, no reconstruction)", () => {
    const unit = units.find((u) => u.kind === "symbol" && u.qualifiedPath.endsWith(":run"))
    expect(unit).toBeDefined()
    const run = draftThenEmit(repo, (unit as AnchorRow).qualifiedPath, "invariant", "run never returns an empty string")
    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain("status: ok")
    expect(run.stdout).toMatch(/^ {2}id: [0-9a-f]{64}$/m) // the persisted CAS content hash — a real accept
  })
})

// ── (2) SCN-AUTH-8b-1 (guard) — no self-rejection across EVERY real unit in the fixture ────────────────────
describe("SCN-AUTH-8b-1 (guard) — no self-rejection across the fixture's REAL unit set", () => {
  // Registered at COLLECTION time off the module-level fixture is not possible (the fixture is built in
  // `beforeAll`), so this block drives the ∀ inside ONE `it` iterating the whole unit set (comfortably
  // inside the default 10s budget: this fixture's unit count is small — see the file header's scope note
  // for why the OTHER dimension, the slot union, is covered separately in PROP-AUTH-8).
  it("every unit — dir, file, symbol, grammar-less file — drafted with slot `invariant` and emitted (draft --json | emit) is ACCEPTED", () => {
    expect(units.length).toBeGreaterThan(0) // non-vacuity: the loop below actually iterates something
    const rejected: { unit: string; reason: string }[] = []
    for (const unit of units) {
      const claim = `a claim about ${unit.qualifiedPath}` // non-empty, unit-specific — never a shared literal
      const run = draftThenEmit(repo, unit.qualifiedPath, "invariant", claim)
      if (run.exitCode !== 0) rejected.push({ unit: unit.qualifiedPath, reason: run.stdout })
    }
    expect(rejected).toEqual([]) // teeth: a drafter wrong for JUST the `::` symbol path fails ONLY here
  })
})

// ── (3) PROP-AUTH-8 — the ∀ law: one representative anchor per unit KIND × the FULL 13-slot union ──────────
describe("PROP-AUTH-8 — draft→emit round-trip acceptance, ∀ over the real unit-kind set × the full slot union", () => {
  // One representative anchor per DISTINCT kind the fixture carries (dir / plain file / grammar-less file /
  // non-code file / `::` symbol) — see the file header's scope note for why this, combined with (2) above,
  // discharges strictly more of the property's two ∀ dimensions than either alone at 1/13th the subprocess
  // count of the literal full cross.
  function representative(qualifiedPath: string): AnchorRow {
    const u = units.find((x) => x.qualifiedPath === qualifiedPath)
    if (u === undefined)
      throw new Error(
        `PROP-AUTH-8: fixture has no unit '${qualifiedPath}' — a real fixture-shape regression, not a flake`,
      )
    return u
  }

  const REPRESENTATIVES: readonly { readonly label: string; readonly qualifiedPath: string }[] = [
    { label: "dir", qualifiedPath: "src" },
    { label: "ts file (symbol-capable)", qualifiedPath: "src/util.ts" },
    { label: "grammar-less .rs file", qualifiedPath: "core/engine.rs" },
    { label: "non-code file", qualifiedPath: "docs/notes.md" },
  ]

  // `arb claim strings (unicode, very long, punctuation-heavy, near-empty)` — cycled deterministically across
  // (kind, slot) combos so every claim SHAPE the law names is exercised at least once per representative kind,
  // never a single shared literal (which would leave a claim-shape-specific bug unreachable, per the law's
  // own arbitrary-generator spec). No literal newline in any variant (kept simple for readability, not for
  // parsing — nothing in this file parses `draft`'s claim back out of anything anymore).
  const CLAIM_VARIANTS: readonly string[] = [
    "this predicate holds for the cited unit", // plain
    'ユニコード claim — π ≈ 3.14159, café, Ω, "quoted", 日本語', // unicode
    "a".repeat(400) +
      " — a very long claim body padded out well past any typical line length to probe truncation-adjacent code paths", // very long
    "!!! @#$%^&*()_+-={}[]|\\:\";'<>?,./~` — punctuation-heavy, deliberately adversarial to any naive splitter", // punctuation-heavy
    "x", // near-empty (single non-space char — claim c ≠ ∅ is the law's own floor)
  ]

  for (const { label, qualifiedPath } of REPRESENTATIVES) {
    describe(`unit kind: ${label} (${qualifiedPath})`, () => {
      // One `it` per kind, looping all 13 slots inside — registered synchronously at collection time off the
      // MODULE-level `beforeAll`-independent constants above (`REPRESENTATIVES`/`CLAIM_VARIANTS` are static;
      // the fixture itself — `repo`/`units` — is read inside each test body, after `beforeAll` has run, never
      // at registration time). `slots` (the real 13-member union) is only known post-`beforeAll`, so the LOOP
      // itself has to run inside a single `it` per kind — 13 draft+emit pairs per kind, past the file's
      // default 10s test budget (a real per-`it` timeout override below), well inside 30s.
      it(`every one of the 13 real slots round-trips (draft --json | emit) — ACCEPTED, zero rejections`, () => {
        expect(slots.length).toBe(13) // fixture sanity re-asserted here too — a stale/empty union would be silent otherwise
        const unit = representative(qualifiedPath)
        const rejected: { slot: string; reason: string }[] = []
        slots.forEach((slot, i) => {
          const claim = `${CLAIM_VARIANTS[i % CLAIM_VARIANTS.length]} (${slot}@${qualifiedPath})`
          const run = draftThenEmit(repo, unit.qualifiedPath, slot, claim)
          if (run.exitCode !== 0) rejected.push({ slot, reason: run.stdout })
        })
        expect(rejected).toEqual([]) // PROP-AUTH-8: rejections == 0, over the WHOLE slot union, for THIS kind
      }, 30_000) // 13 subprocess pairs — well past the file's default 10s test budget, comfortably inside 30s
    })
  }
})

// ── (4) zero-@atlas/* guard — a mechanical, not just prose, check on this file's own imports ────────────────
describe("black-box law — this story imports no product library", () => {
  it("this file's own source text carries no `@atlas/` import specifier", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const src = readFileSync(fileURLToPath(import.meta.url), "utf8")
    const imports = [...src.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1])
    const productImports = imports.filter((spec) => spec?.startsWith("@atlas/"))
    expect(productImports).toEqual([])
  })

  it("`./author8-subprocess.ts` — the helper this story's execution/assertion path routes through — carries none either", async () => {
    const { readFileSync } = await import("node:fs")
    const { fileURLToPath } = await import("node:url")
    const here = fileURLToPath(import.meta.url)
    const helperPath = here.replace(/s-author8-round-trip\.blackbox\.test\.ts$/, "author8-subprocess.ts")
    const src = readFileSync(helperPath, "utf8")
    const imports = [...src.matchAll(/^import .*from '([^']+)'/gm)].map((m) => m[1])
    const productImports = imports.filter((spec) => spec?.startsWith("@atlas/"))
    expect(productImports).toEqual([])
  })
})
