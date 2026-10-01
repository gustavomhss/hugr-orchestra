// harness/gates/ears-coamend-guard.test.mjs — the teeth of the EARS co-amendment check (#198).
//
// `gate-directory.test.mjs` proves this gate CAN fail (empty tree ⇒ non-zero). That is orthogonal to
// proving it checks the RIGHT thing. The bulk here exercises the PURE CORE directly — no git, no
// subprocess — because that is where every decision lives; each case is the B-F3 class or a MUTATION of a
// case the core passes, so dropping a rule turns a green case red. The final block wires the whole gate
// over a REAL temp git repo, to prove the thin shell reads the base and end-to-end catches the drift.

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseReqBlocks, coamendViolations, norm } from "../lib/ears-coamend.mjs"

const GATE = join(dirname(fileURLToPath(import.meta.url)), "ears-coamend-guard.mjs")

/** Build a `### REQ-…` block from its two moving parts, in the exact corpus shape (proven unanimous over
 *  637 blocks): heading, `source:`, EARS prose, `normative-clause:`, plus optional trailing lines. */
const block = (id, ears, clause, extra = "") =>
  `### ${id} — t\nsource: INV-X @ reference/x.md#x\n${ears}\nnormative-clause: "${clause}"\n${extra}`
const one = (text) => parseReqBlocks(text)

describe("#198 pure core — parseReqBlocks extracts EARS / clause / exempt from the corpus shape", () => {
  it("pulls the EARS phrase (prose between source: and normative-clause:) and the clause", () => {
    const m = one(block("REQ-A-1", "The tool shall return a single band.", "return a single band"))
    expect(m.get("REQ-A-1").ears).toBe("The tool shall return a single band.")
    expect(m.get("REQ-A-1").clause).toBe('"return a single band"')
    expect(m.get("REQ-A-1").exempt).toBe(null)
  })
  it("joins a MULTI-LINE EARS phrase and skips blank + HTML-comment lines inside it", () => {
    const m = one(
      '### REQ-A-2 — t\nsource: INV-X @ r#x\nThe tool shall\nreturn two bands.\n<!-- note -->\n\nnormative-clause: "return two bands"\n',
    )
    expect(m.get("REQ-A-2").ears).toBe("The tool shall return two bands.")
  })
  it("a block missing the normative-clause is NOT judged (that is id-integrity’s job, not this gate)", () => {
    const m = one("### REQ-A-3 — t\nsource: INV-X @ r#x\nThe tool shall do a thing.\n")
    expect(m.has("REQ-A-3")).toBe(false)
  })
  it("captures the COAMEND-EXEMPT marker TEXT (so its freshness can be diffed), or null", () => {
    const m = one(block("REQ-A-4", "e", "c", "<!-- COAMEND-EXEMPT: clerical, prose unaffected -->"))
    expect(m.get("REQ-A-4").exempt).toContain("COAMEND-EXEMPT: clerical")
    expect(one(block("REQ-A-5", "e", "c")).get("REQ-A-5").exempt).toBe(null)
  })
  it(
    "EXCLUDES metadata FIELD lines (amendment:/note:) from the EARS phrase — a tombstone bump is NOT an " +
      "EARS edit [teeth: fold them in ⇒ the mask hole returns]",
    () => {
      const m = one(
        '### REQ-A-6 — t\nsource: INV-X @ r#x\namendment: **AMENDED 2026-08-02** — see ADR-0012.\nnote: scoped to band A.\nGenesis shall pass the truth door.\nnormative-clause: "pass the truth door"\n',
      )
      expect(m.get("REQ-A-6").ears).toBe("Genesis shall pass the truth door.") // prose only, no tombstone
    },
  )
})

describe("#198 pure core — norm judges MEANING, not bytes", () => {
  it("a pure re-wrap (whitespace/newlines) is UNCHANGED", () => {
    expect(norm("return a  ≤ ~2K\n  governing pack")).toBe(norm("return a ≤ ~2K governing pack"))
  })
  it("an HTML comment does not count as content", () => {
    expect(norm("return a band <!-- was: two bands -->")).toBe(norm("return a band"))
  })
  it("a markdown/word edit IS a change (no folding): `pack` ≠ `**governing** pack`", () => {
    expect(norm("return a pack")).not.toBe(norm("return a **governing** pack"))
  })
})

describe("#198 pure core — coamendViolations is the co-amend property (each case a rule under teeth)", () => {
  const base = one(block("REQ-A-1", "The tool shall return a single ≤ ~2K band.", "return a `≤ ~2K` pack"))

  it("AC1 — clause changed, EARS stale, no exempt ⇒ VIOLATION (the B-F3 class)", () => {
    const head = one(
      block(
        "REQ-A-1",
        "The tool shall return a single ≤ ~2K band.",
        "return a `≤ ~2K` **governing** pack beside an ADVISORY band",
      ),
    )
    const v = coamendViolations(base, head)
    expect(v.map((x) => x.id)).toEqual(["REQ-A-1"])
  })
  it("AC2 — clause changed AND EARS co-amended ⇒ clean (proves the EARS-unchanged condition bites)", () => {
    const head = one(
      block(
        "REQ-A-1",
        "The tool shall return a governing band beside an advisory one.",
        "return a `≤ ~2K` **governing** pack beside an ADVISORY band",
      ),
    )
    expect(coamendViolations(base, head)).toEqual([])
  })
  it("AC3 — clause changed, EARS stale, but COAMEND-EXEMPT present ⇒ clean (proves the exempt leg bites)", () => {
    const head = one(
      block(
        "REQ-A-1",
        "The tool shall return a single ≤ ~2K band.",
        "return a `≤ ~2K` **governing** pack beside an ADVISORY band",
        "<!-- COAMEND-EXEMPT: clerical re-lift, band count unchanged -->",
      ),
    )
    expect(coamendViolations(base, head)).toEqual([])
  })
  it("AC4 — EARS reworded, clause unchanged ⇒ clean (no spurious demand on prose-only edits)", () => {
    const head = one(
      block("REQ-A-1", "The `atlas-query` tool shall return a bounded ≤ ~2K band.", "return a `≤ ~2K` pack"),
    )
    expect(coamendViolations(base, head)).toEqual([])
  })
  it("AC5 — clause re-spaced only (norm-identical), EARS stale ⇒ clean (a re-wrap is not an amendment)", () => {
    const head = one(block("REQ-A-1", "The tool shall return a single ≤ ~2K band.", "return a   `≤ ~2K`   pack"))
    expect(coamendViolations(base, head)).toEqual([])
  })
  it("AC6 — a REQ only in head (added) or only in base (removed) has no delta ⇒ never a violation", () => {
    const added = one(block("REQ-NEW-9", "e", "c"))
    expect(coamendViolations(base, added)).toEqual([]) // REQ-NEW-9 unseen in base
    expect(coamendViolations(added, base)).toEqual([]) // REQ-A-1 unseen in the (added-only) base
  })

  // ── the two holes cold review found, each now under teeth ──────────────────────────────────────────
  const withAmend = (id, tomb, ears, clause) =>
    one(`### ${id} — t\nsource: INV-X @ r#x\namendment: ${tomb}\n${ears}\nnormative-clause: "${clause}"\n`)

  it("AC7 — bumping the `amendment:` tombstone does NOT mask a stale EARS (the field-line hole)", () => {
    const b = withAmend("REQ-A-1", "**AMENDED v1**", "The tool shall return a single band.", "return a single band")
    const h = withAmend(
      "REQ-A-1",
      "**AMENDED v2 2026-08-13**",
      "The tool shall return a single band.",
      "return two bands",
    )
    expect(coamendViolations(b, h).map((x) => x.id)).toEqual(["REQ-A-1"]) // clause moved, prose stale ⇒ caught
  })
  it("AC8 — a STALE/permanent COAMEND-EXEMPT gives no cover; only a co-amended one does (the exempt hole)", () => {
    const marker = "<!-- COAMEND-EXEMPT: clerical -->"
    const b = one(block("REQ-A-1", "The tool shall return a single band.", "return a single band", marker))
    // clause changes, EARS stale, SAME marker untouched from base ⇒ VIOLATION (permanent marker is no shield)
    const stale = one(block("REQ-A-1", "The tool shall return a single band.", "return two bands", marker))
    expect(coamendViolations(b, stale).map((x) => x.id)).toEqual(["REQ-A-1"])
    // same edit, but the justification is co-amended THIS commit ⇒ clean
    const fresh = one(
      block(
        "REQ-A-1",
        "The tool shall return a single band.",
        "return two bands",
        "<!-- COAMEND-EXEMPT: clerical; band count unchanged in meaning, ADR-0013 -->",
      ),
    )
    expect(coamendViolations(b, fresh)).toEqual([])
  })
})

describe("#198 end-to-end — the gate over a real git repo catches the drift and clears the co-amend", () => {
  const runGate = (root, base) => {
    try {
      const stdout = execFileSync(process.execPath, [GATE], {
        env: { ...process.env, EARS_COAMEND_ROOT: root, EARS_COAMEND_BASE: base, CI: "" },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
      return { code: 0, out: stdout }
    } catch (e) {
      return { code: e.status ?? -1, out: (e.stdout ?? "") + (e.stderr ?? "") }
    }
  }
  const gitc = (root, args) =>
    execFileSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })

  const setup = (headClause, headEars) => {
    const root = mkdtempSync(join(tmpdir(), "atlas-coamend-"))
    mkdirSync(join(root, "docs", "requirements"), { recursive: true })
    const file = join(root, "docs", "requirements", "req-fix.md")
    gitc(root, ["init", "-q"])
    gitc(root, ["config", "user.email", "t@t"])
    gitc(root, ["config", "user.name", "t"])
    // BASE commit: single-band EARS matching a single-band clause.
    writeFileSync(
      file,
      "## Requirements\n\n" +
        block(
          "REQ-TOOLS-6b",
          "The `atlas-query` tool shall return a single `≤ ~2K` band.",
          "return a `≤ ~2K` pack of `tier≥T1` invariants",
        ) +
        "\n",
    )
    gitc(root, ["add", "-A"])
    gitc(root, ["commit", "-q", "-m", "base"])
    const base = gitc(root, ["rev-parse", "HEAD"]).trim()
    // HEAD state (uncommitted working-tree edit — read via fs; base read via `git show`).
    writeFileSync(file, "## Requirements\n\n" + block("REQ-TOOLS-6b", headEars, headClause) + "\n")
    return { root, base }
  }

  it("RED: the clause becomes two-band, the EARS stays single-band ⇒ exit 1 naming REQ-TOOLS-6b", () => {
    const { root, base } = setup(
      "return a `≤ ~2K` **governing** pack of `tier≥T1` invariants beside an ADVISORY band",
      "The `atlas-query` tool shall return a single `≤ ~2K` band.",
    )
    try {
      const r = runGate(root, base)
      expect(r.code).not.toBe(0)
      expect(r.out).toContain("REQ-TOOLS-6b")
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("GREEN: the clause AND the EARS both move to two bands ⇒ exit 0", () => {
    const { root, base } = setup(
      "return a `≤ ~2K` **governing** pack of `tier≥T1` invariants beside an ADVISORY band",
      "The `atlas-query` tool shall return a governing band beside a separately capped advisory band.",
    )
    try {
      const r = runGate(root, base)
      expect(r.code, r.out).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
