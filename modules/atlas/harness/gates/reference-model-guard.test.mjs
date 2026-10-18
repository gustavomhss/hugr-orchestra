// harness/gates/reference-model-guard.test.mjs — the gate's OWN teeth.
//
// A gate nobody can falsify is decoration. This file plants, in a throwaway fixture tree, each defect the
// reference-model ledger gate claims to catch, and asserts the gate exits non-zero AND NAMES the violation.
// It also asserts the clean tree PASSES, so the gate cannot be satisfied by firing on everything.
//
// TWO seams drive the fixture, and only the gate's own teeth touch either:
//   • REFERENCE_MODEL_GUARD_ROOT   — the tree the reachability analyser MEASURES (pre-existing).
//   • REFERENCE_MODEL_GUARD_LEDGER — a `.mjs` module exporting `{ LEDGER, DECLARED_COUNTS }`. WITHOUT it the
//     ledger and the self-checking DECLARED COUNTS header are baked into the guard, so the ROOT seam alone
//     can NEVER pass — every baked entry reads STALE against a fixture tree. The seam defaults to the baked
//     ledger when unset (byte-identical real-repo behaviour, asserted by `npm run reference-model-guard`).
//
// The fixture is a miniature repo: `packages/app/src/{bin,live,dead,extra,typed}.ts` — bin.ts is the
// entrypoint CALLER that keeps live.ts live and type-reaches typed.ts; dead/extra/typed are the reference
// models — plus a ledger module describing exactly those three. Never the real tree.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, appendFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const GATE = fileURLToPath(new URL("./reference-model-guard.mjs", import.meta.url))

let root
const ledgerPath = () => join(root, "ledger.mjs")

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, REFERENCE_MODEL_GUARD_ROOT: root, REFERENCE_MODEL_GUARD_LEDGER: ledgerPath() },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

/** Write a source module under `packages/app/src/`. */
function mod(rel, body) {
  const p = join(root, "packages", "app", "src", rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}

/** Write the ledger module. `entries` is the LEDGER object literal text; `counts` the DECLARED_COUNTS line. */
function ledger(entries, counts = "declared-modules: 3 · dead-value-exports: 3 · type-reachable: 1") {
  writeFileSync(
    ledgerPath(),
    `export const LEDGER = ${entries};\nexport const DECLARED_COUNTS = ${JSON.stringify(counts)};\n`,
  )
}

/** The canonical CLEAN ledger — three reference models, matching the clean tree. */
const CLEAN_LEDGER = `{
  'packages/app/src/dead.ts': { values: 1, shipped: 'packages/app/src/live.ts', banner: true },
  'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },
  'packages/app/src/typed.ts': { values: 1, types: true, shipped: null, banner: false },
}`

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "reference-model-guard-"))
  // bin.ts is the entrypoint CALLER (excluded as a subject by name): it value-imports createApp, keeping
  // live.ts live, and `import type`s Shape, making typed.ts TYPE-reachable but value-dead.
  mod(
    "bin.ts",
    [
      "import { createApp } from './live.js';",
      "import type { Shape } from './typed.js';",
      "export function boot(s: Shape) { return createApp(); }",
      "boot({} as Shape);",
      "",
    ].join("\n"),
  )
  mod("live.ts", "export function createApp() { return 42; }\n") // has a caller (bin.ts) → NOT a reference model
  mod(
    "dead.ts",
    [
      "// dead.ts — a specification artifact.",
      "// ── REFERENCE MODEL ────────────────────────────────",
      "// Declared in the reference-model-guard ledger. Nothing calls this.",
      "export function unused() { return 1; }",
      "",
    ].join("\n"),
  )
  mod("extra.ts", "export function spare() { return 2; }\n") // reference model, no banner
  mod(
    "typed.ts",
    ["export type Shape = { n: number };", "export function makeShape(): Shape { return { n: 0 }; }", ""].join("\n"),
  )
  ledger(CLEAN_LEDGER)
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("reference-model-guard — the gate can be falsified", () => {
  it("PASSES the clean fixture (it does not fire on everything)", () => {
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(out).toMatch(/reference-model-guard: OK — 3 declared reference model\(s\)/)
    expect(code).toBe(0)
  })

  // (a) a NEW reference model — the leg this gate exists for.
  it("catches a NEW reference model absent from the ledger, and NAMES it", () => {
    mod("ghost.ts", "export function ghost() { return 3; }\n") // dead, unledgered
    const { code, out } = runGate()
    expect(out).toMatch(/NEW REFERENCE MODEL — packages\/app\/src\/ghost\.ts/)
    expect(code).toBe(1)
  })

  // (b) LEDGER DRIFT — a dead export added to an already-dead module.
  it("catches LEDGER DRIFT when a dead module GAINS a zero-caller value export", () => {
    appendFileSync(join(root, "packages", "app", "src", "dead.ts"), "export function alsoUnused() { return 9; }\n")
    const { code, out } = runGate()
    expect(out).toMatch(/LEDGER DRIFT — packages\/app\/src\/dead\.ts/)
    expect(out).toMatch(/ledger says 1, measured 2/)
    expect(code).toBe(1)
  })

  // (c) HEADER COUNTS mismatch — the DECLARED COUNTS line disagrees with the measured tree.
  it("catches a HEADER COUNT that disagrees with the measured tree", () => {
    ledger(CLEAN_LEDGER, "declared-modules: 99 · dead-value-exports: 3 · type-reachable: 1")
    const { code, out } = runGate()
    expect(out).toMatch(/HEADER COUNT DRIFT — declared-modules/)
    expect(out).toMatch(/says 99, the analyser measures 3/)
    expect(code).toBe(1)
  })

  // (d) missing banner on a module the ledger says carries one.
  it("catches a MISSING banner on a ledgered `banner: true` module", () => {
    mod("dead.ts", "export function unused() { return 1; }\n") // banner header stripped, ledger still says true
    const { code, out } = runGate()
    expect(out).toMatch(/BANNER MISSING — packages\/app\/src\/dead\.ts/)
    expect(code).toBe(1)
  })

  // ── every remaining branch gets a reddening test, so no leg is toothless-by-construction ──────────────

  it("catches the HEADER COUNTS LINE going missing entirely", () => {
    ledger(CLEAN_LEDGER, "no structured counts on this line")
    const { code, out } = runGate()
    expect(out).toMatch(/HEADER COUNTS MISSING/)
    expect(code).toBe(1)
  })

  it("catches a STALE ledger entry that has become shipped code", () => {
    // live.ts HAS a caller (bin.ts), so it is not a reference model — a ledger row for it is stale.
    ledger(
      CLEAN_LEDGER.replace(
        "'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },",
        "'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },\n  'packages/app/src/live.ts': { values: 1, shipped: null, banner: false },",
      ),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/STALE LEDGER ENTRY — packages\/app\/src\/live\.ts/)
    expect(out).toMatch(/it now HAS production callers/)
    expect(code).toBe(1)
  })

  it("catches a STALE ledger entry whose file no longer exists", () => {
    ledger(
      CLEAN_LEDGER.replace(
        "'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },",
        "'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },\n  'packages/app/src/gone.ts': { values: 1, shipped: null, banner: false },",
      ),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/STALE LEDGER ENTRY — packages\/app\/src\/gone\.ts/)
    expect(out).toMatch(/the file no longer exists/)
    expect(code).toBe(1)
  })

  it("catches MISCLASSIFIED REACH when a `types: true` module is no longer type-reachable", () => {
    // Drop the `import type { Shape }` from bin.ts: typed.ts stays value-dead but loses its type caller.
    mod(
      "bin.ts",
      ["import { createApp } from './live.js';", "export function boot() { return createApp(); }", "boot();", ""].join(
        "\n",
      ),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/MISCLASSIFIED REACH — packages\/app\/src\/typed\.ts/)
    expect(out).toMatch(/ledger says types: true, measured type-reachable: false/)
    expect(code).toBe(1)
  })

  it("catches an entry that OMITS the `banner:` field (undeclared legibility)", () => {
    ledger(
      CLEAN_LEDGER.replace(
        "'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },",
        "'packages/app/src/extra.ts': { values: 1, shipped: null },",
      ),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/UNDECLARED LEGIBILITY — packages\/app\/src\/extra\.ts/)
    expect(code).toBe(1)
  })

  it("catches a `banner: false` entry whose file actually HAS a banner header", () => {
    mod(
      "extra.ts",
      [
        "// ── REFERENCE MODEL ────────────────────────────────",
        "// reference-model-guard ledger; nothing calls this.",
        "export function spare() { return 2; }",
        "",
      ].join("\n"),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/BANNER UNDECLARED — packages\/app\/src\/extra\.ts/)
    expect(code).toBe(1)
  })

  it("catches an entry that OMITS the `shipped:` field (undeclared counterpart)", () => {
    ledger(
      CLEAN_LEDGER.replace(
        "'packages/app/src/extra.ts': { values: 1, shipped: null, banner: false },",
        "'packages/app/src/extra.ts': { values: 1, banner: false },",
      ),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/UNDECLARED COUNTERPART — packages\/app\/src\/extra\.ts/)
    expect(code).toBe(1)
  })

  it("catches a `shipped:` path that does not name an existing FILE (dangling counterpart)", () => {
    ledger(
      CLEAN_LEDGER.replace(
        "'packages/app/src/dead.ts': { values: 1, shipped: 'packages/app/src/live.ts', banner: true },",
        "'packages/app/src/dead.ts': { values: 1, shipped: 'packages/app/src/nowhere.ts', banner: true },",
      ),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/DANGLING COUNTERPART — packages\/app\/src\/dead\.ts/)
    expect(code).toBe(1)
  })
})
