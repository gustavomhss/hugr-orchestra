import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import type { Capability } from "@orchestra/schema/capability"
import { sha256 } from "@noble/hashes/sha256"

const sameReceipt = Schema.toEquivalence(Research.DocumentReceipt)

export async function loadResearchDocument(
  receipt: Research.DocumentReceipt,
  read: (sessionID: string, artifact: Capability.ArtifactRef, cursor?: string, signal?: AbortSignal) => Promise<unknown>,
  signal?: AbortSignal,
) {
  const pages: string[] = []
  const state: { cursor?: string; bytes: number } = { bytes: 0 }
  const seen = new Set<string>()
  if (receipt.bytes > Research.Limits.documentBytes) throw new Error("Research document exceeds supported bounds")
  do {
    signal?.throwIfAborted()
    // Retained pages fill pageBytes, retreating at most three bytes to a UTF-8 boundary.
    if (pages.length >= Math.ceil(Research.Limits.documentBytes / (Research.Limits.pageBytes - 3)))
      throw new Error("Research document exceeds supported page bounds")
    const response = await read(receipt.binding.executionSessionID, receipt.artifact, state.cursor, signal)
    signal?.throwIfAborted()
    const page = Schema.decodeUnknownSync(Research.ArtifactPage)(response)
    const size = new TextEncoder().encode(page.text).byteLength
    if (
      page.ref.id !== receipt.artifact.id ||
      page.ref.revision !== receipt.artifact.revision ||
      page.representation !== "markdown" ||
      !("publishedAt" in page.receipt) ||
      !sameReceipt(page.receipt, receipt) ||
      size > Research.Limits.pageBytes ||
      state.bytes + size > receipt.bytes ||
      page.complete !== (page.cursor === undefined) ||
      (page.cursor && (size === 0 || seen.has(page.cursor)))
    )
      throw new Error("Research artifact differs from its admitted document revision")
    pages.push(page.text)
    state.bytes += size
    state.cursor = page.cursor
    if (page.cursor) seen.add(page.cursor)
  } while (state.cursor)
  if (state.bytes !== receipt.bytes) throw new Error("Research document is incomplete")
  const text = pages.join("")
  const digest = Array.from(sha256(new TextEncoder().encode(text)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
  signal?.throwIfAborted()
  if (digest !== receipt.digest) throw new Error("Research artifact differs from its admitted document revision")
  return text
}
