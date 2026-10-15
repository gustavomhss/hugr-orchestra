// @atlas/kernel — src/store.ts  (the single content-addressed store — KERNEL-3 / KERNEL-7)
//
// ONE CAS: every object keyed by its content hash in a single `Map<Hash, CasObject>` (KERNEL-3). INVARIANT:
// identity is minted ONLY through the sealed seam (`id` → canonicalForm → encoder) ⇒ content-keyed dedup;
// both entry points are TOTAL — a miss/malformed put yields `undefined`/an honest empty key, never a throw.

import type { Hash } from "@atlas/contracts"
import type { CasObject } from "./types.js"
import { id } from "./canonical.js"
import { asHash } from "./brand.js"

/**
 * The single content-addressed store (frozen, KERNEL-3): every object keyed by its hash in ONE CAS.
 * `put` = canonicalize → hash → store, idempotent on equal bytes; `get` is total (miss ⇒ `undefined`,
 * never a throw, KERNEL-7). (atlas-kernel:99-100, 108-109)
 */
export interface StoreApi {
  /** Canonicalize → hash → store. Idempotent: putting bytes that already exist returns the same
   *  `Hash` and stores nothing new. (atlas-kernel:99, 108) */
  put(obj: CasObject): Hash
  /** Resolve by key; total (miss ⇒ `undefined`, no throw). (atlas-kernel:100) */
  get(h: Hash): CasObject | undefined
}

/** The honest-empty content handle: a malformed put stores nothing and returns this non-resolving key. */
const EMPTY: Hash = asHash("")

/** Construct THE single content-addressed store. One backing `Map` — no second store, ever. */
export function createStore(): StoreApi {
  const cas = new Map<Hash, CasObject>()
  return {
    put(obj: CasObject): Hash {
      let key: Hash
      try {
        // canonicalize → hash → store, via the sealed seam; the caller never supplies the key.
        key = id(obj)
      } catch {
        // malformed input (float / bigint / symbol / cyclic) → honest empty, never a throw (KERNEL-7b).
        return EMPTY
      }
      // content-keyed dedup: equal content already present ⇒ store nothing new, return the same Hash.
      if (!cas.has(key)) cas.set(key, obj)
      return key
    },
    get(h: Hash): CasObject | undefined {
      // total: a miss is `undefined`, never a throw (KERNEL-7a).
      return cas.get(h)
    },
  }
}
