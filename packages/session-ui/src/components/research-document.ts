import { Schema } from "effect"
import { Research } from "@orchestra/schema/research"
import type { Capability } from "@orchestra/schema/capability"

export async function loadResearchDocument(
  receipt: Research.DocumentReceipt,
  read: (sessionID: string, artifact: Capability.ArtifactRef, cursor?: string) => Promise<unknown>,
) {
  const pages: string[] = []
  const state: { cursor?: string; bytes: number } = { bytes: 0 }
  const seen = new Set<string>()
  if (receipt.bytes > Research.Limits.documentBytes) throw new Error("Research document exceeds supported bounds")
  do {
    const page = Schema.decodeUnknownSync(Research.ArtifactPage)(await read(receipt.binding.executionSessionID, receipt.artifact, state.cursor))
    const size = new TextEncoder().encode(page.text).byteLength
    if (page.ref.id !== receipt.artifact.id || page.ref.revision !== receipt.artifact.revision || page.representation !== "markdown" ||
      !("publishedAt" in page.receipt) || page.receipt.digest !== receipt.digest ||
      page.receipt.ref.id !== receipt.ref.id || page.receipt.ref.revision !== receipt.ref.revision || page.receipt.bytes !== receipt.bytes ||
      page.receipt.binding.executionSessionID !== receipt.binding.executionSessionID || page.receipt.binding.projectID !== receipt.binding.projectID ||
      size > Research.Limits.pageBytes || state.bytes + size > receipt.bytes || (!page.cursor && !page.complete) ||
      (page.cursor && (size === 0 || seen.has(page.cursor))))
      throw new Error("Research artifact differs from its admitted document revision")
    pages.push(page.text)
    state.bytes += size
    state.cursor = page.cursor
    if (page.cursor) seen.add(page.cursor)
  } while (state.cursor)
  if (state.bytes !== receipt.bytes) throw new Error("Research document is incomplete")
  return pages.join("")
}
