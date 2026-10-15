// harness/gates/req-clause-guard.test.mjs — the teeth of the REQ→INV quote check, on a fixture corpus.
//
// `gate-directory.test.mjs` proves this file's gate CAN fail (empty tree ⇒ non-zero). That is not the same
// as proving it checks the RIGHT thing on a POPULATED tree: a gate can die on a missing directory and be
// vacuous on real input. These cases are that second half. Each one is a MUTATION of a corpus the gate
// passes — flip one property, the gate must go red, and the message must name the row.
//
// Every case runs the gate as a SUBPROCESS against a fixture repo (`REQ_CLAUSE_ROOT`), with the ledger
// supplied out of band (`REQ_CLAUSE_LEDGER`). Importing it would run its top-level sweep and `process.exit`.

import { describe, it, expect } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const GATE = join(dirname(fileURLToPath(import.meta.url)), "req-clause-guard.mjs")

/** A fixture repo: `docs/requirements/req-fix.md` + `docs/reference/atlas-fix.md`. */
function run(reqBody, refBody, ledger = {}, pins = {}) {
  const root = mkdtempSync(join(tmpdir(), "atlas-reqclause-"))
  try {
    mkdirSync(join(root, "docs", "requirements"), { recursive: true })
    mkdirSync(join(root, "docs", "reference"), { recursive: true })
    writeFileSync(join(root, "docs", "requirements", "req-fix.md"), reqBody)
    writeFileSync(join(root, "docs", "reference", "atlas-fix.md"), refBody)
    try {
      const stdout = execFileSync(process.execPath, [GATE], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          REQ_CLAUSE_ROOT: root,
          REQ_CLAUSE_LEDGER: JSON.stringify(ledger),
          REQ_CLAUSE_PINS: JSON.stringify(pins),
        },
      })
      return { code: 0, out: stdout }
    } catch (e) {
      return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` }
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const REF = [
  "## Invariants",
  "",
  "- **FIX-1 The bounded thing.** It MUST return a `≤ ~2K` **governing** pack of `tier≥T1`",
  "  invariants, beside a separately capped ADVISORY band; `stale:true` MUST mean re-ground.",
  "- **FIX-2 The other thing.** `anchors <path>` MUST return exactly the units the index carries",
  "  under `path` — each with its `kind` — and MUST NOT invent, omit, or reorder a unit. Phrased as",
  '  "the unit is structurally unchanged," never as "the claim is true."',
  "",
  "## Acceptance",
  "",
  "1. **FIX-2** — the acceptance restatement, which says a probe reports the reason it declined.",
  "",
].join("\n")

const req = (id, source, clause) =>
  [
    "# Requirements — fixture",
    "",
    `### ${id} — a requirement`,
    `source: ${source}`,
    "The thing shall do the thing.",
    `normative-clause: ${clause}`,
    "",
  ].join("\n")

/** Every pin the gate ITSELF asks for on this corpus, parsed out of its own refusal. Keys and digests are
 *  never authored here, so these cases cannot agree with a broken implementation by reimplementing it —
 *  and the pinned set stays DERIVED in the fixture exactly as it is on the real tree. */
function pinsDemandedBy(reqBody, refBody, ledger = {}) {
  const out = run(reqBody, refBody, ledger).out
  const pins = {}
  for (const m of out.matchAll(/add "([^"]+)": \{ "digest": "([0-9a-f]{32})"/g))
    pins[m[1]] = { digest: m[2], why: "fixture" }
  return pins
}

/** Run with precisely those pins supplied. `## Acceptance` restatements in the fixture REF are carriers no
 *  quote can reach, so almost every case needs them — which IS the cost this leg imposes, made visible. */
function runPinned(reqBody, refBody, ledger = {}) {
  return run(reqBody, refBody, ledger, pinsDemandedBy(reqBody, refBody, ledger))
}
describe("req-clause-guard — a quote that left its invariant fails the build", () => {
  it("PASSES when the quote is still in the cited invariant (the control — without it every red below is vacuous)", () => {
    const r = run(
      req(
        "REQ-FIX-1a",
        "INV-FIX-1 @ reference/atlas-fix.md#fix-1",
        '"return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"',
      ),
      REF,
    )
    expect(r.out).toContain("req-clause-guard: OK")
    expect(r.code).toBe(0)
  })

  it("FAILS on the real shape: the invariant was amended and the quote was not fanned out", () => {
    // The pre-amendment wording of the sentence above — exactly the REQ-TOOLS-6b defect.
    const r = run(
      req("REQ-FIX-1a", "INV-FIX-1 @ reference/atlas-fix.md#fix-1", '"return a `≤ ~2K` pack of `tier≥T1` invariants"'),
      REF,
    )
    expect(r.code).toBe(1)
    expect(r.out).toContain("REQ-FIX-1a")
    expect(r.out).toContain("Diverges after 17 char(s)")
  })

  it("a `…` elision is honoured — fragments must occur VERBATIM and IN ORDER", () => {
    const src = "INV-FIX-2 @ reference/atlas-fix.md#fix-2"
    expect(
      runPinned(
        req("REQ-FIX-2a", src, '"MUST return exactly the units the index carries … MUST NOT invent, omit"'),
        REF,
      ).code,
    ).toBe(0)
    // …and order is enforced: the same two fragments, swapped, must NOT pass.
    expect(
      runPinned(
        req("REQ-FIX-2a", src, '"MUST NOT invent, omit … MUST return exactly the units the index carries"'),
        REF,
      ).code,
    ).toBe(1)
  })

  it('`\\"` is the escape for a quote inside the span, not a divergence', () => {
    const r = runPinned(
      req("REQ-FIX-2b", "INV-FIX-2 @ reference/atlas-fix.md#fix-2", '"never as \\"the claim is true.\\""'),
      REF,
    )
    expect(r.code).toBe(0)
  })

  it("an AMENDMENT TOMBSTONE cannot re-satisfy a stale quote (the hole that made this gate report OK)", () => {
    const withTombstone = REF.replace(
      "  invariants, beside a separately capped ADVISORY band; `stale:true` MUST mean re-ground.",
      [
        "  invariants, beside a separately capped ADVISORY band; `stale:true` MUST mean re-ground.",
        '  <!-- AMENDED: was "return a `≤ ~2K` pack of `tier≥T1` invariants" -->',
      ].join("\n"),
    )
    const r = run(
      req("REQ-FIX-1a", "INV-FIX-1 @ reference/atlas-fix.md#fix-1", '"return a `≤ ~2K` pack of `tier≥T1` invariants"'),
      withTombstone,
    )
    expect(r.code).toBe(1)
    expect(r.out).toContain("REQ-FIX-1a")
  })

  it("markdown emphasis and case are NOT normalised away — the amendment moved exactly those bytes", () => {
    const src = "INV-FIX-1 @ reference/atlas-fix.md#fix-1"
    expect(run(req("REQ-FIX-1b", src, '"a `≤ ~2K` governing pack"'), REF).code).toBe(1) // `**` dropped
    expect(run(req("REQ-FIX-1c", src, '"`stale:true` must mean re-ground"'), REF).code).toBe(1) // MUST → must
  })

  it("a hit at a LATER carrier of the same id is reported, never silently accepted", () => {
    const r = run(
      req("REQ-FIX-2c", "INV-FIX-2 @ reference/atlas-fix.md#fix-2", '"a probe reports the reason it declined"'),
      REF,
    )
    expect(r.code).toBe(1)
    expect(r.out).toContain("another carrier of the same id")
  })

  it("a row it cannot evaluate is NAMED on every run, pass or fail — never counted as a pass", () => {
    const noPtr = run(req("REQ-FIX-3a", "SECURITY AMENDMENT — NOT a lift", '"anything at all"'), REF)
    expect(noPtr.code).toBe(0) // nothing is asserted about it…
    expect(noPtr.out).toContain("UNEVALUABLE (1)")
    expect(noPtr.out).toContain("REQ-FIX-3a") // …but it is named, on a PASSING run
    const badAnchor = run(req("REQ-FIX-3b", "INV-FIX-9 @ reference/atlas-fix.md#fix-9", '"anything at all"'), REF)
    expect(badAnchor.out).toContain("no invariant block for '#fix-9'")
  })

  it("the LEDGER is shrink-only: it silences a known row, and a stale entry FAILS the gate", () => {
    const stale = req(
      "REQ-FIX-1a",
      "INV-FIX-1 @ reference/atlas-fix.md#fix-1",
      '"return a `≤ ~2K` pack of `tier≥T1` invariants"',
    )
    const key = /REQ-FIX-1a @ ([0-9a-f]{8})/.exec(run(stale, REF, {}).out)
    expect(key, "the failure must print the ledger key so the entry can be written").not.toBeNull()
    // INV-FIX-1 has exactly one citing REQ here, so ledgering it makes the invariant 100% waived and the
    // WAIVER COVERAGE leg takes over. Pin it, so THIS case still isolates the ledger's own behaviour.
    const pin = pinsDemandedBy(stale, REF, { [key[0]]: "known" })
    expect(run(stale, REF, { [key[0]]: "known" }, pin).code).toBe(0)
    // The SAME ledger against a corpus where the row no longer diverges ⇒ RATCHET failure.
    const fixed = req(
      "REQ-FIX-1a",
      "INV-FIX-1 @ reference/atlas-fix.md#fix-1",
      '"return a `≤ ~2K` **governing** pack of `tier≥T1` invariants"',
    )
    const r = runPinned(fixed, REF, { [key[0]]: "known" })
    expect(r.code).toBe(1)
    expect(r.out).toContain("RATCHET")
  })
})

describe("req-clause-guard — CARRIER COVERAGE: ratified text no live quote reaches", () => {
  // Reproduced on the real tree before this leg existed. Two holes, one mechanism.
  //   #199: INV-TOOLS-1, the constitutional write-door invariant, is cited by five REQs and all five are
  //         ledgered. Its entire normative text was replaced by its own negation; all nine gates exited 0.
  //   #208: an anchor is carried MORE THAN ONCE — the `## Invariants` bullet and a numbered `## Acceptance`
  //         restatement. The verdict is taken at the FIRST carrier, so no live quote can ever reach the
  //         restatement. INDEX-16's was inverted ("crosses 15% fails ... at build time" -> "PASSES ... and is
  //         DEFERRED to a later axis, never checked at build time") and all nine gates exited 0.
  // The pinned unit is therefore the CARRIER, and a quote is LIVE exactly when it holds at carrier 1 — so
  // for ordinal 1 this rule IS #199's rule, which is why these cases cover both with one mechanism.

  const stale = req("REQ-FIX-1a", "INV-FIX-1 @ reference/atlas-fix.md#fix-1", '"a quote that is not in FIX-1"')
  const ledgerKey = () => /REQ-FIX-1a @ ([0-9a-f]{8})/.exec(run(stale, REF, {}).out)[0]

  it("a carrier NO live quote reaches and NO pin holds FAILS, and the refusal says what would restore it", () => {
    const r = run(stale, REF, { [ledgerKey()]: "known" })
    expect(r.code).toBe(1)
    expect(r.out).toContain("UNPROTECTED CARRIER")
    expect(r.out).toContain("docs/reference/atlas-fix.md#fix-1@carrier1")
    expect(r.out).toContain("harness/inv-text-pins.json") // the route back, with the digest to use
  })

  it("the pin has TEETH: with the carrier pinned, editing its text FAILS (the #199 splice, in miniature)", () => {
    const k = ledgerKey()
    const pins = pinsDemandedBy(stale, REF, { [k]: "known" })
    expect(run(stale, REF, { [k]: "known" }, pins).code, "pinned + unedited must PASS").toBe(0)
    const inverted = REF.replace("It MUST return a", "It MUST NOT return a")
    expect(inverted, "the mutation must actually change the fixture").not.toBe(REF)
    const r = run(stale, inverted, { [k]: "known" }, pins)
    expect(r.code).toBe(1)
    expect(r.out).toContain("HAS CHANGED")
    expect(r.out).toContain("docs/reference/atlas-fix.md#fix-1@carrier1")
  })

  it("THE #208 HOLE: an `## Acceptance` restatement is pinned, and inverting it FAILS naming the carrier", () => {
    // No REQ cites fix-2 here beyond the one whose quote lifts the BULLET, so carrier 2 — the restatement —
    // is reached by nothing. Before this leg it was rewritable in silence.
    const cite = req(
      "REQ-FIX-2a",
      "INV-FIX-2 @ reference/atlas-fix.md#fix-2",
      '"MUST NOT invent, omit, or reorder a unit"',
    )
    const pins = pinsDemandedBy(cite, REF)
    expect(Object.keys(pins)).toContain("docs/reference/atlas-fix.md#fix-2@carrier2")
    expect(run(cite, REF, {}, pins).code, "pinned + unedited must PASS").toBe(0)
    const inverted = REF.replace(
      "a probe reports the reason it declined",
      "a probe MUST NOT report the reason it declined",
    )
    expect(inverted, "the mutation must actually change the fixture").not.toBe(REF)
    const r = run(cite, inverted, {}, pins)
    expect(r.code).toBe(1)
    expect(r.out).toContain("HAS CHANGED")
    expect(r.out).toContain("docs/reference/atlas-fix.md#fix-2@carrier2")
    expect(r.out).toContain("## Acceptance restatement")
  })

  it("a re-wrap of a pinned carrier is NOT a change — the pin holds words, not line breaks", () => {
    const k = ledgerKey()
    const pins = pinsDemandedBy(stale, REF, { [k]: "known" })
    const rewrapped = REF.replace(
      "- **FIX-1 The bounded thing.** It MUST return a `≤ ~2K` **governing** pack of `tier≥T1`\n  invariants, beside",
      "- **FIX-1 The bounded thing.** It MUST return a `≤ ~2K` **governing**\n  pack of `tier≥T1` invariants, beside",
    )
    expect(rewrapped, "the re-wrap must actually change the bytes").not.toBe(REF)
    expect(run(stale, rewrapped, { [k]: "known" }, pins).code).toBe(0)
  })

  it("a pin for a carrier that REGAINED a live quote is STALE and fails — the set shrinks, never grows", () => {
    const k = ledgerKey()
    const pins = pinsDemandedBy(stale, REF, { [k]: "known" })
    // Same pins, but now a live REQ lifts FIX-1's bullet again, so carrier 1 is reached once more.
    const live = req("REQ-FIX-1z", "INV-FIX-1 @ reference/atlas-fix.md#fix-1", '"`stale:true` MUST mean re-ground"')
    const r = run(live, REF, {}, pins)
    expect(r.code).toBe(1)
    expect(r.out).toContain("STALE PIN")
    expect(r.out).toContain("docs/reference/atlas-fix.md#fix-1@carrier1")
  })

  it("a pin for a carrier that DISAPPEARED is STALE — deleting ratified text must be said, not done by omission", () => {
    const cite = req(
      "REQ-FIX-2a",
      "INV-FIX-2 @ reference/atlas-fix.md#fix-2",
      '"MUST NOT invent, omit, or reorder a unit"',
    )
    const pins = pinsDemandedBy(cite, REF)
    const withoutRestatement = REF.replace(
      "1. **FIX-2** — the acceptance restatement, which says a probe reports the reason it declined.\n",
      "",
    )
    expect(withoutRestatement, "the deletion must actually change the fixture").not.toBe(REF)
    const r = run(cite, withoutRestatement, {}, pins)
    expect(r.code).toBe(1)
    expect(r.out).toContain("STALE PIN")
    expect(r.out).toContain("docs/reference/atlas-fix.md#fix-2@carrier2")
  })

  it("a pin cannot be moved between carriers by copy-paste — the key is hashed with the text", () => {
    const k = ledgerKey()
    const pins = pinsDemandedBy(stale, REF, { [k]: "known" })
    const moved = { "docs/reference/atlas-fix.md#fix-2@carrier1": pins["docs/reference/atlas-fix.md#fix-1@carrier1"] }
    const r = run(stale, REF, { [k]: "known" }, moved)
    expect(r.code).toBe(1)
    expect(r.out).toContain("STALE PIN") // fix-2 carrier 1 is not in the uncovered set...
    expect(r.out).toContain("UNPROTECTED CARRIER") // ...and fix-1 carrier 1 is still unpinned
  })

  it("the carrier table is PRINTED on a passing run, so the class is auditable without a failure", () => {
    const k = ledgerKey()
    const pins = pinsDemandedBy(stale, REF, { [k]: "known" })
    const r = run(stale, REF, { [k]: "known" }, pins)
    expect(r.code).toBe(0)
    expect(r.out).toContain("WAIVER COVERAGE")
    expect(r.out).toContain("HELD ONLY BY A PIN  docs/reference/atlas-fix.md#fix-1@carrier1")
    expect(r.out).toContain("PINNED")
  })
})
