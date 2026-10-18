// @atlas/cli — test/marshal-link-retract.test.ts  (A-D3 / task #83 — the retraction MODE's CLI plumbing)
//
// WHY THIS FILE EXISTS, as the gap it closes. A cold review measured that the retraction mode had NO unit
// coverage anywhere: no test in `adapter-io/test`, `tools/test` or `cli/test` contained the string `retract`.
// The mode rested entirely on ONE e2e story (`s25-sameas-retraction.blackbox.test.ts`). That story does earn
// its keep — dropping the mode at the wire leg, dropping it at the marshaller, removing `retract` from the
// published schema, and rendering a retraction as `linked:` are each killed by it — but single-point
// coverage of a governed write door's MODE SELECTOR is a thin place, and one of its legs was already wrong:
//
// F4 (measured through the REAL `parse` → `marshalArgs` chain, not reasoned about): `--retract=1`,
// `--retract=TRUE`, `--retract=false` and the near-miss typo `--retracted` ALL produced `retract: false` —
// i.e. an ASSERTION. An operator who asked to withdraw an equivalence got `linked: a ≡ b` and a fresh
// generation published. The flag's VALUE FORM had no test at all, so mutating `=== 'true'` to
// `!== undefined` survived the whole suite.
//
// These cases drive the real parser and the real marshaller — never a hand-built flag bag — so they pin the
// chain an operator actually types through.

import { describe, it, expect } from "vitest"
import { parse } from "../src/parse.js"
import { marshalArgs } from "../src/marshal.js"
import type { MarshalResult } from "../src/marshal.js"

/** Drive the REAL chain: argv → `parse` → `marshalArgs`. A parse failure is surfaced as a marshal-shaped
 *  failure so every case below reads the same way; no case is allowed to pass by failing at the wrong stage
 *  (each asserts WHICH stage refused via the reason text). */
function run(argv: readonly string[]): MarshalResult {
  const p = parse(argv)
  if (!p.ok) return { ok: false, error: `parse: ${p.error}` }
  return marshalArgs(p.command, p.positionals, p.flags)
}

const args = (r: MarshalResult): Record<string, unknown> => {
  expect(r.ok, r.ok ? "" : `expected OK, got: ${r.error}`).toBe(true)
  return (r as { ok: true; args: Record<string, unknown> }).args
}

describe("atlas link — the ACCEPTED spellings select the mode, and nothing else does", () => {
  it("no flag ⇒ ASSERT (`retract: false`), the pre-existing behaviour byte-for-byte", () => {
    expect(args(run(["link", "nkA", "nkB"]))).toEqual({ a: "nkA", b: "nkB", retract: false })
  })

  it("the BARE `--retract` ⇒ RETRACT, as a real boolean (not the string `parse` folds it to)", () => {
    // A real boolean matters beyond tidiness: the published input schema (TOOLS-3) declares `retract` as a
    // boolean and the door type-checks declared properties, so a string here would make the CLI fail
    // `malformed-args` on a call MCP accepts — a transport divergence on a governed write door.
    const a = args(run(["link", "nkA", "nkB", "--retract"]))
    expect(a).toEqual({ a: "nkA", b: "nkB", retract: true })
    expect(typeof a["retract"]).toBe("boolean")
  })

  it("the explicit `--retract=true` ⇒ RETRACT (the same string `parse` folds the bare form to)", () => {
    expect(args(run(["link", "nkA", "nkB", "--retract=true"]))).toEqual({ a: "nkA", b: "nkB", retract: true })
  })
})

describe("atlas link — every OTHER flag form fails CLOSED and VISIBLY (F4)", () => {
  // THE MUTANT THIS KILLS: `raw !== undefined && raw !== 'true'` → dropped, or `=== 'true'` → `!== undefined`.
  // Either one silently re-inverts the mode for these inputs, which is how the defect shipped.
  for (const bad of ["1", "false", "TRUE", "True", "yes", "0", ""]) {
    it(`\`--retract=${bad}\` is REFUSED — never silently read as an assertion`, () => {
      const r = run(["link", "nkA", "nkB", `--retract=${bad}`])
      expect(r.ok).toBe(false)
      const err = (r as { ok: false; error: string }).error
      expect(err).toContain("--retract")
      expect(err).not.toContain("parse:") // the MARSHALLER refused, not the parser — the stage is the point
      // Anti-vacuity in the direction that matters: the refusal must not be satisfiable by any message. It
      // has to tell the operator the two accepted spellings, because "your flag is wrong" is what sent them
      // to guess `--retract=1` in the first place.
      expect(err).toContain("'--retract=true'")
    })
  }

  it("the near-miss typo `--retracted` is REFUSED as an unknown flag (it used to ASSERT)", () => {
    const r = run(["link", "nkA", "nkB", "--retracted"])
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toContain("unknown flag '--retracted'")
  })

  it("an unrelated unknown flag is REFUSED too — a write door does not discard an argument you supplied", () => {
    // `parse` deliberately folds unknown flags into the bag rather than failing (CLI-1b totality), and every
    // other command ignores the ones it does not read. That is fine for a READ command and is NOT changed
    // here; this strictness is scoped to `link` alone.
    const r = run(["link", "nkA", "nkB", "--force"])
    expect(r.ok).toBe(false)
    expect((r as { ok: false; error: string }).error).toContain("unknown flag '--force'")
  })

  it("TOTALITY is preserved: every refusal is a structured MarshalResult, never a throw (CLI-1b)", () => {
    for (const argv of [
      ["link", "nkA", "nkB", "--retract=1"],
      ["link", "nkA", "nkB", "--retracted"],
      ["link", "nkA", "nkB", "--force"],
      ["link", "nkA", "nkB", "--retract=--retract"],
    ]) {
      expect(() => run(argv)).not.toThrow()
      expect(run(argv).ok).toBe(false)
    }
  })

  it("SCOPED: the sibling commands keep their permissive flag handling (no totality regression)", () => {
    // The guard above must not have leaked into the shared marshaller. `query` and `emit` still ignore a flag
    // they do not read — if this goes red, an unrelated command's contract moved.
    expect(args(run(["query", "src", "--nonsense"]))).toEqual({ scope: "src", by: "scope" })
    expect(run(["reconcile", "abc123", "--whatever"]).ok).toBe(true)
  })
})
