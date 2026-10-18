// @atlas/adapter-io — test/harness/forge-scip.ts
//
// THE ADVERSARY'S SCIP WRITER. `.atlas/index.scip` is the one governed input that is DELIBERATELY EXCLUDED
// from the provenance tripwire (`store-provenance.ts` `isDurableStorePath`) — it is a build input and is
// legitimately git-TRACKED, so a repository can SHIP one and every reader will consume it. This harness
// writes a maximally hostile one: the attacker picks every `relativePath`, every `symbol`, every role bit,
// every source RANGE, the document TEXT, the per-document `SymbolInformation` (display name +
// documentation), and the index METADATA (`projectRoot`, tool name/version).
//
// It is the twin of `fix-scip.ts` (the honest recorded fixture) and shares its schema: both encode with the
// same `@c4312/scip` `serializeSCIP` the product's `readScip` decodes with, so what lands on disk is a
// REAL, decodable SCIP protobuf — not garbage (garbage is already covered by `scip-corrupt-guard.test.ts`,
// which pins the degrade-to-empty path). A forgery that fails to decode proves nothing: it never reaches
// the axes at all. This one decodes cleanly and is believed.
//
// SYNTHETIC: every path, symbol and hash below is invented for this suite. Nothing here is mined from a
// real repository and nothing is written outside `os.tmpdir()`.

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
  SymbolInformationSchema,
  SymbolRole,
} from "@c4312/scip"

/** One occurrence the adversary plants: a symbol NAME, a role, and a source RANGE it claims to cover. */
export interface ForgedOccurrence {
  readonly symbol: string
  /** `true` ⇒ encoded with `SymbolRole.Definition`; `false` ⇒ a bare reference (roles `0`). */
  readonly definition: boolean
  /** The SCIP `range` (`[startLine, startCol, endLine, endCol]`) — attacker-chosen, deliberately absurd. */
  readonly range?: readonly number[]
}

/** One document the adversary plants: a repo-relative path it claims, its occurrences, and its "text". */
export interface ForgedDocument {
  readonly relativePath: string
  readonly occurrences: readonly ForgedOccurrence[]
  /** The document TEXT field — SCIP lets an indexer ship the source it indexed. Attacker-chosen. */
  readonly text?: string
}

/** A forged `.atlas/index.scip` on disk. */
export interface ForgedScip {
  /** Absolute path to the serialized `.scip` protobuf. */
  readonly scipPath: string
  /** Remove the temp dir holding it. */
  cleanup(): void
}

/** Serialize a hostile SCIP index to `bytes` — every field the schema offers, filled by the adversary. */
export function forgedScipBytes(documents: readonly ForgedDocument[]): Uint8Array {
  const index = create(IndexSchema, {
    // METADATA the attacker controls end to end. `projectRoot` names a repo that is not this one.
    metadata: create(MetadataSchema, {
      projectRoot: "file:///not/the/repo/being/indexed",
      toolInfo: create(ToolInfoSchema, { name: "scip-typescript", version: "99.99.99" }),
    }),
    documents: documents.map((d) =>
      create(DocumentSchema, {
        relativePath: d.relativePath,
        ...(d.text !== undefined ? { text: d.text } : {}),
        occurrences: d.occurrences.map((o) =>
          create(OccurrenceSchema, {
            symbol: o.symbol,
            symbolRoles: o.definition ? SymbolRole.Definition : 0,
            range: [...(o.range ?? [0, 0, 0, 0])],
          }),
        ),
        // Per-document symbol table: display names + documentation the adversary authors freely.
        symbols: d.occurrences.map((o) =>
          create(SymbolInformationSchema, {
            symbol: o.symbol,
            displayName: `FORGED ${o.symbol}`,
            documentation: ["authored by the adversary, not by an indexer"],
          }),
        ),
      }),
    ),
  })
  return serializeSCIP(index)
}

/** Write {@link forgedScipBytes} to a fresh temp `index.scip` and return its path + `cleanup()`. */
export function forgeScip(documents: readonly ForgedDocument[]): ForgedScip {
  const dir = mkdtempSync(join(tmpdir(), "atlas-forged-scip-"))
  const scipPath = join(dir, "index.scip")
  writeFileSync(scipPath, forgedScipBytes(documents))
  return { scipPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
