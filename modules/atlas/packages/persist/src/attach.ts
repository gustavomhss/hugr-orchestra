// @atlas/persist — src/attach.ts  (index-as-attachment over the single CAS — PERSIST-4)
//
// What is attached is the `{hash}` POINTER; the body lives in the CAS, never inlined in a git object.
// Hashing flows ONLY through the SEALED @atlas/kernel `put`/`id` seam, so equal content collapses to one slot.

import type { Hash } from "@atlas/contracts"
import type { CasObject, StoreApi } from "@atlas/kernel"
import { createStore } from "@atlas/kernel"

/** The honest-empty content handle `StoreApi.put` answers for an object the CAS cannot address
 *  (`kernel/store.ts` `asHash('')` — the sole EMPTY sentinel). Matched by EQUALITY on that one value and
 *  nothing wider, exactly as `adapter-io/src/sidecar-commit.ts` matches it: an injected store is free to
 *  answer anything else it likes, and narrowing further would turn this guard into a shape check on a seam
 *  whose shape is the caller's business. */
const CAS_EMPTY = ""

/**
 * A body the CAS REFUSED to address (task #136). A NAMED `Error` carrying the discriminant
 * `unaddressable-cas-object` — the SAME name `adapter-io/src/sidecar-commit.ts` and `@atlas/knowledge`
 * `archive.ts` give this exact situation — so one condition decodes to one value at every door.
 *
 * WHY A REFUSAL AND NOT A SILENT `if (h)`. `index/src/cas.ts` guards the same sentinel by declining to
 * REGISTER the hash, which is right there: its `put` is total by contract and its answer is discarded. Here
 * the unresolvable handle IS the return value. PERSIST-4's whole claim is that carrying the pointer alone is
 * safe BECAUSE the body is in the CAS; a `{hash:''}` is an attachment to nothing. MEASURED before the guard:
 * `attach(<body with a float>)` answered `{ hash: '' }`, `get('')` answered `undefined`, and zero bytes
 * reached disk — the body was silently dropped and the caller was handed a receipt for it.
 */
export class UnaddressableAttachmentError extends Error {
  constructor() {
    super(
      "unaddressable-cas-object: refusing to attach — the CAS could not address this body (its canonical " +
        "form or its JSON serialization does not exist), so the `{hash}` pointer would name bytes that were " +
        "never written. An attachment is pointer-only BECAUSE the body is in the CAS. Nothing was written.",
    )
    this.name = "UnaddressableAttachmentError"
  }
}

/** A CAS pointer — the ONLY thing attached; the content resolves from the CAS by this hash
 *  (PERSIST-4, method-tags-pst:42). */
export interface Pointer {
  readonly hash: Hash
}

/** Index-as-attachment surface (PERSIST-4): `attach(B)` stores the body and yields the `{hash}` pointer
 *  (SCN-PERSIST-4a-1); `get(hash)` resolves the body from the single CAS (SCN-PERSIST-4b-1). */
export interface AttachApi {
  attach(body: CasObject): Pointer
  get(hash: Hash): CasObject
}

/**
 * Construct the attach surface over a single content-addressed store. `attach` returns ONLY the `{hash}`
 * pointer (never the inlined body); `get` resolves the body from that same CAS by its content hash. The
 * store defaults to a fresh sealed `createStore()`; an explicit store lets a caller share one CAS.
 */
export function createAttach(store: StoreApi = createStore()): AttachApi {
  return {
    /** Attach a content body; store it in the CAS (content-keyed via the sealed seam) and return the
     *  hashed `{hash}` pointer — never the body bytes (SCN-PERSIST-4a-1). */
    attach(body: CasObject): Pointer {
      const hash: Hash = store.put(body)
      // The answer is CHECKED, not assumed. `put` is deliberately TOTAL over a value it cannot address — it
      // writes nothing and answers the EMPTY sentinel rather than throwing — so an unchecked read of it hands
      // back a pointer to a body that does not exist. See UnaddressableAttachmentError.
      if (hash === CAS_EMPTY) throw new UnaddressableAttachmentError()
      return { hash }
    },
    /** Resolve the content body from the single CAS by its content hash (SCN-PERSIST-4b-1). Total: a miss
     *  is an honest empty handle (`undefined` widens to the `unknown` CasObject), never a throw. */
    get(hash: Hash): CasObject {
      return store.get(hash) as CasObject
    },
  }
}

// differential-vs-oracle (compile-time): the facet conforms to the co-located frozen AttachApi.
const _apiCheck: AttachApi = createAttach()
void _apiCheck
