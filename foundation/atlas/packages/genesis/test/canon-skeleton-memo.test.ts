// @atlas/genesis — test/canon-skeleton-memo.test.ts  (PERF waste-audit 2026-08-23 — the canonicalise memo)
//
// The controller's `plan` leg canonicalises the skeleton TWICE per pass (once in `createScan.scan`, once in
// `createMine`'s `mine()`), and `createSkeletonSource` hands back the SAME raw `Skeleton` object per (repo,rev),
// so the deep-sort ran 6× per default 3-arm run over identical input. `canonicalizeSkeleton` is now memoized by
// INPUT-skeleton object identity. These tests pin it and are mutation-verified: drop the `WeakMap` and the two
// calls return distinct (though deep-equal) objects.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { Skeleton } from "../src/types.js"
import { canonicalizeSkeleton } from "../src/rank.js"

function node(): Skeleton["axes"]["spatial"] {
  return { axis: "spatial", level: "file", key: ".", subtreeHash: asSubtreeHash("st-root"), children: [], objects: [] }
}
const SK: Skeleton = {
  axes: { spatial: node(), territory: node(), dependency: node(), edges: [] },
  manifest: { territories: [] },
}

describe("canonicalizeSkeleton — MEMOIZED by input-skeleton identity (PERF)", () => {
  it("two calls on the SAME raw skeleton return the SAME canonical object (the deep-sort runs once)", () => {
    expect(canonicalizeSkeleton(SK)).toBe(canonicalizeSkeleton(SK))
  })
  it("a DIFFERENT raw skeleton gets its own canonicalisation (keys on identity, not value)", () => {
    const other: Skeleton = {
      axes: { spatial: node(), territory: node(), dependency: node(), edges: [] },
      manifest: { territories: [] },
    }
    expect(canonicalizeSkeleton(other)).not.toBe(canonicalizeSkeleton(SK))
    // still VALUE-equal — the memo changes identity-sharing, never output
    expect(canonicalizeSkeleton(other)).toEqual(canonicalizeSkeleton(SK))
  })
})
