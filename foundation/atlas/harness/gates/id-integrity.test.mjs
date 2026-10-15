// harness/gates/id-integrity.test.mjs — the gate's OWN teeth.
//
// This repo has already been burned by the alternative: a gate was written, called "mutation-tested", and
// shipped with the mutation testing living only in someone's shell history — and a later cold review found
// the regex had been silently weakened in the meantime. So every defect class id-integrity claims to catch is
// PLANTED here in a throwaway fixture corpus, and the gate must exit 1 AND name the violation.
//
// It also plants the false alarms. A gate that fires on prose, on a fenced code sample, on a goldens grouping
// header, or on a deliberately held-out fixture is worse than no gate: it trains its readers to ignore it.
//
// The fixture is a miniature Atlas corpus — one block (BLK) with a requirements file, a goldens file, a
// method-tags file, a properties file, a WP card that consumes them, and a reference page carrying `<a id=>`
// anchors — plus a `docs/method/` template that restates a real id, to prove the METHOD is out of scope.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join, dirname } from "node:path"
import { tmpdir } from "node:os"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const GATE = fileURLToPath(new URL("./id-integrity.mjs", import.meta.url))

let root

/** Run the gate against the fixture. Returns `{ code, out }` — never throws on a non-zero exit. */
function runGate(known) {
  const env = { ...process.env, ID_INTEGRITY_ROOT: root }
  if (known !== undefined) env.ID_INTEGRITY_KNOWN = JSON.stringify(known)
  try {
    const out = execFileSync(process.execPath, [GATE], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
  }
}

/** Write a doc at `docs/<rel>`, creating parents. */
function doc(rel, lines) {
  const p = join(root, "docs", rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, `${lines.join("\n")}\n`)
}
/** Append to an existing doc — how most defects are planted. */
function append(rel, lines) {
  const p = join(root, "docs", rel)
  writeFileSync(p, `${readFileSync(p, "utf8")}${lines.join("\n")}\n`)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "id-integrity-"))

  // The reference page the WP's interface_contract points into — the only carrier of explicit anchors.
  doc("reference/atlas-blk.md", [
    "# Block BLK — reference",
    "",
    '<a id="author-1"></a>',
    "### 1. The first contract",
    "Prose.",
    "",
    '<a id="author-2"></a>',
    "### 2. The second contract",
    "Prose.",
  ])

  // S1 — the REQ definitions (the owner family for REQ).
  doc("requirements/req-blk.md", [
    "# Requirements — Block BLK",
    "",
    "### REQ-BLK-1a — the first requirement",
    "source: INV-BLK-1 @ reference/atlas-blk.md#blk-1",
    "The system shall do the first thing.",
    "",
    "### REQ-BLK-1b — the second requirement",
    "source: INV-BLK-1 @ reference/atlas-blk.md#blk-1",
    "The system shall do the second thing.",
  ])

  // S3 — the goldens. NOTE the `### REQ-BLK-1a` GROUPING header: the real corpus restates REQ headings over
  // the scenarios that witness them 549 times. It is a reference, never a second definition.
  doc("requirements/goldens-blk.md", [
    "# Goldens — Block BLK",
    "",
    "## REQ-BLK-1 — the first requirement",
    "",
    "### REQ-BLK-1a — the first requirement   (happy)",
    "",
    "### SCN-BLK-1a-1 — the witness   (happy)",
    "source: REQ-BLK-1a",
    "",
    "### SCN-BLK-1a-2 — the independent second fixture   (happy · held-out)",
    "source: REQ-BLK-1a",
    "",
    "### SCN-BLK-1b-1 — the other witness   (guard)",
    "source: REQ-BLK-1b",
  ])

  doc("requirements/method-tags-blk.md", [
    "# Method tags — Block BLK",
    "",
    "### INV-BLK-1",
    "method-tag: reference-model",
  ])
  doc("requirements/properties-blk.md", [
    "# Properties — Block BLK",
    "",
    "### PROP-BLK-1 — the law",
    "inv:         INV-BLK-1",
    "source:      method-tags-blk.md#INV-BLK-1",
    "covers_reqs: [ req-blk.md#REQ-BLK-1a, req-blk.md#REQ-BLK-1b ]   # ptr+digest",
  ])

  // S4 — the WP card that CONSUMES every REQ and every non-held-out SCN, so the clean tree has no orphans.
  doc("requirements/work-packages/wp-campaign-1.md", [
    "# Work Packages — CAMPAIGN-1",
    "",
    "### WP-1.A.BLK — BLK slice of EPIC-A",
    "id: WP-1.A.BLK",
    "source_reqs:                                   # ptr+digest",
    "  - source: ../req-blk.md#REQ-BLK-1a           # ptr+digest",
    "  - source: ../req-blk.md#REQ-BLK-1b           # ptr+digest",
    "interface_contract:",
    "  - source: ../../reference/atlas-blk.md#author-1",
    "acceptance:",
    "  - source: ../goldens-blk.md#SCN-BLK-1a-1",
    "  - source: ../goldens-blk.md#SCN-BLK-1b-1",
    "context_refs: [ ../method-tags-blk.md#INV-BLK-1, ../properties-blk.md#PROP-BLK-1 ]",
  ])

  // The METHOD — deliberately restates a real id as a worked example and carries a placeholder. Scanning it
  // would manufacture a duplicate definition and a dangling pointer; the gate excludes docs/method/**.
  doc("method/prompts/S1.md", [
    "# S1 — requirements",
    "",
    "### REQ-<MODULE>-<n> — <title>",
    "",
    "### REQ-BLK-1a — the first requirement",
    "A worked example, copied verbatim from the real corpus.",
    "",
    "See [the template](../wp-template.md) — a link that does not resolve, in the METHOD.",
  ])
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("id-integrity — the clean corpus passes", () => {
  it("PASSES the clean fixture (the gate does not fire on everything)", () => {
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("reports the sets it derived, and never a transcribed count", () => {
    const { out } = runGate()
    expect(out).toMatch(/2 REQ, 3 SCN, 1 INV, 1 PROP, 1 WP/)
    expect(out).toMatch(/2\/2 REQ and 2\/2 non-held-out SCN consumed by a WP/)
  })
})

describe("id-integrity — every claimed defect class is falsifiable", () => {
  it("ID-1 catches a DUPLICATE definition inside the owner family", () => {
    doc("requirements/requirements-blk.md", [
      "# Requirements — BLK, again",
      "",
      "### REQ-BLK-1a — a second, conflicting definition",
    ])
    const { code, out } = runGate()
    expect(out).toMatch(/ID-1 duplicate definition: 'REQ-BLK-1a' is defined 2×/)
    expect(code).toBe(1)
  })

  it("ID-2 catches a DANGLING id citation — the renumbering check", () => {
    // The WP and the properties file still point at REQ-BLK-1b; S1 renumbers it to REQ-BLK-1c. BOTH stranded
    // pointers must be named: one renumbering strands many citers, and reporting only the first hides the rest.
    const p = join(root, "docs", "requirements", "req-blk.md")
    writeFileSync(p, readFileSync(p, "utf8").replace("### REQ-BLK-1b", "### REQ-BLK-1c"))
    const { code, out } = runGate()
    expect(out).toMatch(
      /ID-2 dangling id citation: requirements\/work-packages\/wp-campaign-1\.md cites 'requirements\/req-blk\.md#REQ-BLK-1b'/,
    )
    expect(out).toMatch(
      /ID-2 dangling id citation: requirements\/properties-blk\.md cites 'requirements\/req-blk\.md#REQ-BLK-1b'/,
    )
    expect(code).toBe(1)
  })

  it("ID-3 catches an ORPHAN requirement (defined, consumed by no WP)", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — added by a late ADR, carried by nobody"])
    const { code, out } = runGate()
    expect(out).toMatch(/ID-3 orphan requirement: 'REQ-BLK-9z' is defined but no WP card consumes it/)
    expect(code).toBe(1)
  })

  it("ID-3 catches an ORPHAN scenario that is NOT marked held-out", () => {
    append("requirements/goldens-blk.md", ["", "### SCN-BLK-9z-1 — a golden in no acceptance list   (guard)"])
    const { code, out } = runGate()
    expect(out).toMatch(/ID-3 orphan scenario: 'SCN-BLK-9z-1' is defined, is not marked 'held-out'/)
    expect(code).toBe(1)
  })

  // ── ID-3 SCHEDULING: only a structured pointer counts ──────────────────────────────────────────────
  // The hole these close: `wpRefs` used to collect EVERY id token anywhere in a WP card, so a sentence
  // naming an id marked it "scheduled". Documenting an orphan silenced the ratchet tracking it. Each case
  // below FAILS against that implementation — the first three because prose/other fields used to schedule,
  // the last two because they must keep working after the narrowing (a tightening that also breaks the
  // legitimate cases is not a fix).
  it("ID-3 is NOT satisfied by a bare prose mention of the id", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — added by a late ADR"])
    append("requirements/work-packages/wp-campaign-1.md", [
      "",
      "exclusions: >",
      "  REQ-BLK-9z is deliberately out of scope for this card and is left to a later campaign.",
    ])
    const { code, out } = runGate()
    expect(out).toMatch(/ID-3 orphan requirement: 'REQ-BLK-9z'/)
    expect(code).toBe(1)
  })

  it("ID-3 is NOT satisfied by a markdown LINK to the id outside a scheduling block", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — added by a late ADR"])
    append("requirements/work-packages/wp-campaign-1.md", [
      "",
      "intent: >",
      "  Restores compliance with [REQ-BLK-9z](../req-blk.md#REQ-BLK-9z) without carrying it.",
    ])
    expect(runGate().out).toMatch(/ID-3 orphan requirement: 'REQ-BLK-9z'/)
  })

  it("ID-3 is NOT satisfied by a structured pointer in a NON-scheduling field", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — added by a late ADR"])
    append("requirements/work-packages/wp-campaign-1.md", ["", "context_refs:", "  - source: ../req-blk.md#REQ-BLK-9z"])
    expect(runGate().out).toMatch(/ID-3 orphan requirement: 'REQ-BLK-9z'/)
  })

  it("ID-3 IS satisfied by a structured source_reqs: pointer — and the block survives a blank line", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — added by a late ADR"])
    append("requirements/work-packages/wp-campaign-1.md", [
      "",
      "source_reqs:",
      "",
      "  - source: ../req-blk.md#REQ-BLK-9z   # ptr+digest",
    ])
    const { code, out } = runGate()
    expect(out).not.toMatch(/ID-3/)
    expect(code).toBe(0)
  })

  it("ID-3 IS satisfied for an SCN by a structured acceptance: pointer", () => {
    append("requirements/goldens-blk.md", ["", "### SCN-BLK-9z-1 — a golden   (guard)"])
    append("requirements/work-packages/wp-campaign-1.md", [
      "",
      "acceptance:",
      "  - source: ../goldens-blk.md#SCN-BLK-9z-1",
    ])
    expect(runGate().code).toBe(0)
  })

  it("ID-4 catches a dangling <a id> anchor", () => {
    const p = join(root, "docs", "reference", "atlas-blk.md")
    writeFileSync(p, readFileSync(p, "utf8").replace('<a id="author-1"></a>', ""))
    const { code, out } = runGate()
    expect(out).toMatch(
      /ID-4 dangling anchor: .*cites 'reference\/atlas-blk\.md#author-1', but that file declares no <a id="author-1">/,
    )
    expect(code).toBe(1)
  })

  it("ID-4 still fires when the LAST <a id> is deleted (the self-disabling hole)", () => {
    // Gating the check on "the target declares some anchors" would make this edit silently downgrade every
    // inbound pointer to unchecked. The condition is the anchor NAMESPACE, so it still fires.
    doc("reference/atlas-blk.md", ["# Block BLK — reference", "", "### 1. The first contract"])
    const { code, out } = runGate()
    expect(out).toMatch(/ID-4 dangling anchor: .*#author-1/)
    expect(code).toBe(1)
  })

  it("ID-5 catches a broken relative link", () => {
    append("requirements/work-packages/wp-campaign-1.md", ["rationale: ../../reference/atlas-blkk.md   # typo"])
    const { code, out } = runGate()
    expect(out).toMatch(
      /ID-5 broken relative link: requirements\/work-packages\/wp-campaign-1\.md cites '\.\.\/\.\.\/reference\/atlas-blkk\.md'/,
    )
    expect(code).toBe(1)
  })

  it("ID-5 catches a broken markdown link", () => {
    doc("explanation/blk.md", ["# BLK", "", "See [the reference](../reference/atlas-gone.md)."])
    const { code, out } = runGate()
    expect(out).toMatch(/ID-5 broken relative link: explanation\/blk\.md cites '\.\.\/reference\/atlas-gone\.md'/)
    expect(code).toBe(1)
  })
})

describe("id-integrity — the false alarms it must NOT raise", () => {
  it("does NOT fire on PROSE that mentions ids generically", () => {
    doc("explanation/blk.md", [
      "# On identifiers",
      "",
      "Every REQ- id must be unique. A REQ-<MODULE>-<n> placeholder is not an id, and neither is",
      "REQ-NOPE-9 when it appears in running text. The SCN- and INV- families work the same way,",
      "and a path mentioned in prose like `reference/atlas-nowhere.md` is a name, not a link.",
    ])
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("does NOT fire on an id or a link inside a FENCED CODE BLOCK", () => {
    append("requirements/req-blk.md", [
      "",
      "Authoring shape:",
      "",
      "```markdown",
      "### REQ-BLK-1a — this would be a duplicate definition if fences were scanned",
      "### SCN-BLK-0-0 — this would be an orphan scenario",
      "See [a link](../../reference/atlas-does-not-exist.md#author-99).",
      "```",
    ])
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })

  it("does NOT treat a goldens GROUPING header as a second definition", () => {
    // Already true of the base fixture; assert it explicitly, because collapsing the owner-family rule is
    // the single edit that would turn 549 real grouping headers into false duplicates.
    const { out } = runGate()
    expect(out).not.toContain("ID-1")
    expect(out).toMatch(/2 REQ, 3 SCN/) // the grouping header did NOT inflate the REQ count
  })

  it("does NOT fire on a HELD-OUT scenario that no WP consumes", () => {
    // SCN-BLK-1a-2 is held-out and cited by nobody. Citing it would defeat the hold-out.
    const { code, out } = runGate()
    expect(out).not.toContain("SCN-BLK-1a-2")
    expect(code).toBe(0)
  })

  it("does NOT read docs/method/** — its worked examples and placeholders are the METHOD, not the corpus", () => {
    // method/prompts/S1.md restates REQ-BLK-1a, declares REQ-<MODULE>-<n>, and links a missing template.
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(out).toMatch(/113 corpus files|\d+ corpus files/)
    expect(out).not.toContain("wp-template.md")
    expect(code).toBe(0)
  })

  it("does NOT assert existence of a BARE path in a field (the loose naming convention)", () => {
    // `reference/atlas-blk.md` from requirements/ is docs-root-relative; `nowhere/at-all.md` resolves against
    // no base. Neither is a relative link, and a first cut that treated them as links cried wolf 36 times.
    append("requirements/req-blk.md", ["context_refs: [ reference/atlas-blk.md, nowhere/at-all.md ]"])
    const { code, out } = runGate()
    expect(out).not.toContain("✗")
    expect(code).toBe(0)
  })
})

describe("id-integrity — the ratchet can only shrink", () => {
  it("TOLERATES a violation that is on the known ledger", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — a known, recorded orphan"])
    const { code, out } = runGate({ "ID-3 REQ-BLK-9z": "recorded pre-existing defect" })
    expect(code).toBe(0)
    expect(out).toMatch(/KNOWN DEFECTS \(ratchet — 1 pre-existing/)
    expect(out).toMatch(/ID-3 REQ-BLK-9z — recorded pre-existing defect/)
  })

  it("FAILS when a ledger entry no longer fires, so the ledger cannot rot", () => {
    const { code, out } = runGate({ "ID-3 REQ-BLK-9z": "was fixed upstream" })
    expect(out).toMatch(/RATCHET 'ID-3 REQ-BLK-9z' is recorded as a known defect but no longer fires/)
    expect(code).toBe(1)
  })

  it("still FAILS on a NEW violation while a known one is tolerated", () => {
    append("requirements/req-blk.md", ["", "### REQ-BLK-9z — known", "", "### REQ-BLK-8y — brand new"])
    const { code, out } = runGate({ "ID-3 REQ-BLK-9z": "recorded" })
    expect(out).toMatch(/ID-3 orphan requirement: 'REQ-BLK-8y'/)
    expect(out).not.toMatch(/orphan requirement: 'REQ-BLK-9z'/)
    expect(code).toBe(1)
  })
})
