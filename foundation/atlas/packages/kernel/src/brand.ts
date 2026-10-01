// @atlas/kernel — src/brand.ts  (THE branded-value MINT boundary — the one runtime file)
//
// @atlas/contracts declares `Hash | SubtreeHash | NodeKey` as branded strings but is types-only. The
// kernel is the mint boundary: these three constructors are the ONLY sanctioned cast sites for the
// brands (the ~3 mint sites named in @atlas/contracts hash.ts). Do not cast to a brand anywhere else.

import type { Hash, SubtreeHash, NodeKey } from "@atlas/contracts"

export const asHash = (s: string): Hash => s as Hash
export const asSubtreeHash = (s: string): SubtreeHash => s as SubtreeHash
export const asNodeKey = (s: string): NodeKey => s as NodeKey
