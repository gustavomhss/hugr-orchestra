// harness/gates/layer-guard.test.mjs — the gate's OWN teeth.
//
// A gate nobody can falsify is decoration. This file plants, in a throwaway fixture tree, each defect the
// gate claims to catch — including the three that two cold reviews PROVED an earlier revision let through
// green — and asserts the gate exits non-zero and NAMES the violation. It also asserts the clean tree
// passes, so the gate cannot be made to fire on everything (a gate that always fails is also decoration).
//
// The fixture is a miniature Atlas: an ARCHITECTURE.md carrying the canonical `L<n>` rows (the gate DERIVES
// its ranking from that file — it does not transcribe one), a few package manifests + sources, and a
// composition root with a `legs` literal.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const GATE = fileURLToPath(new URL("./layer-guard.mjs", import.meta.url))

let root

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, LAYER_GUARD_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

function pkg(name, deps, sources = {}) {
  const dir = join(root, "packages", name)
  mkdirSync(join(dir, "src"), { recursive: true })
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      { name: `@atlas/${name}`, dependencies: Object.fromEntries(deps.map((d) => [`@atlas/${d}`, "*"])) },
      null,
      2,
    ),
  )
  for (const [file, body] of Object.entries(sources)) writeFileSync(join(dir, "src", file), body)
}

/** Build a clean miniature Atlas in a fresh temp root. Extracted from `beforeEach` so the ASYMMETRY test
 *  can plant the same edge twice — once via manifest, once via source — inside ONE `it`. */
function freshFixture() {
  root = mkdtempSync(join(tmpdir(), "layer-guard-"))
  // The canonical diagram the gate derives its ranking FROM.
  writeFileSync(
    join(root, "ARCHITECTURE.md"),
    [
      "                contracts   L0  vocabulary",
      "                kernel      L1  identity",
      "                knowledge   L4  lifecycle",
      "                tools       L7  governed surface",
      "",
    ].join("\n"),
  )
  pkg("contracts", [])
  pkg("kernel", ["contracts"], { "a.ts": "import type { X } from '@atlas/contracts';\nexport type Y = X;\n" })
  pkg("knowledge", ["kernel"])
  pkg("tools", ["knowledge"])
  mkdirSync(join(root, "packages", "tools", "dist", "src"), { recursive: true })
  writeFileSync(
    join(root, "packages", "tools", "dist", "src", "index.js"),
    "export const GOVERNANCE_SURFACE = ['atlas-init'];\nexport const WRITE_PATHS = [];\n",
  )
  pkg("adapter-io", ["tools"], {
    "wire.ts": [
      "export function assemble() {",
      "  const legs: ToolLegs = {",
      "    'atlas-init': () => ({}),",
      "  };",
      "  return legs;",
      "}",
      "",
    ].join("\n"),
  })
}

const dropFixture = () => rmSync(root, { recursive: true, force: true })

beforeEach(freshFixture)
afterEach(dropFixture)

describe("layer-guard — the gate can be falsified", () => {
  it("PASSES the clean fixture (it does not fire on everything)", () => {
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("catches a layer INVERSION declared only in a manifest", () => {
    pkg("knowledge", ["kernel", "tools"]) // L4 → L7
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-1 layer inversion: @atlas\/knowledge \(L4\) depends on @atlas\/tools \(L7\)/)
    expect(code).toBe(1)
  })

  it("catches an inversion introduced ONLY by a source import — the hole a cold review proved", () => {
    // No manifest edit. npm workspaces resolves this; a manifest-only graph is blind to it.
    pkg("tools", ["knowledge"], { "probe.ts": "import { x } from '@atlas/adapter-io';\nexport const y = x;\n" })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-2 forbidden edge: @atlas\/tools MUST NOT depend on @atlas\/adapter-io/)
    expect(code).toBe(1)
  })

  it("NAMES a dependency cycle by its path", () => {
    pkg("contracts", ["kernel"]) // contracts ↔ kernel
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-1 dependency CYCLE: .*@atlas\/contracts.*@atlas\/kernel/)
    expect(code).toBe(1)
  })

  it("refuses a package that is in NO layer (silent exemption is how memory/genesis went unchecked)", () => {
    pkg("brand-new", ["contracts"])
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-1 unranked package '@atlas\/brand-new'/)
    expect(code).toBe(1)
  })

  it("refuses a GHOST leg spread into the composition root — invisible to a key scan, invocable at runtime", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": [
        "const ghost = { 'atlas-backdoor': () => ({}) };",
        "export function assemble() {",
        "  const legs: ToolLegs = {",
        "    ...ghost,",
        "    'atlas-init': () => ({}),",
        "  };",
        "  return legs;",
        "}",
        "",
      ].join("\n"),
    })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3 the leg binding block contains a top-level SPREAD/)
    expect(code).toBe(1)
  })

  it("does NOT fire on a spread inside a NESTED object (the false alarm a first attempt produced)", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": [
        "export function assemble(cfg) {",
        "  const legs: ToolLegs = {",
        "    'atlas-init': () => ({ seams: { ...(cfg.extra ?? {}) } }),",
        "  };",
        "  return legs;",
        "}",
        "",
      ].join("\n"),
    })
    const { out } = runGate()
    expect(out).not.toContain("SPREAD")
  })

  it("reports a source import the manifest does not declare", () => {
    pkg("knowledge", [], { "u.ts": "import { k } from '@atlas/kernel';\nexport const v = k;\n" })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-1 undeclared edge: @atlas\/knowledge imports @atlas\/kernel/)
    expect(code).toBe(1)
  })

  it("does NOT treat a package NAMED in a comment as an import (the 68-false-positive trap)", () => {
    pkg("kernel", ["contracts"], {
      "c.ts": [
        "// This must never import @atlas/tools — that would invert the DAG.",
        "/* @atlas/adapter-io is the outer ring. */",
        "export const z = 1;",
        "",
      ].join("\n"),
    })
    const { out } = runGate()
    expect(out).not.toContain("✗")
  })
})

// ── LEXING: the stripper that deleted real code ──────────────────────────────────────────────────────
//
// The gate strips comments before scanning, for the good reason two tests above. It did so with a BLOCK
// replace chained onto a LINE replace, in that order. A line comment containing a glob — `packages/*/src`,
// which this repo's prose uses constantly — holds the byte pair slash-then-star; the block pass ran first,
// read it as a comment OPENER, and deleted everything down to the next real closer. Any import in between
// vanished, and the gate reported clean over code it never parsed.
//
// DIRECTION MATTERS: in this gate the class produces MISSED EDGES, i.e. a false PASS. Measured on master,
// 11 real `@atlas/*` import statements across 7 files were invisible to the shipped gate for this reason.
// The fix is the shared parser-backed `stripComments` from reachability.mjs — not a fourth hand-written
// stripper; that file's header records three rounds of exactly that mistake.
describe("layer-guard — comment stripping does not swallow code", () => {
  // TEETH: breaks-on "the naive two-regex strip returns". Restore
  // `.replace(BLOCK,'').replace(LINE,'')` in sourceImports and this goes green-on-a-hole (exit 0).
  // The trailing block comment is LOAD-BEARING: the block regex needs a closing `*/` somewhere later or it
  // matches nothing and the bug does not fire. That is exactly why the bug is real HERE — every file in
  // this comment-dense tree has a later block comment.
  it("sees a forbidden import sitting under a line comment that contains a glob", () => {
    pkg("tools", ["knowledge"], {
      "probe.ts": [
        "// Nothing in `packages/*/src` calls this — verified by probe.",
        "import { x } from '@atlas/adapter-io';",
        "export const y = x;",
        "/* closes the phantom block the naive stripper opened above. */",
        "",
      ].join("\n"),
    })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-2 forbidden edge: @atlas\/tools MUST NOT depend on @atlas\/adapter-io/)
    expect(code).toBe(1)
  })

  // The SECOND strip site: the leg-binding block at the composition root. Same defect, and here it hides a
  // GHOST LEG — bound, invocable over MCP, in no surface constant. The naive stripper deletes the
  // `'atlas-backdoor'` line along with the phantom block and the gate exits 0.
  // TEETH: breaks-on "the naive two-regex strip returns" (boundLegs).
  it("sees a bound leg sitting under a line comment that contains a glob", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": [
        "export function assemble() {",
        "  const legs: ToolLegs = {",
        "    'atlas-init': () => ({}),",
        "    // legs are discovered by walking packages/*/src at build time",
        "    'atlas-backdoor': () => ({}),",
        "    /* end of legs */",
        "  };",
        "  return legs;",
        "}",
        "",
      ].join("\n"),
    })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 leg 'atlas-backdoor' is bound at the composition root but is in NO surface constant/)
    expect(code).toBe(1)
  })

  // CONTROL — the fix must not have been "stop stripping". A glob and a package name in the SAME comment
  // is still prose, not an edge. Without this, deleting the stripper outright passes the two tests above.
  it("still ignores a package named in a comment that also contains a glob", () => {
    pkg("kernel", ["contracts"], {
      "c.ts": [
        "// Nothing in `packages/*/src` may import @atlas/tools or @atlas/adapter-io.",
        "/* @atlas/cli lives in the ring. */",
        "export const z = 1;",
        "",
      ].join("\n"),
    })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  // CONTROL — a package name inside a STRING or a template is code the gate reads, but it is not an import
  // POSITION, so it is still not an edge. Pins that the parser-backed stripper left literals alone.
  it("still ignores a package name inside a string literal", () => {
    pkg("kernel", ["contracts"], {
      "c.ts": [
        "export const HELP = 'run @atlas/adapter-io from the ring';\nexport const T = `see @atlas/tools`;\n",
      ].join("\n"),
    })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })
})

// ── THE SPECIFIER GRAMMAR: two shapes the source scan could not see ──────────────────────────────────
//
// PRE-EXISTING, not a regression. The source scan exists because "a source import needs no manifest edit
// to resolve" — so it must see AT LEAST what the manifest scan sees. It did not, and the gap ran the wrong
// way: `shortName` accepts any `@atlas/*` from a manifest, while the source regex captured
// `[a-z][a-z-]*` matched against the closing quote. Digits and subpaths were therefore invisible IN SOURCE
// ONLY — an edge was easier to hide in code than in a manifest, which inverts the whole point of the scan.
describe("layer-guard — the source scan sees every specifier shape the manifest scan sees", () => {
  // TEETH: breaks-on "the specifier is matched whole instead of split after the scope". Remove the
  // `(?:\/[^'"]*)?` tail and this returns exit 0 / 0 violations.
  it("catches a forbidden import written as a DEEP SUBPATH", () => {
    pkg("tools", ["knowledge"], {
      "probe.ts": "import type { W } from '@atlas/adapter-io/dist/src/index.js';\nexport type Z = W;\n",
    })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-2 forbidden edge: @atlas\/tools MUST NOT depend on @atlas\/adapter-io/)
    expect(code).toBe(1)
  })

  // TEETH: breaks-on "the character class drops 0-9". Revert `[a-z][a-z0-9-]*` to `[a-z][a-z-]*` and this
  // returns exit 0 / 0 violations. `e2e` is not hypothetical: it and `e2e-blackbox` are ranked members of
  // RING_ORDER, so a digit in a package name is this repo's normal state, not an edge case.
  it("catches a forbidden import from a package with a DIGIT in its name", () => {
    pkg("e2e", ["tools"])
    pkg("tools", ["knowledge"], { "probe.ts": "import type { W } from '@atlas/e2e';\nexport type Z = W;\n" })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-1 layer inversion: @atlas\/tools \(L7\) depends on @atlas\/e2e/)
    expect(code).toBe(1)
  })

  // THE ASYMMETRY, asserted directly rather than as a variant of the test above — this is the shape that
  // let the bug live, so it gets its own test. The SAME `tools → e2e` edge is planted twice: once in a
  // MANIFEST, once as a SOURCE IMPORT. On master the manifest form failed with 2 violations and the source
  // form exited 0. A gate whose source scan is weaker than its manifest scan is not a stricter check on
  // code; it is an instruction on where to put the edge you do not want seen.
  it("catches the SAME edge whether it arrives via manifest or via source import", () => {
    pkg("e2e", ["tools"])
    pkg("tools", ["knowledge", "e2e"]) // manifest-declared
    const viaManifest = runGate()

    dropFixture()
    freshFixture()
    pkg("e2e", ["tools"])
    pkg("tools", ["knowledge"], { "probe.ts": "import type { W } from '@atlas/e2e';\nexport type Z = W;\n" }) // source only
    const viaSource = runGate()

    const INVERSION = /ARCH-1 layer inversion: @atlas\/tools \(L7\) depends on @atlas\/e2e \(L11\)/
    expect(viaManifest.out).toMatch(INVERSION)
    expect(viaSource.out).toMatch(INVERSION)
    expect(viaManifest.code).toBe(1)
    expect(viaSource.code).toBe(1)
  })

  // CONTROL — subpath support must not make every deep import a violation. A LEGAL deep import (inner
  // layer, correct direction) still passes. Without this, "split on the slash" could have been achieved by
  // firing on anything containing one.
  it("does NOT fire on a LEGAL deep-subpath import", () => {
    pkg("kernel", ["contracts"], {
      "a.ts": "import type { X } from '@atlas/contracts/dist/src/index.js';\nexport type Y = X;\n",
    })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  // CONTROL — a non-`@atlas` scope with a subpath is not a workspace edge at all.
  it("does NOT invent an edge from a third-party subpath import", () => {
    pkg("kernel", ["contracts"], { "a.ts": "import { pipe } from 'lodash/fp/pipe.js';\nexport const p = pipe;\n" })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })
})

// ── THE COMPOSITION ROOT: two more ways a GHOST LEG stayed invisible ─────────────────────────────────
//
// A ghost leg is the sharpest failure this gate has, because `legs[tool]` dispatches with NO membership
// test: a leg bound at the composition root and named in no surface constant is invocable over MCP and
// pinned by nothing. The plain case has been caught for a while. Two shapes were not, and both are false
// PASSES — the same class as the import-scan holes above, one function further down.
describe("layer-guard — the leg scan cannot be blinded by prose or by a digit", () => {
  /** The clean fixture's wire.ts, with the leg lines swapped in. */
  const wire = (...legLines) =>
    ["export function assemble() {", "  const legs: ToolLegs = {", ...legLines, "  };", "  return legs;", "}", ""].join(
      "\n",
    )

  // CONTROL, stated first because the two tests after it are only meaningful against it: the plain ghost
  // leg IS caught. Without this, "the gate now fires" proves nothing about what made it fire.
  it("CONTROL — a plain ghost leg is caught", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-backdoor': () => ({}),"),
    })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 leg 'atlas-backdoor' is bound at the composition root but is in NO surface constant/)
    expect(code).toBe(1)
  })

  // TEETH: breaks-on "the binding site is located and brace-matched over RAW source". The literal used to
  // be found and brace-counted BEFORE anything was stripped — the strip ran on the resulting slice, so the
  // comment above it claimed an ordering the code did not have. A lone `}` in prose drove the counter to
  // zero early, `end` landed on the comment, and every leg below it fell outside the block. Exit 0.
  it("a stray `}` in a COMMENT cannot truncate the block and hide the leg below it", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire(
        "    'atlas-init': () => ({}),",
        "    // the handler dispatches on legs[tool] } and never checks membership",
        "    'atlas-backdoor': () => ({}),",
      ),
    })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 leg 'atlas-backdoor' is bound at the composition root but is in NO surface constant/)
    expect(code).toBe(1)
  })

  // TEETH: breaks-on "the leg-key character class drops 0-9". Identical shape to the specifier-grammar hole
  // one function away, identical direction: the key matched nothing, the leg was absent from the returned
  // set, and ARCH-3/5's bound-but-undeclared check had nothing to complain about.
  it("a DIGIT in a leg name does not make the leg invisible", () => {
    pkg("adapter-io", ["tools"], { "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-v2': () => ({}),") })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 leg 'atlas-v2' is bound at the composition root but is in NO surface constant/)
    expect(code).toBe(1)
  })

  // CONTROL — the real wire.ts shape, and the reason master got the right answer by luck rather than by
  // construction. Measured on master: the raw and stripped depth counters DIVERGED three times inside the
  // legs literal, first at wire.ts:186 (`{ pack, subsumes }` in prose), and re-converged every time only
  // because the prose braces happened to be BALANCED. Balanced braces must keep locating the same block.
  it("does NOT fire on BALANCED braces in prose inside the literal (the real wire.ts shape)", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire(
        "    // the query leg returns the `{ pack, subsumes }` observability envelope",
        "    'atlas-init': () => ({}),",
      ),
    })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  // CONTROL — and the second thing stripping first buys. A commented-out binding site used to win the
  // `indexOf` race: the gate located the DEAD literal, found no keys in it, and reported the real
  // `atlas-init` as typed-but-unbound. A false FAIL rather than a false PASS, but the same blindness.
  it("is not fooled by a COMMENTED-OUT binding site earlier in the file", () => {
    pkg("adapter-io", ["tools"], {
      "wire.ts": [
        "// Kept for the reader — this is what the binding used to look like:",
        "//   const legs: ToolLegs = {",
        "//     'atlas-ghost': () => ({}),",
        "//   };",
        wire("    'atlas-init': () => ({}),"),
      ].join("\n"),
    })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })
})

// [WP-10.A5.TOOLS] The three-way READ_SURFACE binding kinds `boundReadDoor` checks — a compose-planner
// field, a CLI command→leg projection onto a bound `atlas-query` leg, or a direct `wire.ts` leg — plus the
// negative case: a member bound by NONE of the three still reds, honestly.
describe("layer-guard — READ_SURFACE binds by THREE kinds (compose-planner / query-projection / direct leg)", () => {
  const wire = (...legLines) =>
    ["export function assemble() {", "  const legs: ToolLegs = {", ...legLines, "  };", "  return legs;", "}", ""].join(
      "\n",
    )
  const compose = (...fieldLines) =>
    [
      "export function composeRuntime(repoPath) {",
      "  return {",
      "    handler: assembleHandler(config),",
      ...fieldLines,
      "  };",
      "}",
      "",
    ].join("\n")
  const cliMap = (...entryLines) => ["export const COMMAND_LEG = {", ...entryLines, "};", ""].join("\n")
  const readSurface = (members) =>
    writeFileSync(
      join(root, "packages", "tools", "dist", "src", "index.js"),
      `export const GOVERNANCE_SURFACE = ['atlas-init', 'atlas-query'];\nexport const WRITE_PATHS = [];\nexport const READ_SURFACE = ${JSON.stringify(members)};\n`,
    )

  it("kind (a) — a compose-planner field (compose.ts) satisfies its READ_SURFACE member", () => {
    readSurface(["atlas-anchors"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-query': () => ({}),"),
      "compose.ts": compose("    anchors: anchorsLeg.anchors,"),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap() })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("kind (b) — a query-projection (CLI COMMAND_LEG onto a bound atlas-query leg) satisfies its member", () => {
    readSurface(["atlas-doctor"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-query': () => ({}),"),
      "compose.ts": compose(),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap("  doctor: 'atlas-query',") })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("kind (b) accepts a double-quoted COMMAND_LEG value", () => {
    readSurface(["atlas-doctor"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-query': () => ({}),"),
      "compose.ts": compose(),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap('  doctor: "atlas-query",') })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("kind (b), negative — a COMMAND_LEG entry onto an UNBOUND Tool does NOT satisfy the member", () => {
    readSurface(["atlas-doctor"])
    pkg("adapter-io", ["tools"], {
      // 'atlas-query' is declared in GOVERNANCE_SURFACE (fixture surface) but NOT bound in wire.ts legs here.
      "wire.ts": wire("    'atlas-init': () => ({}),"),
      "compose.ts": compose(),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap("  doctor: 'atlas-query',") })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 'atlas-doctor' is declared in READ_SURFACE but has NO binding/)
    expect(code).toBe(1)
  })

  // [FIX 1, cold-review gate-integrity] SECURITY-CRITICAL attack: a READ_SURFACE member whose COMMAND_LEG
  // projects it onto a BOUND WRITE leg (`atlas-emit`), not `atlas-query`. Before the fix, `boundReadDoor`
  // only checked "the mapped leg is SOME bound leg" — this fixture passed GREEN, meaning a door advertised
  // as read-only (kind (b), "projects onto atlas-query") could secretly route to the governed write door.
  it("kind (b) ATTACK — a COMMAND_LEG entry onto a bound WRITE leg (atlas-emit) must still RED", () => {
    readSurface(["atlas-shadow"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire(
        "    'atlas-init': () => ({}),",
        "    'atlas-query': () => ({}),",
        "    'atlas-emit': () => ({}),",
      ),
      "compose.ts": compose(),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap("  shadow: 'atlas-emit',") })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 'atlas-shadow' is declared in READ_SURFACE but has NO binding/)
    expect(code).toBe(1)
  })

  // [FIX 2, cold-review gate-integrity] A READ_SURFACE member matching only a NESTED key inside the
  // composeRuntime return literal (`real: { phantom: 1 }`) — never an actual top-level returned field —
  // must still RED. Before the fix, the depth-BLIND key regex matched `phantom:` at any nesting depth.
  it("kind (a) ATTACK — a READ_SURFACE member matching only a NESTED key must still RED", () => {
    readSurface(["atlas-phantom"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-query': () => ({}),"),
      "compose.ts": compose("    real: {", "      phantom: 1,", "    },"),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap() })
    const { code, out } = runGate()
    expect(out).toMatch(/ARCH-3\/5 'atlas-phantom' is declared in READ_SURFACE but has NO binding/)
    expect(code).toBe(1)
  })

  it("kind (c) — a direct wire.ts leg satisfies its READ_SURFACE member (unchanged pre-existing path)", () => {
    // 'atlas-widget' is bound directly in wire.ts's legs, like a Tool would be, but is NOT a GOVERNANCE_SURFACE
    // member (disjointness would fire otherwise) — a future READ_SURFACE door bound the SAME way as a Tool.
    readSurface(["atlas-widget"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire(
        "    'atlas-init': () => ({}),",
        "    'atlas-query': () => ({}),",
        "    'atlas-widget': () => ({}),",
      ),
      "compose.ts": compose(),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap() })
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("NEGATIVE — a member bound by NONE of the three kinds still reds (the property has teeth)", () => {
    readSurface(["atlas-nonexistent"])
    pkg("adapter-io", ["tools"], {
      "wire.ts": wire("    'atlas-init': () => ({}),", "    'atlas-query': () => ({}),"),
      "compose.ts": compose("    anchors: anchorsLeg.anchors,"),
    })
    pkg("cli", ["tools"], { "map.ts": cliMap("  doctor: 'atlas-query',") })
    const { code, out } = runGate()
    expect(out).toMatch(
      /ARCH-3\/5 'atlas-nonexistent' is declared in READ_SURFACE but has NO binding — checked all three kinds/,
    )
    expect(code).toBe(1)
  })

  it('an EMPTY READ_SURFACE (module absent/vacuous) never triggers a compose.ts/map.ts "missing" note', () => {
    // No `compose.ts`/`cli` package at all in this fixture — mirrors every OTHER describe block in this
    // file, which predate READ_SURFACE and never carry one. `read.length === 0` must short-circuit BEFORE
    // `boundComposeFields`/`commandLegMap` ever try to read a file that legitimately does not exist here.
    pkg("adapter-io", ["tools"], { "wire.ts": wire("    'atlas-init': () => ({}),") })
    const { code, out } = runGate()
    expect(out).not.toMatch(/compose root missing|CLI command map missing/)
    expect(code).toBe(0)
  })
})
