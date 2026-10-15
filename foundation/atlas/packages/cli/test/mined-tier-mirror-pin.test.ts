// @atlas/cli — test/mined-tier-mirror-pin.test.ts  (MINED_TIER MUST NOT DRIFT across the layer boundary)
//
// `MINED_TIER` has ONE true source — `packages/cli/src/mine-staging.ts` — and ONE unavoidable mirror:
// `packages/adapter-io/src/reverify-store.ts`'s tamper-binding (c) LITERALLY re-types `'T2'` because
// `adapter-io` cannot import `@atlas/cli` (`cli` depends on `adapter-io`; the reverse would be a layer
// cycle, ARCH constitution `adapter-io` → `tools`, never the other way). `e2e-blackbox/test/stage.ts` used
// to carry a THIRD copy; it now imports `MINED_TIER` from `@atlas/cli` directly (this package CAN, and
// does), so it needs no pin of its own.
//
// This test is the mechanical guard the mirror's own doc comment promises: if `MINED_TIER` is ever bumped
// in `mine-staging.ts` without updating `reverify-store.ts`'s copy, THIS test fails — loudly, at the exact
// literal, rather than leaving the reverify-store tamper-binding silently enforcing a STALE tier forever.

import { describe, it, expect } from "vitest"
import { MINED_TIER as CLI_MINED_TIER } from "../src/index.js"
import { MINED_TIER as ADAPTER_IO_MIRROR } from "@atlas/adapter-io"

describe("MINED_TIER mirror pin — @atlas/adapter-io must never silently diverge from the true source", () => {
  it("the reverify-store tamper-binding literal is BYTE-EQUAL to the true `MINED_TIER` source", () => {
    expect(ADAPTER_IO_MIRROR).toBe(CLI_MINED_TIER)
  })

  it("both sides really are the value the mine pipeline stamps — not two constants that happen to agree by accident", () => {
    // Teeth: pin the VALUE too, so a change to BOTH sides in lockstep still tells a reader what moved.
    expect(CLI_MINED_TIER).toBe("T2")
    expect(ADAPTER_IO_MIRROR).toBe("T2")
  })
})
