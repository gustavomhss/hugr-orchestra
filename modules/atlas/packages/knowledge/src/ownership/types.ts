import type { Hash } from "@atlas/contracts"

export type OwnershipNeed = "entry" | "ownership" | "maintenance" | "operational" | "flow" | "evidence" | "component"

/** Named external inputs include source blobs, recipe versions, contracts and registered-scope membership. */
export interface OwnershipInput {
  readonly key: string
  readonly version: string
}

export interface OwnershipBody {
  readonly kind: "ownership-body"
  readonly version: 1
  // Bytes avoid the CAS canonicalizer's NFC-equivalence collapsing distinct reviewed source bodies.
  readonly bytes: readonly number[]
}

export interface OwnershipResult {
  readonly kind: "ownership-result"
  readonly version: 1
  readonly body: Hash
  readonly authority: {
    readonly scope: string
    readonly basis: string
  }
  // Never name this `status` or `freshness`: the existing CAS excludes those side-index keys from identity.
  readonly validity: "supported" | "blocked"
  readonly gaps: readonly string[]
  readonly evidence: readonly string[]
}

export interface OwnershipContract {
  readonly kind: "ownership-contract"
  readonly version: 1
  readonly criteria: readonly string[]
}

export interface OwnershipReview {
  readonly kind: "ownership-review"
  readonly version: 1
  readonly reviewer: string
  readonly contract: Hash
  readonly inputs: Hash
  readonly result: Hash
  readonly criteria: readonly string[]
  readonly verdict: "pass" | "hold"
  readonly provenance: string
}

export interface OwnershipReceipt {
  readonly kind: "ownership-receipt"
  readonly version: 1
  readonly contract: Hash
  readonly inputs: readonly OwnershipInput[]
  readonly dependencies: readonly { readonly key: string; readonly result: Hash }[]
  readonly reviews: readonly Hash[]
}

export interface OwnershipArtifact {
  readonly kind: "ownership-artifact"
  readonly version: 1
  readonly key: string
  readonly scope: string
  readonly title: string
  readonly layer: 1 | 2 | 3 | 4
  readonly need: OwnershipNeed
  readonly result: Hash
  readonly receipt: Hash
  readonly navigation: readonly string[]
}

export interface OwnershipManifest {
  readonly kind: "ownership-manifest"
  readonly version: 1
  readonly scope: string
  readonly entries: readonly { readonly key: string; readonly artifact: Hash }[]
  readonly roots: Readonly<Partial<Record<OwnershipNeed, string>>>
}

export type OwnershipRefusal = {
  readonly kind: "hold"
  readonly reason:
    | "malformed-ownership"
    | "ownership-missing"
    | "ownership-integrity"
    | "ownership-scope"
    | "ownership-review"
    | "ownership-cycle"
    | "ownership-blocked"
    | "ownership-input-unavailable"
    | "ownership-input-changed"
    | "ownership-dependency-changed"
    | "ownership-selection"
    | "ownership-section"
    | "ownership-limit"
    | "ownership-unpublished"
    | "ownership-untrusted"
    | "ownership-store-unavailable"
    | "ownership-ambiguous"
    | "ownership-carrier"
    | "old-producer"
  readonly evidence: readonly string[]
}

export type OwnershipRead =
  | OwnershipRefusal
  | {
      readonly kind: "ready"
      readonly manifest: Hash
      readonly artifact: Hash
      readonly result: Hash
      readonly receipt: Hash
      readonly key: string
      readonly scope: string
      readonly title: string
      readonly layer: OwnershipArtifact["layer"]
      readonly need: OwnershipNeed
      readonly navigation: readonly string[]
      readonly dependencies: readonly string[]
      readonly body: string
      readonly knowledge: Pick<OwnershipResult, "authority" | "validity" | "gaps" | "evidence">
      readonly historical: boolean
      readonly checked: readonly string[]
    }

export interface OwnershipQuery {
  readonly scope: string
  readonly need?: OwnershipNeed
  readonly key?: string
  readonly section?: string
  readonly maxBytes: number
  readonly historical?: true
}

export type OwnershipIndex = OwnershipRefusal | {
  readonly kind: "index"
  readonly manifest: Hash
  readonly artifact: Hash
  readonly result: Hash
  readonly receipt: Hash
  readonly key: string
  readonly scope: string
  readonly title: string
  readonly layer: OwnershipArtifact["layer"]
  readonly need: OwnershipNeed
  readonly sections: readonly string[]
  readonly navigation: readonly string[]
  readonly dependencies: readonly string[]
  readonly bodyBytes: number
  readonly bodiesReturned: false
  readonly bodyBytesVerified: true
  readonly checked: readonly string[]
}
