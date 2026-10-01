// @atlas/adapter-io — test/poke-file.test.ts   (WP-9.x-POKE — TOOLS-14 / PUSH_TIER = 'poke-as-file')
//
// Acceptance suite for the poke-as-file MATERIALIZER (the third transport). A FAKE `PhasePushSource` is
// injected (the real `own_<unit>` / `atlas-query` axis is wired at the composition-root WP), and we pin the
// EXACT canonical bytes it lands on disk — the whole contract is byte-identity through the SEALED kernel
// `canonicalForm` seam (KERNEL-1: sorted keys, NFC, floats forbidden). Goldens are NAMED string literals so
// a mutant that reorders keys / drops a field / writes a non-deterministic path flips a specific case RED.
//
// Harness (per store.test.ts convention): a temp outDir per test + afterEach cleanup.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Pack } from "@atlas/contracts"
import type { PhasePushSource } from "@atlas/tools"
import { materializePoke, pokeFilePath } from "../src/poke-file.js"

let tmp: string | undefined

/** A fresh temp workspace root; outDir is derived UNDER it (often not-yet-created) so we exercise mkdir. */
function freshRoot(): string {
  tmp = mkdtempSync(join(tmpdir(), "atlas-poke-"))
  return tmp
}

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

// ── the canned surfaces the FAKE source returns (fixed values — no clock/random) ────────────────────────────
const FAKE_PACK: Pack = {
  territory: "atlas/tools",
  axisHash: "h_axis_01" as Pack["axisHash"],
  invariants: [
    {
      nodeId: "atlas/tools:push" as Pack["invariants"][number]["nodeId"],
      tier: "T1",
      claim: "push reaches a Read-only seat with no grant",
      freshness: "FRESH",
    },
  ],
  advisory: [],
  advisoryDropped: 0,
  tokenEstimate: 42,
  stale: false,
}

/** A FAKE `PhasePushSource` that always returns the canned `Poke` — the injected seam under test. */
const fakePokeSource: PhasePushSource = (_seat, _scope) => ({
  scope: "atlas/tools/transport",
  pack: FAKE_PACK,
  notice: "poke: push tier is poke-as-file",
})

/** A FAKE `PhasePushSource` that always returns the canned `Pack` (the other payload shape). */
const fakePackSource: PhasePushSource = (_seat, _scope) => FAKE_PACK

// ── NAMED goldens (the EXACT canonical preimage bytes — sorted keys; reorder/drop MUST flip these) ──────────
// [ADR-0013] `advisory` + `advisoryDropped` join the Pack contract, so they join the canonical preimage —
// sorted first, before `axisHash`. Updating the golden IS the point of a named golden: the shape moved by a
// ratified amendment, and the bytes say so instead of a matcher quietly tolerating it.
//
// `PackInvariant.freshness` DOES NOT appear, and that is not an omission — it is KERNEL-8 (`canonical.ts`
// `SIDE_INDEX`), which strips `grounding` / `status` / `freshness` from the canonical preimage AT EVERY
// LEVEL because they are mutable side-indexes, recomputed and never part of identity. So a poke FILE, whose
// bytes ARE the canonical preimage, carries the two bands but NOT the per-row verdict. That is coherent —
// a pack's content address must not change because a cited unit moved — and it is a REAL limit of this one
// transport, recorded here rather than discovered later: the per-row verdict reaches the CLI and MCP doors
// (which render/serialize the live `Pack`), and stops at the content-addressed one.
const G_PACK_CANONICAL =
  '{"advisory":[],"advisoryDropped":0,"axisHash":"h_axis_01","invariants":[{"claim":"push reaches a Read-only seat with no grant","nodeId":"atlas/tools:push","tier":"T1"}],"stale":false,"territory":"atlas/tools","tokenEstimate":42}'
const G_POKE_CANONICAL =
  '{"notice":"poke: push tier is poke-as-file","pack":' + G_PACK_CANONICAL + ',"scope":"atlas/tools/transport"}'

describe("materializePoke — poke-as-file transport materializer (WP-9.x-POKE)", () => {
  it("SCN-POKE-1: writes a Poke to <outDir>/<seat>.poke.json with EXACT canonical bytes (G_POKE_CANONICAL)", () => {
    const outDir = join(freshRoot(), "push") // not-yet-created → exercises mkdir
    const path = materializePoke(fakePokeSource, "weaver-07", "atlas/tools/transport", outDir)

    expect(path).toBe(join(outDir, "weaver-07.poke.json")) // deterministic path law (seat stem, no clock)
    expect(path).toBe(pokeFilePath(outDir, "weaver-07"))
    expect(readFileSync(path, "utf8")).toBe(G_POKE_CANONICAL) // NAMED golden — reorder/drop flips this RED
  })

  it("SCN-POKE-2: writes a Pack (the other payload shape) with EXACT canonical bytes (G_PACK_CANONICAL)", () => {
    const outDir = join(freshRoot(), "push")
    const path = materializePoke(fakePackSource, "binder-02", "atlas/tools", outDir)

    expect(path).toBe(join(outDir, "binder-02.poke.json"))
    expect(readFileSync(path, "utf8")).toBe(G_PACK_CANONICAL) // NAMED golden
  })

  it("SCN-POKE-3: deterministic — re-materializing the same surface yields BYTE-IDENTICAL content + path", () => {
    const outDir = join(freshRoot(), "push")
    const p1 = materializePoke(fakePokeSource, "weaver-07", "atlas/tools/transport", outDir)
    const first = readFileSync(p1)
    const p2 = materializePoke(fakePokeSource, "weaver-07", "atlas/tools/transport", outDir)
    const second = readFileSync(p2)

    expect(p2).toBe(p1) // same seat → same path (overwrite, never a timestamped sibling)
    expect(second.equals(first)).toBe(true) // byte-identical across runs — no clock/nonce in the content
  })

  it("SCN-POKE-4: creates outDir if missing (nested, recursive) — read-only PUSH still lands the artifact", () => {
    const outDir = join(freshRoot(), "a", "b", "c") // deep, not-yet-created
    expect(existsSync(outDir)).toBe(false)
    const path = materializePoke(fakePokeSource, "weaver-07", "atlas/tools/transport", outDir)
    expect(existsSync(path)).toBe(true)
    expect(readFileSync(path, "utf8")).toBe(G_POKE_CANONICAL)
  })

  it("SCN-POKE-5: total — never throws on a well-formed source result (returns the written path)", () => {
    const outDir = join(freshRoot(), "push")
    expect(() => materializePoke(fakePackSource, "seat-x", "scope-y", outDir)).not.toThrow()
  })
})
