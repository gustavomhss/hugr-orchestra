// #99 F3 fixture — the WORST CASE. This doc genuinely calls `asNodeKey` cross-package, but scip-typescript
// emits that cross-package reference as an opaque `local 0` symbol (the collapse). In the reduced .scip this
// file carries ONLY that ONE `reference`-role `local 0` occurrence — stdlib refs are STRIPPED so the collapsed
// local is the SOLE hole (on the full index, stdlib `unresolved` holes already mask it in the oracle/fallback).
// The real caller therefore VANISHES from reverseCallers/holeSources/targetEscapes — the false-PROVEN bug.
import { asNodeKey } from "@atlas/knowledge/brand"

export const KEY = asNodeKey("x")
