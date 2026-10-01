// @atlas/adapter-io — src/poke-file.ts   (WP-9.x-POKE — TOOLS-14 / PUSH_TIER = 'poke-as-file')
//
// The poke-as-file transport MATERIALIZER — the third transport, alongside cli + mcp. At a phase boundary
// the orchestrator PUSHES a fresh injection surface to a `Read`-only seat with NO tool grant (TOOLS-11-b,
// PUSH_GRANTS_REQUIRED == 0): Atlas WRITES the `Pack | Poke` to a file that the seat consumes purely by
// `Read`. This facet owns ONLY that write. It CONSUMES the frozen `PhasePushSource` port (@atlas/tools) —
// it never assembles the pack (that is the retrieval `own_<unit>` / `atlas-query` axis, injected upstream).
//
// Byte-identity is the whole contract: the serialization goes through the SEALED kernel `canonicalForm`
// seam ALONE (KERNEL-1: RFC-8785/JCS-subset — sorted keys, NFC, one fixed escape, floats forbidden). No
// ad-hoc key order, no clock, no nonce, no random reaches the content — the same `(source output, seat,
// outDir)` yields a byte-identical file every run.
//
// ── REFERENCE MODEL — NO PRODUCTION CALLERS ──────────────────────────────────────────────────────────
// Everything above describes a transport that NOTHING CONSTRUCTS. No module in `packages/*/src` calls
// `materializePoke` or `pokeFilePath`, or reads `POKE_FILE_EXT`. The composition root never wires it, no
// CLI command reaches it, and MCP does not advertise it — this is the open gap tracked as task #36.
//
// It sits in the outer ring beside genuinely shipped adapters (`store.ts`, `governed-emit.ts`,
// `run-git.ts`), which is exactly where a reader is most likely to assume it runs. It does not.
//
// The `PhasePushSource` port it imports below is the ONLY thing keeping
// `packages/tools/src/transport.ts` type-reachable — so the two reference models are each other's sole
// remaining tie to the tree, and that tie is a type, not a call.
//
// Declared in the ledger at `harness/gates/reference-model-guard.mjs`.

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { canonicalForm } from "@atlas/kernel"
import type { PhasePushSource } from "@atlas/tools"

/** The fixed artifact-name law: one poke file per seat, `<seat>.poke.json`. The `.poke.json` suffix names
 *  the poke-as-file transport; the `<seat>` stem makes the path a pure function of the seat (no timestamp,
 *  no counter) so re-materializing overwrites the SAME path with byte-identical bytes. */
export const POKE_FILE_EXT = ".poke.json"

/** The deterministic artifact path for a seat under `outDir` — `<outDir>/<seat>.poke.json`. Pure: a
 *  function of `(outDir, seat)` alone, no clock/random, so the write target is stable across runs. */
export function pokeFilePath(outDir: string, seat: string): string {
  return join(outDir, `${seat}${POKE_FILE_EXT}`)
}

/**
 * Materialize the phase-boundary PUSH surface as a poke-as-file artifact (TOOLS-14 / PUSH_TIER).
 *
 * Calls the injected `source(seat, scope)` → `Pack | Poke`, serializes it through the SEALED kernel
 * `canonicalForm` seam (KERNEL-1: sorted keys, NFC, floats forbidden), and writes those EXACT preimage
 * bytes to the deterministic path `<outDir>/<seat>.poke.json`. `outDir` is created if missing. Returns the
 * written path.
 *
 * TOTAL + deterministic: no clock, no nonce, no random reaches the content — the same `(source output,
 * seat, outDir)` yields a byte-identical file. Never throws on a well-formed source result (a well-formed
 * `Pack`/`Poke` carries only integer counts, so the floats-forbidden guard never trips). Read-only PUSH:
 * the ONLY effect is writing the artifact the orchestrator will `Read` — no store write path is opened, no
 * governance is computed here (the surface is decided upstream by the injected source).
 */
export function materializePoke(source: PhasePushSource, seat: string, scope: string, outDir: string): string {
  // Ask the injected source for THIS seat/scope's fresh surface — a `Pack | Poke`. Nothing is invented
  // here; this facet decides only WHERE and in WHICH bytes the surface lands, never WHAT it contains.
  const surface = source(seat, scope)
  // Canonical preimage bytes via the SEALED seam ALONE — sorted keys, deterministic, byte-identical. No
  // local key ordering / JSON.stringify: identity flows through `canonicalForm` (KERNEL-1), nothing else.
  const bytes = canonicalForm(surface)
  const path = pokeFilePath(outDir, seat)
  // Create `outDir` if missing (recursive; a no-op when it already exists). This is the only filesystem
  // reach beyond the artifact write — the PUSH tier WRITES the file the seat will `Read`, nothing more.
  mkdirSync(outDir, { recursive: true })
  writeFileSync(path, bytes)
  return path
}
