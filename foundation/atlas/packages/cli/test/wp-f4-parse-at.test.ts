// @atlas/cli — test/wp-f4-parse-at.test.ts  (WP-F4)
//
// E2E finding: `parse.ts` treated `--at` as a bare boolean, so `atlas emit <fact> --at <sha>` dropped `<sha>`
// into a positional and the emit lost its anchor rev — only the joined `--at=<sha>` form worked. These teeth
// pin the fix: `--at` is a VALUED flag accepting BOTH forms, the space form only swallows a real value (never
// a following flag), and NON-valued flags (e.g. `--accept-reground`) keep their bare-boolean behavior so
// an unrelated following positional is never wrongly consumed. The parser stays TOTAL (never throws).

import { describe, expect, it } from "vitest"
import { parse } from "../src/parse.js"

/** Narrow a ParseResult to its ok branch (fails the test loudly instead of a silent undefined deref). */
function ok(argv: string[]) {
  const r = parse(argv)
  if (!r.ok) throw new Error(`expected ok parse, got error: ${r.error}`)
  return r
}

describe("WP-F4 — `--at` is a valued flag (both `--at=<sha>` and `--at <sha>`)", () => {
  it("accepts the JOINED form `--at=<sha>` (regression baseline)", () => {
    const r = ok(["emit", "fact.json", "--at=abc123"])
    expect(r.flags["at"]).toBe("abc123")
    expect(r.positionals).toEqual(["fact.json"])
  })

  it("accepts the SPACE form `--at <sha>` — BOTH forms yield the SAME `at` value", () => {
    const joined = ok(["emit", "fact.json", "--at=abc123"])
    const spaced = ok(["emit", "fact.json", "--at", "abc123"])
    // MUTANT KILLED: `--at` folded as a bare boolean (`flags.at === 'true'`, `abc123` demoted to a positional).
    // Under that mutant the space form's `at` would be 'true' and would NOT equal the joined form's 'abc123'.
    expect(spaced.flags["at"]).toBe("abc123")
    expect(spaced.flags["at"]).toBe(joined.flags["at"])
    expect(spaced.positionals).toEqual(["fact.json"]) // the sha did NOT leak into positionals
  })

  it("the space form works with the flag BEFORE the positional too", () => {
    const r = ok(["emit", "--at", "deadbeef", "fact.json"])
    expect(r.flags["at"]).toBe("deadbeef")
    expect(r.positionals).toEqual(["fact.json"])
  })

  it("a valueless `--at` (followed by another flag) does NOT swallow the flag — folds to the invalid `true`", () => {
    const r = ok(["emit", "fact.json", "--at", "--force=1"])
    // MUTANT KILLED: a lookahead that consumes `next` UNCONDITIONALLY would set `at === '--force=1'` and drop
    // the following flag. The guard `!next.startsWith('-')` keeps `--force` intact and leaves `at` valueless.
    expect(r.flags["at"]).toBe("true")
    expect(r.flags["force"]).toBe("1")
  })

  it("a trailing bare `--at` at end-of-argv folds to `true` (no throw, no undefined consume)", () => {
    const r = ok(["emit", "fact.json", "--at"])
    expect(r.flags["at"]).toBe("true") // marshalEmit rejects this as a missing --at (fail closed)
  })
})

describe("WP-F4 — non-valued flags stay bare booleans (no over-consuming)", () => {
  it("an unknown flag (`--depth`, formerly typed) folds via the normal path — NEVER a parse error", () => {
    // `--depth` used to be a validated typed flag; it is now DEAD (no leg/marshaller reads it). It must fold
    // like any other unknown flag: bare `--depth <n>` leaves `depth='true'` and `n` stays a positional, and a
    // once-"malformed" value like `--depth=notanumber` no longer fails — totality (never throws) is preserved.
    const bare = ok(["query", "--depth", "3"])
    expect(bare.flags["depth"]).toBe("true")
    expect(bare.positionals).toEqual(["3"]) // `3` satisfies query's arity as a normal positional
    const notanumber = ok(["query", "scope", "--depth=notanumber"])
    expect(notanumber.flags["depth"]).toBe("notanumber") // folds as a value, no int-check, no throw
  })

  it("`--depth=<int>` joined form still just folds (unknown-flag regression)", () => {
    const r = ok(["query", "scope", "--depth=2"])
    expect(r.flags["depth"]).toBe("2")
    expect(r.positionals).toEqual(["scope"])
  })

  it("an unrelated bare flag does NOT swallow a following positional", () => {
    // MUTANT KILLED: making EVERY bare flag consume its next token (instead of only VALUED_FLAGS) would let
    // `--accept-reground` eat `base`, leaving reconcile with 0 positionals → an arity error. The positional
    // `base` must survive as reconcile's mergeBase.
    const r = ok(["reconcile", "--accept-reground", "base"])
    expect(r.flags["accept-reground"]).toBe("true")
    expect(r.positionals).toEqual(["base"])
  })
})
