// @atlas/kernel — src/portable.ts  (OKF open-JSON export/import of the CAS — KERNEL-6)
//
// Portability / no lock-in (KERNEL-6): the CAS exports to a self-contained OPEN JSON (OKF) dump that
// replays 1:1 into a FRESH store — no proprietary encoding, no host dependency (A-8). INVARIANT: keys
// emitted sorted (deterministic); `import` re-mints keys via `asHash` and FAILS CLOSED on a malformed bundle.

import type { Hash } from "@atlas/contracts"
import type { Cas, CasObject } from "./types.js"
import { asHash } from "./brand.js"
import { id } from "./canonical.js"
import { eventId } from "./log.js"

/**
 * Portability / no lock-in (frozen, KERNEL-6): the CAS exports to open JSON that replays 1:1 into a fresh
 * store — no proprietary encoding, no host dependency. (atlas-kernel:104-105, 59-60)
 */
export interface PortableApi {
  /** Open-JSON CAS dump (A-8). (atlas-kernel:104) */
  export(): string
  /** Replays 1:1 into a fresh store. (atlas-kernel:105) */
  import(json: string): Cas
}

/** OKF envelope tag + version — the ONLY literals the serializer adds (both host-independent). */
const OKF_FORMAT = "atlas-okf"
const OKF_VERSION = 1

/** The on-the-wire shape of an OKF dump: a self-describing open-JSON envelope over the CAS entries. */
interface OkfBundle {
  readonly format: string
  readonly version: number
  readonly objects: Record<string, CasObject>
}

/**
 * Serialize the whole CAS to a self-contained open-JSON OKF dump. Keys are emitted in sorted order, so
 * the dump is byte-stable regardless of `Map` insertion order (deterministic, replayable). Every entry is
 * carried verbatim — nothing is dropped, no host path / external ref / proprietary encoding is introduced.
 */
export function exportCas(cas: Cas): string {
  const objects: Record<string, CasObject> = {}
  for (const key of [...cas.keys()].sort()) {
    objects[key] = cas.get(key) as CasObject
  }
  const bundle: OkfBundle = { format: OKF_FORMAT, version: OKF_VERSION, objects }
  return JSON.stringify(bundle)
}

/**
 * Lower-hex BLAKE3 shape — the same gate the adapter CAS read applies before it touches the filesystem
 * (`adapter-io/src/store.ts`). Here it is a TOOTH, and it is also the SCOPE of the integrity check below,
 * so it is worth being exact about what it does and does not buy.
 *
 * A key of this shape is one that PRESENTS ITSELF AS A CONTENT ADDRESS: it is exactly the shape a real
 * `id()` / `eventId()` digest has, and therefore exactly the shape that can be RESOLVED by a downstream
 * `cas.get(someHash)`. Impersonating a stored fact REQUIRES such a key — a bundle entry filed under
 * `"id-f001"` or `"abcd"` answers no hash lookup and so can never be served in place of a real fact.
 *
 * That is why the re-derivation below is scoped to hash-shaped keys rather than demanded of every key.
 * The OKF door is also used, by documented convention, over maps whose keys are NOT content addresses:
 * the KERNEL-5 / PERSIST-2 goldens key their event logs by SYMBOLIC handles (`id-f001`), stated in each
 * fixture header ("`id-…`/`ch-…`/`nk-…` handles are SYMBOLIC — assertions are RELATIONAL"). Requiring a
 * true content address of EVERY key is the stricter and ultimately correct reading of KERNEL-3, but it
 * invalidates that ratified fixture convention — MEASURED: 13 tests across 7 files, including 3 held-out
 * gate files and two packages outside this one. That is a ratified-amendment decision, not a local one; it
 * is escalated, not absorbed here.
 */
const HASH_SHAPE = /^[0-9a-f]{64}$/

/** Structural predicate for an EventLog entry (mirrors `isEvent` in log.ts, which is module-private). */
function isEventEntry(v: unknown): v is { id: string; seq: number } {
  if (v === null || typeof v !== "object") return false
  const e = v as Record<string, unknown>
  return (
    typeof e["id"] === "string" &&
    typeof e["seq"] === "number" &&
    Number.isFinite(e["seq"]) &&
    typeof e["contentHash"] === "string" &&
    typeof e["fresh"] === "boolean" &&
    Array.isArray(e["supersedes"])
  )
}

/**
 * Is `key` genuinely the content address of `value` under one of the kernel's SEALED identity seams?
 *
 * There are exactly two, and this door is legitimately used for both maps:
 *   • a `Cas`      — keyed by `id(value)`                                      (canonical.ts)
 *   • an `EventLog`— keyed by `eventId(value)` (drops the `id` field, pins `seq`) (log.ts, KERNEL-9a)
 * `persist/src/reconstruct.ts` replays an EventLog through `importCas(exportCas(...))`, so a guard that
 * only knew `id` would reject every event log in production. MEASURED on the base commit: for one event,
 * `eventId` = 0e40705c… while `id` of the same object = f7e2afd9… — they are never equal.
 *
 * The event branch additionally requires `value.id === key`: `eventId` deliberately ignores `seq` and the
 * `id` FIELD, so without this a bundle could carry a self-declared `id` that disagrees with its own key.
 * (`seq` staying unauthenticated is by design — atlas-kernel.md makes it "a local ordering hint … never an
 * object key and never a merge discriminator", explicitly outside the identity algebra.)
 *
 * TOTAL: `id`/`eventId` THROW on a canonical-form violation (a float, an unsupported type, an NFC key
 * collision). A hostile bundle must not be able to convert that into a raw kernel stack trace, so the throw
 * is caught and folded into the same fail-closed rejection as every other malformed input.
 */
function addresses(key: string, value: unknown): boolean {
  try {
    if (id(value as CasObject) === key) return true
    return isEventEntry(value) && value.id === key && eventId(value as never) === key
  } catch {
    return false // uncanonicalizable body ⇒ it addresses nothing ⇒ reject
  }
}

/**
 * Replay an OKF dump 1:1 into a FRESH store (a brand-new `Map`), preserving each content-addressed key.
 * Fails closed (throws) on a malformed bundle — non-JSON text, a missing/typed-wrong envelope, a non-object
 * `objects` map, or an entry whose key IS NOT the content address of its value — rather than returning a
 * partial or fabricated store.
 *
 * WHY THE RE-HASH (KERNEL-1/KERNEL-3). Without it this door is a hole in content-addressing: an OKF dump is
 * ordinary text on disk or in a PR, and an attacker who edits a claim string while leaving the key untouched
 * gets the forged body admitted under the honest fact's address. REPRODUCED on the base commit: the honest
 * claim addressed ae4da649…, the body was edited to say "$99M" (whose true address is 9b39ab4f…), and the
 * pre-fix `importCas` returned a store mapping ae4da649… → the $99M body. It is reachable in production via
 * `persist/src/source.ts` `importStore`. KERNEL-3 requires every object to be keyed BY ITS HASH, so such a
 * store is not merely wrong, it is a `Cas` value that violates the type's representation invariant — and
 * every downstream reader that trusts the key (rather than re-deriving it) inherits the forgery.
 *
 * The model is COPIED from `adapter-io/src/store.ts`, whose CAS read already re-hashes on every get
 * ("bytes whose `id !== key` read as absent"). This door is the kernel's own portable entry point and had
 * no such check; the adapter's discipline is the standard, not the exception.
 *
 * SCOPE, stated plainly so it cannot be mistaken for more than it is: this verifies every entry filed under
 * a hash-shaped key — which is every entry that a `cas.get(<digest>)` can ever resolve, and therefore every
 * entry that can be served in place of a real fact. It does NOT verify entries filed under non-address keys.
 *
 * ALL-OR-NOTHING, deliberately — one bad entry rejects the WHOLE bundle. The adapter's sidecar reader makes
 * the same call for the same reason: dropping only the offending ENTRY would hand whoever can write the dump
 * a SELECTIVE "make this fact disappear" primitive, and a silently-partial store is exactly the "partial or
 * fabricated store" this function already promises never to return. (The adapter's `get` returns a miss
 * instead of throwing because it reads ONE object and must stay total for a boot-time projection; `import`
 * is a bundle-level door that already throws on every other malformed input, so it throws here too.)
 */
export function importCas(json: string): Cas {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("malformed OKF bundle: not valid JSON")
  }
  if (!isOkfBundle(parsed)) {
    throw new Error("malformed OKF bundle: missing or invalid OKF envelope")
  }
  const cas: Cas = new Map<Hash, CasObject>()
  for (const key of Object.keys(parsed.objects)) {
    const value = parsed.objects[key] as CasObject
    // A key that PRESENTS as a content address MUST BE one. A non-hash-shaped key resolves no hash lookup,
    // so it cannot impersonate a stored fact; it is carried verbatim (see HASH_SHAPE for why, and for the
    // stricter reading that is escalated rather than taken here).
    if (HASH_SHAPE.test(key) && !addresses(key, value)) {
      throw new Error(
        `malformed OKF bundle: entry ${key} is not addressed by its content — the stored key is not the ` +
          "digest of the stored value (tampered or corrupt dump)",
      )
    }
    cas.set(asHash(key), value)
  }
  return cas
}

/** Structural guard for the OKF envelope — the fail-closed predicate `import` gates on. */
function isOkfBundle(v: unknown): v is OkfBundle {
  if (typeof v !== "object" || v === null) return false
  const b = v as Record<string, unknown>
  return (
    b.format === OKF_FORMAT &&
    typeof b.version === "number" &&
    typeof b.objects === "object" &&
    b.objects !== null &&
    !Array.isArray(b.objects)
  )
}

/**
 * Bind a CAS snapshot to the frozen `PortableApi` — `export()`/`import(json)` as the
 * store-attached form the contract names. Thin adapters over the free functions above.
 */
export function makePortable(cas: Cas): PortableApi {
  return {
    export: (): string => exportCas(cas),
    import: (json: string): Cas => importCas(json),
  }
}
