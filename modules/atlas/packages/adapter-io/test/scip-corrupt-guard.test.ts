// @atlas/adapter-io — test/scip-corrupt-guard.test.ts   (SCIP-GUARD #3 — boot-crash: PRESENT-but-corrupt .scip)
//
// The MISSING-file degrade is pinned by wire-scip-guard.test.ts. This suite pins the SECOND boot-crash
// mode: a PRESENT-but-CORRUPT `.atlas/index.scip` (garbage bytes / truncated protobuf / foreign schema)
// makes `deserializeSCIP` THROW. `composeRuntime` (compose.ts) and `assembleHandler` (wire.ts) both read
// this at STARTUP through the one shared guard `readScipOrEmpty` — an unguarded deserialize crashes BOTH
// bins at boot. The guard must fail CLOSED to the SAME empty projection the missing-file path yields.
//
// Cases:
//   • a corrupt dump ⇒ `readScipOrEmpty` returns `{ documents: [] }`, NO throw   (the boot-crash fix)
//   • a valid dump   ⇒ still parses to the full oracle projection (no regression control)
//   • TEETH — MUTANT[unwrapped-deserialize]: `readScip` on the SAME corrupt bytes THROWS (the raw call the
//     guard wraps). Reverting `readScipOrEmpty` to `existsSync(p) ? readScip(p) : {…}` reintroduces exactly
//     this throw on a present-but-corrupt dump.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readScip, readScipOrEmpty } from "../src/scip.js"
import { makeFixScip, expectedScipOutput } from "./harness/fix-scip.js"
import type { FixScip } from "./harness/fix-scip.js"

/** Write garbage (NOT a valid SCIP protobuf) to a fresh temp `index.scip` and return its path + cleanup. */
function makeCorruptScip(): { scipPath: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "atlas-corrupt-scip-"))
  const scipPath = join(dir, "index.scip")
  // Bytes that are PRESENT on disk but not a decodable SCIP index — a truncated/foreign blob.
  writeFileSync(scipPath, Buffer.from("this is not a scip protobuf \x00\xff\xfe garbage", "binary"))
  return { scipPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

let fx: FixScip | undefined
afterEach(() => {
  fx?.cleanup()
  fx = undefined
})

describe("readScipOrEmpty — degrades on a PRESENT-but-corrupt .scip (boot-crash guard)", () => {
  it("SCN-SCIP-GUARD-3 — a corrupt dump ⇒ empty projection, NO throw", () => {
    const corrupt = makeCorruptScip()
    try {
      let out
      // the load-bearing assertion: the read does NOT throw on the present-but-corrupt dump (it would at boot).
      expect(() => {
        out = readScipOrEmpty(corrupt.scipPath)
      }).not.toThrow()
      // it fails CLOSED to the SAME empty files-only projection the missing-file path yields.
      expect(out).toStrictEqual({ documents: [] })
    } finally {
      corrupt.cleanup()
    }
  })

  it("SCN-SCIP-GUARD-3b — CONTROL: a valid dump still parses to the full oracle (no regression)", () => {
    fx = makeFixScip()
    // the valid-SCIP happy path is byte-identical to readScip — the guard only absorbs the throwing paths.
    expect(readScipOrEmpty(fx.scipPath)).toStrictEqual(expectedScipOutput)
  })

  it("TEETH — MUTANT[unwrapped-deserialize]: raw readScip on the corrupt bytes THROWS", () => {
    const corrupt = makeCorruptScip()
    try {
      // `deserializeSCIP(readFileSync(corrupt))` throws — this is the raw call `readScipOrEmpty` wraps in
      // try/catch. Dropping that wrapper reintroduces exactly this throw at boot through both read sites.
      expect(() => readScip(corrupt.scipPath)).toThrow()
    } finally {
      corrupt.cleanup()
    }
  })
})
