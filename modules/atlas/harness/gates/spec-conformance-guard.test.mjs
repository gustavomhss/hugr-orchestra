// harness/gates/spec-conformance-guard.test.mjs — the gate's OWN teeth.
//
// A gate nobody can falsify is decoration. This file plants, in a throwaway fixture repo, a defect for each
// of the guard's five checks and asserts the gate exits non-zero AND NAMES the violation. The clean tree
// must PASS, so the gate cannot be satisfied by firing on everything.
//
// The guard's only seam is the one added for these teeth:
//   SPEC_CONFORMANCE_GUARD_ROOT — the repo root the guard reads (dist surface + docs). Unset, it defaults
//   to the real repo (byte-identical), asserted by `npm run build && npm run spec-conformance-guard`.
//
// The fixture is a miniature Atlas providing exactly what the five checks read: a built `dist` surface, a
// `docs/requirements/` corpus with whole-file + per-block digest pins, and a fan-out family. Never the real
// docs tree.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { createHash } from "node:crypto"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const GATE = fileURLToPath(new URL("./spec-conformance-guard.mjs", import.meta.url))

let root

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate() {
  try {
    const out = execFileSync(process.execPath, [GATE], {
      env: { ...process.env, SPEC_CONFORMANCE_GUARD_ROOT: root },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

/** Write a file under the fixture root, creating parents. */
function w(rel, body) {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}

/** check (1): the built governance surface. Defaults to the canonical arrays; pass overrides to mutate.
 *  [WP-10.A5.TOOLS] `readSurface` joins `governance`/`writePaths` — the CODE-SURFACE PIN now also checks
 *  `READ_SURFACE` (10 members, ADR-0005 + WP-11.W8) + its two disjointness properties. `governance`/
 *  `writePaths` default to SIX/THREE (WP-11.W8's `atlas-memory-emit`, ADR-0006 Decision 2: derived+budgeted). */
function surface(
  governance = ["atlas-init", "atlas-query", "atlas-emit", "atlas-reconcile", "atlas-link", "atlas-memory-emit"],
  writePaths = ["atlas-emit", "atlas-link", "atlas-memory-emit"],
  readSurface = [
    "atlas-anchors",
    "atlas-slots",
    "atlas-draft",
    "atlas-check",
    "atlas-doctor",
    "atlas-node",
    "atlas-memory-recall",
    "atlas-memory-header",
    "atlas-memory-awareness",
    "atlas-memory-orientation",
  ],
) {
  w(
    "packages/tools/dist/src/index.js",
    `export const GOVERNANCE_SURFACE = ${JSON.stringify(governance)};\nexport const WRITE_PATHS = ${JSON.stringify(writePaths)};\nexport const READ_SURFACE = ${JSON.stringify(readSurface)};\n`,
  )
}

/** check (3): a whole-file-pinned module — properties-<m>.md carries the 8-hex digest of method-tags-<m>.md. */
function digestModule(m, { pin } = {}) {
  const mt = `# method tags ${m}\n\nFrozen source for ${m}. No governance-count prose here.\n`
  w(`docs/requirements/method-tags-${m}.md`, mt)
  const d8 = pin ?? createHash("sha256").update(Buffer.from(mt)).digest("hex").slice(0, 8)
  w(`docs/requirements/properties-${m}.md`, `# properties ${m}\n\nPinned: method-tags-${m}.md @sha256:${d8}\n`)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "spec-conformance-guard-"))
  surface()
  for (const m of ["tls", "mem", "authoring"]) digestModule(m)
  // check (3b) idx: two INV blocks so INV-INDEX-1 is NON-terminal (gated); no pins → clean passes.
  w(
    "docs/requirements/method-tags-idx.md",
    [
      "# idx method tags",
      "",
      "### INV-INDEX-1",
      "body one",
      "body one b",
      "",
      "### INV-INDEX-2",
      "terminal body",
      "",
    ].join("\n"),
  )
  w("docs/requirements/properties-idx.md", "# properties idx\n\nNo pins in the clean fixture.\n")
  // check (4) fan-out: the DEMO-1 family restated in two module docs + the register, none amended → clean.
  w("docs/requirements/req-foo.md", ["# req foo", "", "### REQ-DEMO-1", "The demo requirement clause.", ""].join("\n"))
  w("docs/requirements/goldens-foo.md", ["# goldens foo", "", "### SCN-DEMO-1-1", "A demo scenario.", ""].join("\n"))
  w(
    "docs/requirements/invariant-register.md",
    ["# register", "", "| DEMO-1 demo invariant | req-foo.md |", ""].join("\n"),
  )
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("spec-conformance-guard — the gate can be falsified", () => {
  it("PASSES the clean fixture (it does not fire on everything)", () => {
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(out).toMatch(/spec-conformance-guard: OK/)
    expect(code).toBe(0)
  })

  // (1) CODE-SURFACE mismatch.
  it("catches a mutated GOVERNANCE_SURFACE and NAMES the check", () => {
    surface(["atlas-init", "atlas-query", "atlas-emit", "atlas-reconcile", "atlas-link", "atlas-backdoor"])
    const { code, out } = runGate()
    expect(out).toMatch(/CODE-SURFACE: GOVERNANCE_SURFACE = \[.*atlas-backdoor.*\] ≠ canonical/)
    expect(code).toBe(1)
  })

  it("catches a mutated WRITE_PATHS", () => {
    surface(undefined, ["atlas-emit", "atlas-link", "atlas-init"])
    const { code, out } = runGate()
    expect(out).toMatch(/CODE-SURFACE: WRITE_PATHS = \[.*atlas-init.*\] ≠ canonical/)
    expect(code).toBe(1)
  })

  // [WP-10.A5.TOOLS] catches a mutated READ_SURFACE — cardinality, and a member that overlaps a governed set.
  it("catches a mutated READ_SURFACE (cardinality drift)", () => {
    surface(undefined, undefined, ["atlas-anchors", "atlas-slots", "atlas-draft", "atlas-check", "atlas-doctor"])
    const { code, out } = runGate()
    expect(out).toMatch(/CODE-SURFACE: READ_SURFACE = \[.*\] ≠ canonical/)
    expect(code).toBe(1)
  })

  it("catches a READ_SURFACE member that overlaps GOVERNANCE_SURFACE/WRITE_PATHS (ENTRY-MCP-3 disjointness)", () => {
    surface(undefined, undefined, [
      "atlas-anchors",
      "atlas-slots",
      "atlas-draft",
      "atlas-check",
      "atlas-doctor",
      "atlas-node",
      "atlas-emit",
    ])
    const { code, out } = runGate()
    expect(out).toMatch(/CODE-SURFACE: READ_SURFACE ∩ GOVERNANCE_SURFACE ≠ ∅ — shared member\(s\) \[atlas-emit\]/)
    expect(out).toMatch(/CODE-SURFACE: READ_SURFACE ∩ WRITE_PATHS ≠ ∅ — shared member\(s\) \[atlas-emit\]/)
    expect(code).toBe(1)
  })

  // (4) AMENDMENT-FAN-OUT: one restatement amended, the others silent.
  it("catches an amendment that does not fan out to every restatement, and NAMES the family", () => {
    w(
      "docs/requirements/req-foo.md",
      ["# req foo", "", "### REQ-DEMO-1 AMENDED 2026-08-24", "The demo requirement clause, reworded.", ""].join("\n"),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/AMENDMENT-FAN-OUT: DEMO-1 is AMENDED in \[req-foo\.md\]/)
    expect(out).toMatch(/goldens-foo\.md/)
    expect(out).toMatch(/invariant-register\.md/)
    expect(code).toBe(1)
  })

  // (3) DIGEST TRIPWIRE (whole-file): a properties pin that no longer equals the method-tags digest.
  it("catches a STALE whole-file @sha256 pin, and NAMES the module", () => {
    digestModule("tls", { pin: "deadbeef" }) // 8-hex, but not the real digest
    const { code, out } = runGate()
    expect(out).toMatch(/DIGEST: properties-tls\.md pins \[deadbeef\] ≠ current method-tags-tls\.md digest/)
    expect(code).toBe(1)
  })

  it("catches a whole-file module that carries NO @sha256 pin at all", () => {
    w("docs/requirements/method-tags-mem.md", "# method tags mem\n\nFrozen.\n")
    w("docs/requirements/properties-mem.md", "# properties mem\n\nNo pin here.\n")
    const { code, out } = runGate()
    expect(out).toMatch(/DIGEST: no 8-hex @sha256 pins found in properties-mem\.md/)
    expect(code).toBe(1)
  })

  // (3b) IDX per-block tripwire: a NON-terminal INV block pin that disagrees with its block digest.
  it("catches a STALE per-INV-block idx pin, and NAMES the block", () => {
    w(
      "docs/requirements/properties-idx.md",
      "# properties idx\n\nmethod-tags-idx.md#INV-INDEX-1 @sha256:deadbeefcafe\n",
    )
    const { code, out } = runGate()
    expect(out).toMatch(/DIGEST\(idx\): INV-INDEX-1 block digest [0-9a-f]{12} ≠ pin deadbeefcafe/)
    expect(code).toBe(1)
  })

  // (2) DOC ANTI-DRIFT: a reintroduced pre-amendment governance-count claim.
  it("catches a stale governance-count claim in a doc, and NAMES the file:line", () => {
    w(
      "docs/explanation/overview.md",
      ["# overview", "", "Atlas ships the four governed tools, no more.", ""].join("\n"),
    )
    const { code, out } = runGate()
    expect(out).toMatch(/DOC-DRIFT: docs\/explanation\/overview\.md:3 — stale governance-count claim/)
    expect(code).toBe(1)
  })
})
