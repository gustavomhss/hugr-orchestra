// @atlas/persist — src/provenance.ts  (trailer + git-note (de)serializer — PERSIST-3)
//
// The frozen round-trip `Dossier ↔ string`: `serialize` emits the committed text form (self-describing OKF
// JSON of the whole dossier, no lock-in); `deserialize` is a TOTAL read — a fully-absent / malformed /
// trailer-less commit yields `null`, never a throw. `TranscriptSha` is already the sealed `Hash` pointer.

import type { Dossier } from "./types.js"

/** The trailer+note (de)serializer surface (PERSIST-3): the frozen round-trip `Dossier` ↔ `string`.
 *  `deserialize` is a TOTAL read — a fully-absent commit yields `null`, never a throw. (method-tags-pst:34-36) */
export interface ProvenanceApi {
  serialize(dossier: Dossier): string
  deserialize(serialized: string): Dossier | null
}

/** Reject parsed payloads that carry a partial or non-object trailer. */
function isTrailer(value: unknown): value is Dossier["trailer"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const trailer = value as Record<string, unknown>
  return (
    typeof trailer.WP === "string" &&
    typeof trailer.Model === "string" &&
    typeof trailer.Gates === "string" &&
    typeof trailer.Verdict === "string" &&
    typeof trailer.TranscriptSha === "string"
  )
}

/**
 * Serialize a dossier to its committed text form (the trailer block + note overlay). The whole `Dossier`
 * is emitted verbatim, so every required provenance field (all five trailer fields, plus any metering /
 * knowledge-delta) survives the round-trip (SCN-PERSIST-3a-1). (method-tags-pst:36)
 */
export function serialize(dossier: Dossier): string {
  return JSON.stringify(dossier)
}

/**
 * Reconstruct the dossier from the serialized form. A TOTAL read (SCN-PERSIST-3b-1): an empty / whitespace
 * / malformed input — a commit with NO note — yields `null`, never a throw. A structurally-incomplete
 * payload (no `trailer`) is likewise an honest `null` rather than a partial dossier, so a caller never
 * observes a provenance record missing its canonical trailer. (method-tags-pst:35-36)
 */
export function deserialize(serialized: string): Dossier | null {
  if (typeof serialized !== "string" || serialized.trim() === "") return null
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null) return null
  const d = parsed as Partial<Dossier>
  if (!isTrailer(d.trailer)) return null
  return d as Dossier
}

// differential-vs-oracle (compile-time): the facet conforms to the co-located frozen ProvenanceApi.
const _apiCheck: ProvenanceApi = { serialize, deserialize }
void _apiCheck
