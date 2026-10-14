// @atlas/adapter-io — test/scip-raw-cache.test.ts   (DEDUP-COMPOSITION #241 — the raw-decode memo's teeth)
//
// `scip.ts` memoizes the raw `deserializeSCIP` decode per (path, mtime, size) triple (`decodeScipCached`),
// shared by `readScip`, `readScipIndexerName`, and `escape/target-escapes.ts`'s own raw read — so
// `composeRuntime` (compose.ts) and `assembleHandler` (wire.ts), which both read the SAME dump for ONE
// command, decode it ONCE instead of 4-6 times.
//
// A cache keyed on PATH ALONE would be a correctness bug: `.atlas/index.scip` is a build input, not
// durable-store content, and nothing in this ring promises it never changes mid-process (a concurrent
// indexer run racing a long `atlas doctor`/`atlas verify-store`). This suite proves the cache does NOT
// serve stale bytes after the SAME path is REWRITTEN with different content, and separately documents the
// manual mutation that shows the assertion actually bites (the MUTANT the card asked for is not embedded
// here as a local re-implementation — see the note at the bottom for why, and the recorded result of
// actually performing it).

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { create } from "@bufbuild/protobuf"
import {
  serializeSCIP,
  IndexSchema,
  MetadataSchema,
  ToolInfoSchema,
  DocumentSchema,
  OccurrenceSchema,
  SymbolRole,
} from "@c4312/scip"
import { readScip, readScipIndexerName } from "../src/scip.js"

/** Serialize a minimal, real, decodable SCIP index naming `tool` and one definition-occurrence document
 *  at `relativePath` for `symbol` — deliberately a DIFFERENT byte length per distinct `symbol`/`tool`/
 *  `relativePath` combination, so a rewrite is guaranteed to change `size` (never relies on filesystem
 *  mtime resolution alone). */
function encodeScip(tool: string, relativePath: string, symbol: string): Uint8Array {
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: "file:///cache-teeth-fixture",
      toolInfo: create(ToolInfoSchema, { name: tool, version: "0" }),
    }),
    documents: [
      create(DocumentSchema, {
        relativePath,
        occurrences: [create(OccurrenceSchema, { symbol, symbolRoles: SymbolRole.Definition })],
      }),
    ],
  })
  return serializeSCIP(index)
}

let dir: string | undefined
afterEach(() => {
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

describe("the raw SCIP decode memo — a rewrite at the SAME path is NEVER served stale (DEDUP-COMPOSITION #241)", () => {
  it("SCN-CACHE-TEETH-1 — readScip picks up a REWRITE of the SAME path, not the first decode", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-scip-cache-teeth-"))
    const scipPath = join(dir, "index.scip")

    const bytesA = encodeScip("scip-typescript", "src/a.ts", "pkg/symA().")
    const bytesB = encodeScip("scip-typescript", "src/completely-different-longer-path/b.ts", "pkg/symB-longer-name().")
    // NON-VACUITY: the rewrite genuinely changes `size` — the second half of the memo key — so this case
    // cannot pass by accident even on a filesystem whose mtime resolution is too coarse to move on its own.
    expect(bytesA.length).not.toBe(bytesB.length)

    writeFileSync(scipPath, bytesA)
    const first = readScip(scipPath)
    expect(first.documents).toHaveLength(1)
    expect(first.documents[0]?.relativePath).toBe("src/a.ts")
    expect(first.documents[0]?.occurrences[0]?.symbol).toBe("pkg/symA().")

    // Overwrite the SAME path with DIFFERENT content — the exact shape a concurrent indexer run produces.
    writeFileSync(scipPath, bytesB)
    const second = readScip(scipPath)
    // The load-bearing assertion: a cache keyed on path alone would return `first`'s (now stale) bytes here.
    expect(second.documents).toHaveLength(1)
    expect(second.documents[0]?.relativePath).toBe("src/completely-different-longer-path/b.ts")
    expect(second.documents[0]?.occurrences[0]?.symbol).toBe("pkg/symB-longer-name().")
  })

  it("SCN-CACHE-TEETH-2 — readScipIndexerName picks up a REWRITE too (shares the SAME memo as readScip)", () => {
    dir = mkdtempSync(join(tmpdir(), "atlas-scip-cache-teeth-"))
    const scipPath = join(dir, "index.scip")

    const bytesA = encodeScip("atlas-fixture-A", "src/a.ts", "pkg/symA().")
    const bytesB = encodeScip("atlas-fixture-B-longer-tool-name", "src/b.ts", "pkg/symB().")
    expect(bytesA.length).not.toBe(bytesB.length)

    writeFileSync(scipPath, bytesA)
    expect(readScipIndexerName(scipPath)).toBe("atlas-fixture-A")
    // `readScip` ALSO reads this same path first — proving the shared memo does not let one reader's
    // earlier decode leak stale bytes into a DIFFERENT reader after a rewrite.
    expect(readScip(scipPath).documents[0]?.relativePath).toBe("src/a.ts")

    writeFileSync(scipPath, bytesB)
    expect(readScipIndexerName(scipPath)).toBe("atlas-fixture-B-longer-tool-name")
    expect(readScip(scipPath).documents[0]?.relativePath).toBe("src/b.ts")
  })
})

// ── the MUTATION actually performed, recorded rather than embedded ────────────────────────────────────────
//
// Both cases above pin the SHIPPED (path, mtime, size) key. To confirm they are not vacuous, the memo key in
// `scip.ts`'s `decodeScipCached` was manually narrowed to PATH ALONE (dropping the `mtimeMs === stat.mtimeMs
// && size === stat.size` conjunct down to `cached !== undefined`) and this file re-run:
//   SCN-CACHE-TEETH-1 → RED: `second.documents[0].relativePath` read back `'src/a.ts'` (the FIRST decode,
//     served stale across the rewrite) instead of the expected `'src/completely-different-longer-path/b.ts'`.
//   SCN-CACHE-TEETH-2 → RED: `readScipIndexerName(scipPath)` after the second write still read back
//     `'atlas-fixture-A'`.
// The key was restored to (path, mtime, size) immediately after, and `npm run build` + this file were
// re-run GREEN before anything else landed. Not embedded as a local mutant re-implementation (unlike some
// suites in this ring) because the property under test IS the product's own cache-key comparison — a
// faithful local re-implementation of "compare mtime+size" would just be the same three lines restated, so
// the only mutation that says anything is the real one, performed and reverted as above.
