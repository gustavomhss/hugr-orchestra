// harness/gates/wiring-guard.test.mjs — the gate's OWN teeth.
//
// Every defect class the gate claims to catch is PLANTED in a throwaway workspace and the gate must exit
// non-zero AND NAME the package. The clean tree must PASS, so the gate cannot be satisfied by firing on
// everything.
//
// The two cases that matter most are the ones that would read as success while checking nothing: an EMPTY
// ledger region, and a `packages/` tree the gate failed to read. Both are planted explicitly — comparing
// two empty sets is the exact shape of a gate that has quietly stopped working.
//
// The type-only case is the one this gate exists for: `packages/memory` scored alive under any reading that
// counts an `import type`, and that single mis-scoring is what let a dead package sit under the README's
// "What it guarantees" heading. It is planted here in both polarities.
//
// The fixture is a miniature workspace: `packages/<name>/src/*.ts` plus a README carrying the ledger.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const GATE = fileURLToPath(new URL("./wiring-guard.mjs", import.meta.url))

let root

function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, WIRING_GUARD_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

/** Write `packages/<name>/src/index.ts` with the given body. */
function pkg(name, body = "") {
  const d = join(root, "packages", name, "src")
  mkdirSync(d, { recursive: true })
  writeFileSync(join(d, "index.ts"), body)
}

/** Write the README ledger naming exactly `names`. */
function ledger(names, { begin = true, end = true } = {}) {
  writeFileSync(
    join(root, "README.md"),
    [
      "# Fixture",
      "",
      "Prose naming `memory` OUTSIDE the region, which must not count as a row.",
      "",
      begin ? "<!-- unreached:begin -->" : "",
      "",
      "| package | why nothing imports it |",
      "| --- | --- |",
      ...names.map((n) => `| \`${n}\` | a reason |`),
      "",
      end ? "<!-- unreached:end -->" : "",
      "",
    ].join("\n"),
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "wiring-guard-"))
  // `app` imports `core` at runtime; `dead` is imported by nobody; `app` itself is an entry point.
  pkg("app", "import { thing } from '@atlas/core';\nexport const x = thing;\n")
  pkg("core", "export const thing = 1;\n")
  pkg("dead", "export const unused = 2;\n")
  ledger(["app", "dead"])
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("wiring-guard — the gate can be falsified", () => {
  it("PASSES when the ledger names exactly the packages nothing imports", () => {
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(out).toMatch(/3 package\(s\); 2 with no runtime importer \(app, dead\)/)
    expect(code).toBe(0)
  })

  it("FAILS an unreached package the ledger omits, and NAMES it", () => {
    ledger(["app"]) // `dead` is still dead; the ledger stopped saying so
    const { code, out } = runGate()
    expect(out).toMatch(/UNREACHED AND UNDECLARED — `dead`/)
    expect(out).not.toMatch(/UNREACHED AND UNDECLARED — `app`/) // and only that one
    expect(code).toBe(1)
  })

  it("FAILS a ledger row for a package that IS imported, and names its importers", () => {
    ledger(["app", "dead", "core"])
    const { code, out } = runGate()
    expect(out).toMatch(/DECLARED BUT REACHED — `core`/)
    expect(out).toMatch(/imported at runtime by: app/)
    expect(code).toBe(1)
  })

  it("an `import type` is NOT a runtime reference — the target stays unreached (the memory case)", () => {
    // `core` stays runtime-imported so this test moves ONE variable: how `dead` is referenced.
    pkg(
      "app",
      "import { thing } from '@atlas/core';\nimport type { T } from '@atlas/dead';\nexport const x = thing;\nexport type U = T;\n",
    )
    const { code, out } = runGate()
    expect(out).toMatch(/2 with no runtime importer \(app, dead\)/) // `dead` is still dead
    expect(code).toBe(0)
  })

  it("a VALUE import of the same package DOES reach it (the check is not blind in both directions)", () => {
    pkg(
      "app",
      "import { thing } from '@atlas/core';\nimport { unused } from '@atlas/dead';\nexport const y = thing + unused;\n",
    )
    const { code, out } = runGate()
    expect(out).toMatch(/DECLARED BUT REACHED — `dead`/)
    expect(code).toBe(1)
  })

  it("an `export type … from` is erased too, and does not reach its target", () => {
    pkg("app", "import { thing } from '@atlas/core';\nexport const x = thing;\nexport type * from '@atlas/dead';\n")
    const { code } = runGate()
    expect(code).toBe(0)
  })

  it("a package named only in a COMMENT is not reached (it is a parse, not a regex)", () => {
    pkg("app", "import { thing } from '@atlas/core';\n// see @atlas/dead for the slab model\nexport const z = thing;\n")
    const { code, out } = runGate()
    expect(out).toMatch(/2 with no runtime importer \(app, dead\)/)
    expect(code).toBe(0)
  })

  it("counts ONLY the delimited region — a package named in surrounding prose is not a row", () => {
    const { code, out } = runGate() // the fixture prose names `memory` outside the markers
    expect(out).not.toMatch(/memory/)
    expect(code).toBe(0)
  })

  it("ANTI-VACUITY: an EMPTY region FAILS rather than agreeing with a fully wired tree", () => {
    ledger([])
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/extracted ZERO rows/)
    expect(out).not.toMatch(/wiring-guard: OK/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a MISSING begin marker FAILS", () => {
    ledger(["app", "dead"], { begin: false })
    const { code, out } = runGate()
    expect(out).toMatch(/missing the <!-- unreached:begin --> marker/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a MISSING end marker FAILS", () => {
    ledger(["app", "dead"], { end: false })
    const { code, out } = runGate()
    expect(out).toMatch(/missing the <!-- unreached:end --> marker/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: NO packages/ directory FAILS instead of comparing two empty sets", () => {
    rmSync(join(root, "packages"), { recursive: true, force: true })
    const { code, out } = runGate()
    expect(out).toMatch(/EXTRACTION BROKEN/)
    expect(out).toMatch(/does not exist/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: packages with no src/ FAILS rather than reporting an empty graph", () => {
    rmSync(join(root, "packages"), { recursive: true, force: true })
    mkdirSync(join(root, "packages", "app"), { recursive: true })
    const { code, out } = runGate()
    expect(out).toMatch(/no package under packages\/ has a src\/ directory/)
    expect(code).toBe(1)
  })

  it("ANTI-VACUITY: a MISSING README FAILS", () => {
    rmSync(join(root, "README.md"), { force: true })
    const { code, out } = runGate()
    expect(out).toMatch(/README\.md does not exist/)
    expect(code).toBe(1)
  })

  it("FAILS a DUPLICATED ledger row", () => {
    ledger(["app", "dead", "dead"])
    const { code, out } = runGate()
    expect(out).toMatch(/lists `dead` TWICE/)
    expect(code).toBe(1)
  })
})
