// @atlas/adapter-io — test/harness/fix-scip-py.ts
//
// PY companion to the shared `fix-scip.ts` harness (campaign-9.1 slice) — the recorded per-language
// `.scip` for the SECOND indexed language (`scip-python` over `api/service.py`), used by the multi-
// language dispatch+merge SCNs (SCN-ADAPTER-3a/3b/3c). It mirrors `fix-scip.ts`'s controlled
// `create(IndexSchema,…)/serializeSCIP` construction so the reader under test decodes real recorded
// bytes — NOT a live `scip-python` invocation (absent in CI ⇒ flaky). The fixture strategy is RECORDED:
// feed this `.scip` through `readScip` → `mergeScip`, exactly like the DONE `readScip` suite.
//
// The `.scip` corpus (exactly one document, exactly one occurrence — no more):
//   api/service.py : DEFINITION of `service.py/compute().`
// The merge with the ts `fix.scip` is what surfaces both languages' symbols in one `ScipOutput`; the
// build derives the ts resolvable edge from the ts docs and leaves this py definition as a symbol with
// no in-index reference (its own consumer edge is a downstream/e2e concern, not this WP).

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

/** The one symbol in the py corpus (exported so SCN tests name it without magic strings). */
export const SYM_COMPUTE = "service.py/compute()."

/**
 * The conformance oracle: the exact `ScipOutput` a faithful reader MUST project from the py `.scip` —
 * one document `api/service.py` carrying the single `definition` occurrence for `compute`, and nothing
 * else. No synthesized cross-language edge to the ts corpus.
 */
export const expectedPyScipOutput: ScipOutput = {
  documents: [
    {
      relativePath: "api/service.py",
      occurrences: [{ symbol: SYM_COMPUTE, role: "definition" }],
    },
  ],
}

export interface FixScipPy {
  /** Absolute path to the serialized `.scip` protobuf on disk. */
  readonly scipPath: string
  /** Remove the temp file. Call in an `afterEach`/`finally`. */
  cleanup(): void
}

/**
 * Serialize the controlled minimal py SCIP index to a fresh temp `.scip` file and return its path + a
 * `cleanup()`. Deterministic: identical bytes every call. The reader under test decodes THIS file — it
 * never sees the construction below.
 */
export function makeFixScipPy(): FixScipPy {
  const index = create(IndexSchema, {
    metadata: create(MetadataSchema, {
      projectRoot: "file:///fix-repo",
      toolInfo: create(ToolInfoSchema, { name: "atlas-fixture-py", version: "0" }),
    }),
    documents: [
      create(DocumentSchema, {
        relativePath: "api/service.py",
        occurrences: [create(OccurrenceSchema, { symbol: SYM_COMPUTE, symbolRoles: SymbolRole.Definition })],
      }),
    ],
  })
  const dir = mkdtempSync(join(tmpdir(), "atlas-fix-scip-py-"))
  const scipPath = join(dir, "index.scip")
  writeFileSync(scipPath, serializeSCIP(index))
  return { scipPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
