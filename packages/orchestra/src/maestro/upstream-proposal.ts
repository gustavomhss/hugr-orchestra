import { RelaySprint } from "@orchestra/schema/relay-sprint"
import { Schema } from "effect"
import { createHash } from "node:crypto"

const decode = Schema.decodeUnknownSync(Schema.fromJsonString(RelaySprint.Sprint))

/**
 * Structural inspection facts, not publication, approval or verified source provenance.
 * Native metadata and gen carry no authority; runtime semantics remain unchecked.
 */
export function inspect(bytes: Uint8Array) {
  const snapshot = new Uint8Array(bytes)
  // ignoreBOM preserves the BOM character, so a leading BOM is not silently stripped before JSON decoding.
  const sprint = decode(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(snapshot))
  return {
    schemaIdentifier: "RelaySprint.Sprint" as const,
    digest: createHash("sha256").update(snapshot).digest("hex"),
    byteLength: snapshot.byteLength,
    sprint,
  }
}

export * as UpstreamProposal from "./upstream-proposal"
