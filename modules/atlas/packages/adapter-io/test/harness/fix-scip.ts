// @atlas/adapter-io — test/harness/fix-scip.ts
//
// SHARED FIXTURE HARNESS (campaign-9.1 slice) — the recorded `fix.scip` SCIP index oracle from
// goldens-adapters.md §Fixture universe. FROZEN by the orchestrator: the SCIP / INDEX WPs CONSUME this;
// no WP redefines it.
//
// It is a CONTROLLED, minimal SCIP protobuf (exactly the three occurrences the goldens name — no more),
// serialized at test time with the same `@c4312/scip` schema the reader decodes with. A minimal encoded
// index (not raw scip-typescript output, which would carry dozens of identifier occurrences) is the
// faithful expression of the frozen golden ("exactly those three occurrences, no more"). The reader↔real-
// scip-typescript integration is a separate obligation exercised at the INDEX/e2e layer over a real repo.
//
// The `.scip` corpus:
//   src/util.ts : DEFINITION of `util/greet().`
//   src/app.ts  : REFERENCE to `util/greet().`         (has an in-index definition ⇒ resolvable downstream)
//               : REFERENCE to `util/missingHelper().`  (NO definition anywhere ⇒ dangling, downstream to:null)
// No `util/deletedFn()` symbol; no `app.ts → api/service.py:compute` occurrence/edge.

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
import type { ScipOutput } from "@atlas/index"

/** The three symbols in the corpus (exported so SCN tests name them without magic strings). */
export const SYM_GREET = "util/greet()."
export const SYM_MISSING = "util/missingHelper()."

/**
 * The conformance oracle: the exact `ScipOutput` a faithful reader MUST project from `fix.scip` — the
 * per-document `definition`/`reference` occurrence set, in recorded order, and nothing else. `greet` is a
 * `definition` in util.ts + a `reference` in app.ts; `missingHelper` is a `reference` with no definition
 * anywhere (so it stays unresolved downstream, INDEX-13). No synthesized symbol/edge.
 */
export const expectedScipOutput: ScipOutput = {
  documents: [
    {
      relativePath: "src/util.ts",
      occurrences: [{ symbol: SYM_GREET, role: "definition" }],
    },
    {
      relativePath: "src/app.ts",
      occurrences: [
        { symbol: SYM_GREET, role: "reference" },
        { symbol: SYM_MISSING, role: "reference" },
      ],
    },
  ],
}

export interface FixScip {
  /** Absolute path to the serialized `.scip` protobuf on disk. */
  readonly scipPath: string
  /** Remove the temp file. Call in an `afterEach`/`finally`. */
  cleanup(): void
}

/**
 * Serialize the controlled minimal SCIP index to a fresh temp `.scip` file and return its path + a
 * `cleanup()`. Deterministic: identical bytes every call. The reader under test decodes THIS file — it
 * never sees the construction below.
 */
export function makeFixScip(): FixScip {
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: "file:///fix-repo",
      toolInfo: create(ToolInfoSchema, { name: "atlas-fixture", version: "0" }),
    }),
    documents: [
      create(DocumentSchema, {
        relativePath: "src/util.ts",
        occurrences: [create(OccurrenceSchema, { symbol: SYM_GREET, symbolRoles: SymbolRole.Definition })],
      }),
      create(DocumentSchema, {
        relativePath: "src/app.ts",
        occurrences: [
          create(OccurrenceSchema, { symbol: SYM_GREET, symbolRoles: 0 }),
          create(OccurrenceSchema, { symbol: SYM_MISSING, symbolRoles: 0 }),
        ],
      }),
    ],
  })
  const dir = mkdtempSync(join(tmpdir(), "atlas-fix-scip-"))
  const scipPath = join(dir, "index.scip")
  writeFileSync(scipPath, serializeSCIP(index))
  return { scipPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
