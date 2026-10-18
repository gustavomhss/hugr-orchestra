// @atlas/kernel — src/canonical.ts  (canonicalForm + id — content-addressed object identity)
//
// The RFC-8785/JCS-subset preimage (KERNEL-1): keys sorted, strings NFC, one fixed escape, floats
// forbidden. INVARIANT: mutable side-indexes (grounding/status/freshness) are EXCLUDED at every level
// (KERNEL-8), and `id` reaches the digest ONLY through the encoder seam (KERNEL-2a) — no local primitive.
//
// TERMINOLOGY, stated because the shorthand above is misleading if read literally: RFC 8785 (JCS) itself
// deliberately does NOT Unicode-normalize. Atlas §3.2 ADDS NFC to the JCS rule set, so this preimage is
// JCS-PLUS-NFC, not a subset of JCS. The addition is RATIFIED, not incidental — REQ-KERNEL-1a and the
// held-out golden SCN-KERNEL-1a-2 both require the decomposed presentation of a key to reach the SAME id
// as the composed one, and SCN-KERNEL-1c-1 names "the code omits NFC normalization" as the archetypal
// build-failing divergence. The deliberate PRICE of that choice: `id` is NOT injective over JS strings —
// "café" (U+00E9) and "café" (U+0065 U+0301) are `!==` in JavaScript but share one content hash. That buys
// "never two CAS objects for one fact" across editors/filesystems that differ in Unicode form (macOS being
// the obvious one) and costs the ability to address the two presentations apart. Changing it is a spec
// amendment (REQ-KERNEL-1a + a held-out gate), NOT a local code decision.

import type { Hash } from "@atlas/contracts"
import type { CasObject } from "./types.js"
import { defaultEncoder } from "./encoder.js"

/**
 * The canonical-form contract (frozen): the §3.2 RFC-8785/JCS-subset preimage every encoder reproduces
 * byte-for-byte (KERNEL-1); `id = hash(canonicalForm(obj))` is the only sanctioned identity computation.
 */
export interface CanonicalApi {
  /** The RFC-8785/JCS-subset canonical preimage bytes (sorted keys, NFC, no floats). The bytes handed
   *  to the encoder seam; MUST exclude mutable side-indexes (KERNEL-8). (atlas-kernel:39-41) */
  canonicalForm(obj: CasObject): Uint8Array
  /** `Encoder.hash(canonicalForm(obj))` — content-addressed identity; MUST NOT be hand-rolled
   *  (KERNEL-1). (atlas-kernel:39-41, 98) */
  id(obj: CasObject): Hash
}

/** Mutable side-indexes excluded from the canonical preimage (KERNEL-8) — recomputed, never a key. */
const SIDE_INDEX: ReadonlySet<string> = new Set(["grounding", "status", "freshness"])

const UTF8 = new TextEncoder()

/** Serialize one JSON value into its canonical string form. Recursive; total over JSON except that a
 *  non-integer / non-finite number is a canonical-form violation and throws (floats forbidden). */
function serialize(v: unknown): string {
  if (v === null || v === undefined) return "null"
  switch (typeof v) {
    case "boolean":
      return v ? "true" : "false"
    case "number":
      if (!Number.isFinite(v) || !Number.isInteger(v)) {
        throw new Error("canonical-form violation: floats forbidden (non-integer/non-finite number)")
      }
      return String(v)
    case "string":
      // NFC + one fixed escape policy (JSON string escaping).
      return JSON.stringify(v.normalize("NFC"))
    case "object": {
      if (Array.isArray(v)) return `[${v.map(serialize).join(",")}]`
      const o = v as Record<string, unknown>
      // Side-indexes (KERNEL-8) and `undefined`-valued keys are dropped FIRST: a key that never reaches the
      // preimage cannot collide in it, so the guard below prices only keys that are actually serialized.
      const present = Object.keys(o).filter((k) => !SIDE_INDEX.has(k) && o[k] !== undefined)
      // FAIL-CLOSED on an NFC key collision (KERNEL-1; functional-surface.md "a fact's canonical preimage
      // has a … key-order … divergence ⇒ fail-closed reject … never emit two CAS objects for one fact").
      //
      // Why this is a TOOTH and not defence-in-depth. `Object.keys` returns DISTINCT strings, but NFC is not
      // injective, so two distinct JS keys can normalize to one. Without this guard both survive into
      // `entries`, the sort comparator returns 0 for the pair, and V8's stable sort therefore preserves their
      // INSERTION order — emitting a duplicate-key preimage whose byte order depends on how the object was
      // built. MEASURED on the base commit: `{}` filled "café"(NFC)→1 then "café"(NFD)→2 hashed
      // bcee1c10…, and the same logical object filled in the other order hashed a065e84a… . Two digests for
      // one logical value is a canonicalizer that is not canonical, and it is the exact "two CAS objects for
      // one fact" fork KERNEL-1 forbids — reached from the opposite direction to the float/escape splits.
      //
      // Rejecting (rather than picking a winner) is the spec's mandated disposition and the only sound one:
      // the two keys are genuinely different data, so any tie-break would SILENTLY DISCARD one field.
      // Throwing makes the order-dependent preimage UNREACHABLE rather than merely unlikely.
      const seen = new Set<string>()
      const entries: (readonly [string, unknown])[] = []
      for (const k of present) {
        const nk = k.normalize("NFC")
        if (seen.has(nk)) {
          throw new Error(
            `canonical-form violation: NFC key collision on ${JSON.stringify(nk)} — two distinct keys ` +
              "normalize to one, so the preimage would depend on insertion order",
          )
        }
        seen.add(nk)
        entries.push([nk, o[k]] as const)
      }
      // Every key is now distinct, so the comparator never returns 0 and the order is total — the sorted
      // preimage is a function of the key SET alone, independent of `Object.keys` enumeration order.
      entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      return `{${entries.map(([k, val]) => `${JSON.stringify(k)}:${serialize(val)}`).join(",")}}`
    }
    default:
      // bigint / symbol / function are not JSON — a canonical-form violation.
      throw new Error(`canonical-form violation: unsupported value type ${typeof v}`)
  }
}

/**
 * The RFC-8785/JCS-subset canonical preimage bytes (sorted keys, NFC, floats forbidden, one fixed escape),
 * with the mutable side-indexes excluded (KERNEL-8). These are the exact bytes handed to the encoder seam.
 */
export function canonicalForm(obj: CasObject): Uint8Array {
  return UTF8.encode(serialize(obj))
}

/**
 * Content-addressed identity: `id = Encoder.hash(canonicalForm(obj))` (KERNEL-1), reached only through the
 * encoder seam (KERNEL-2a). Never hand-rolled — a caller-supplied id that ≠ this value is not the object's
 * identity.
 */
export function id(obj: CasObject): Hash {
  return defaultEncoder.hash(canonicalForm(obj))
}
