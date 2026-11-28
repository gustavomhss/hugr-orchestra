// @atlas/kernel — src/encoder.ts  (the digest SEAM — the ONLY site that mints a Hash from bytes)
//
// KERNEL-2: the default encoder resolves to BLAKE3; correctness MUST NOT depend on the chosen function
// (swapping it changes only the id bytes). The sole place a raw digest primitive is imported; the
// `Encoder` shape is owned upstream in @atlas/contracts — the kernel supplies only the default instance.

import { blake3 } from "@noble/hashes/blake3"
import { bytesToHex } from "@noble/hashes/utils"
import type { Encoder, Hash } from "@atlas/contracts"
import { asHash } from "./brand.js"

/** Re-export of the seam contract (owned by @atlas/contracts). Kernel is the only site that mints
 *  `Hash` values through this seam; the interface shape is owned upstream. (KERNEL-2) */
export type { Encoder }

/**
 * What the kernel adds beyond the contract `Encoder` (frozen): the default encoder INSTANCE. Per KERNEL-2
 * the default MUST resolve to BLAKE3; correctness MUST NOT depend on the chosen function. No new methods.
 */
export interface EncoderApi {
  /** The kernel's default encoder (BLAKE3). (atlas-kernel:16, KERNEL-2 lines 46-50) */
  readonly encoder: Encoder
}

/**
 * The kernel's default encoder: a lower-hex BLAKE3 digest of the canonical preimage bytes. `asHash` is the
 * sanctioned mint site for the branded `Hash` (src/brand.ts). No configuration switch is exposed here — the
 * seam is swappable by substituting a different `Encoder` at the call boundary, per PROP-KERNEL-2.
 */
export const defaultEncoder: Encoder = {
  hash(bytes: Uint8Array): Hash {
    return asHash(bytesToHex(blake3(bytes)))
  },
}
