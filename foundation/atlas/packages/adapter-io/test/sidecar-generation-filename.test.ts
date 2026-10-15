// @atlas/adapter-io — test/sidecar-generation-filename.test.ts  (READ opens the NAME it enumerated, never a
// name it re-derives)
//
// MEASURED DEFECT: `generations()` parses `<base>.<digits>.json` into an INTEGER (`Number(m[1])`), so
// `"projection.007.json"` — three bytes fully intact — is counted as generation 7. The pre-fix
// `readSidecarSet` then RE-DERIVED the path to open from that integer via `genPath(dir, base, 7)`, which
// renders the UNPADDED writer-canonical name `"projection.7.json"` — a file that was never written.
// `readFileSync` throws ENOENT, `readOne` degrades to `undefined` (by design: a torn read must never crash a
// bin at boot), and with no `projection.json` mirror to rescue it the read collapses all the way to
// `{ projection: undefined, unreadable: true }` — a store every byte of which parses cleanly, reported as
// unreadable. Fixed by carrying the MATCHED FILENAME alongside the parsed number (`listGenerations` in
// `sidecar.ts`) so `readSidecarSet` opens `join(dir, entry.name)` — the exact name it just enumerated — and
// never a name it computes a second time. `generations()` itself (numbers only, used by `sidecar-commit.ts`
// to order/prune ITS OWN canonical writes) is UNCHANGED.
//
// PRECONDITION, stated because the original finding did not: the compat mirror (`projection.json`) RESCUES
// this in a healthy store — `readSidecarSet` falls back to it whenever no generation parses. The bug needs
// BOTH a non-canonical generation filename AND a missing-or-corrupt mirror; the two are not independent (the
// mirror fallback exists precisely because generation files get pruned or hand-deleted), but it is not a
// standing brick either. Every case below builds a store with NO mirror on purpose, so the fallback cannot
// mask the assertion in either direction.
//
// ADDENDUM (cold review, cfde63f): the first fix introduced a NARROWER defect of the same class — two
// distinct filenames sharing one parsed generation number (`"7.json"` / `"007.json"`) made
// `listGenerations`'s sort order-of-`readdirSync`-dependent, so which projection `readSidecarSet` served
// could depend on the filesystem rather than on the store's content. Fixed by a lexicographic tiebreak on the
// filename (`git-history.ts`'s `byPath` shape). The DETERMINISM case below pins that property; unlike every
// case above it has NO red/green proof, because the defect it guards is an UNSPECIFIED result — one that can
// come out "right" by luck on a single read — so a red-before-fix run would not be a reliable read either way.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CurrentNode } from "@atlas/knowledge"
import { readSidecarSet } from "../src/sidecar.js"
import { IDENTITY_SCHEMA } from "../src/identity-schema.js"

let dir: string | undefined
let extraDirs: string[] = []
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
  for (const d of extraDirs) rmSync(d, { recursive: true, force: true })
  extraDirs = []
})

const row = (key: string): [string, CurrentNode] => [
  key,
  { nodeKey: key, family: "advisory", contentHash: "a".repeat(64), claims: [`claim ${key}`] },
]

/** A well-formed sidecar wire payload, written straight to an ARBITRARY filename — bypassing
 *  `commitSidecar`/`genPath` entirely, because the defect is about a name this protocol did not itself mint
 *  (a hand-placed generation file, a restore, a padded rename — anything that lands a byte-valid
 *  `<base>.<digits>.json` the writer would never have produced). */
const writeWire = (path: string, keys: readonly string[]): void => {
  writeFileSync(path, JSON.stringify({ current: keys.map(row), cas: [], identity: IDENTITY_SCHEMA }), "utf8")
}

describe("SIDECAR — the read path opens the FILENAME it enumerated, never a re-derived one", () => {
  it('REGRESSION: a zero-padded generation name ("projection.007.json"), no mirror, every byte intact ⇒ READABLE', () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-sidecar-genfile-"))
    writeWire(join(dir, "projection.007.json"), ["alpha"])
    // MUTANT: restore `readOne(genPath(dir, base, g))` in `readSidecarSet` and this goes RED — `genPath(dir,
    // 'projection', 7)` renders `"projection.7.json"`, a name that was never written, and the read collapses
    // to `{ projection: undefined, unreadable: true }` even though the file above parses cleanly.
    const read = readSidecarSet(dir, "projection")
    expect(read.unreadable).toBe(false)
    expect(read.projection).toBeDefined()
    expect([...read.projection!.current.keys()]).toEqual(["alpha"])
    expect(read.top).toBe(7) // the NUMBER still orders correctly; only the OPEN path was wrong
  })

  it("a NON-padded generation name keeps working exactly as before it (no regression on the canonical case)", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-sidecar-genfile-"))
    writeWire(join(dir, "projection.3.json"), ["beta"])
    const read = readSidecarSet(dir, "projection")
    expect(read.unreadable).toBe(false)
    expect([...read.projection!.current.keys()]).toEqual(["beta"])
    expect(read.top).toBe(3)
  })

  it("a HIGHER-numbered padded generation still wins ordering over a canonical lower one", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-sidecar-genfile-"))
    writeWire(join(dir, "projection.2.json"), ["old"])
    writeWire(join(dir, "projection.010.json"), ["new"]) // parses to 10, above 2
    const read = readSidecarSet(dir, "projection")
    expect(read.top).toBe(10)
    expect([...read.projection!.current.keys()]).toEqual(["new"]) // the higher (padded) generation is read
  })

  // ── the negative direction: a real absence/corruption must still refuse, or the fix over-corrected ──────
  it("NEGATIVE: a genuinely UNPARSEABLE generation, no mirror ⇒ still `unreadable: true`, `projection: undefined`", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-sidecar-genfile-"))
    writeFileSync(join(dir, "projection.1.json"), "{ not json at all", "utf8")
    const read = readSidecarSet(dir, "projection")
    expect(read.unreadable).toBe(true)
    expect(read.projection).toBeUndefined()
    expect(read.top).toBe(1) // the corrupt generation still occupies its slot for the next `link`
  })

  it("NEGATIVE: an EMPTY directory (no generation file at all) ⇒ `unreadable: false` — absence is not corruption", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-sidecar-genfile-"))
    const read = readSidecarSet(dir, "projection")
    expect(read.unreadable).toBe(false)
    expect(read.projection).toBeUndefined()
    expect(read.top).toBe(0)
  })

  // ── DETERMINISM — pins a property, does NOT reproduce a failure (see the ADDENDUM above) ────────────────
  it('DETERMINISM: two names sharing one generation number ("projection.7.json" / "projection.007.json") always resolve the SAME winner, regardless of write order', () => {
    const N = 20
    extraDirs = Array.from({ length: N }, () => mkdtempSync(join(tmpdir(), "atlas-sidecar-tie-")))
    const winners = extraDirs.map((d, i) => {
      const unpadded = join(d, "projection.7.json")
      const padded = join(d, "projection.007.json")
      // Alternate the WRITE order across trials — the one axis a readdir-order-dependent sort could latch
      // onto. Neither order is meant to be more "correct" than the other; the property under test is that
      // the OUTCOME does not move when this axis moves.
      if (i % 2 === 0) {
        writeWire(unpadded, ["from-unpadded"])
        writeWire(padded, ["from-padded"])
      } else {
        writeWire(padded, ["from-padded"])
        writeWire(unpadded, ["from-unpadded"])
      }
      const read = readSidecarSet(d, "projection")
      return [...read.projection!.current.keys()][0]
    })
    // MUTANT: drop the `|| (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)` tiebreak from `listGenerations`'s
    // sort and this CAN flip between 'from-padded' and 'from-unpadded' across trials — not reliably (an
    // unspecified result can come out the same way by luck on any given filesystem/run), which is exactly why
    // this assertion is written over 20 independent directories with the write order alternated, rather than
    // over one directory once. The specific winner below is the tiebreak's ascending-by-name choice
    // (`"007" < "7"` lexicographically, char-by-char from `'0' < '7'`) — a fixed answer, not a claim that
    // either filename is more authoritative than the other.
    expect(new Set(winners).size).toBe(1)
    expect(winners[0]).toBe("from-padded")
  })
})
