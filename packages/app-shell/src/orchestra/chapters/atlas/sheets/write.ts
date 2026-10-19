import { isAtlasEmpty } from "../atlas-api"
import type { AtlasController } from "../atlas-controller"

// One fact write through the surface (D2): `draft` composes the fact at the anchor, `emit` writes it through the
// governed door, which runs every gate again. `atlas draft` always drafts T2 with a placeholder group
// (tools/src/draft.ts); a write at another tier, or into the fact's own group, sets them on the drafted fact before
// emit, as a CLI author does (issue item 6). The draft's own dry run is T2 only, so the emit verdict decides.
export type FactWrite = {
  anchor: string
  slot: string
  claim: string
  token: string
  supersede?: boolean
  tier?: string
  scope?: string
}
export type FactWriteOutcome = { ok: true } | { ok: false; reason: string }

export function governed(fact: unknown, patch: { tier?: string; scope?: string }): unknown {
  if (typeof fact !== "object" || fact === null) return fact
  return { ...fact, ...(patch.tier ? { tier: patch.tier } : {}), ...(patch.scope ? { scope: patch.scope } : {}) }
}

// Resolves undefined when a request failed or the store is gone: the controller has already set what the frame shows.
export async function writeFact(controller: AtlasController, input: FactWrite): Promise<FactWriteOutcome | undefined> {
  const drafted = await controller.draft({
    anchor: input.anchor,
    slot: input.slot,
    claim: input.claim,
    supersede: input.supersede,
    token: input.token,
  })
  if (!drafted || isAtlasEmpty(drafted)) return
  if (!drafted.ok || !drafted.data) return { ok: false, reason: drafted.rejected ?? "unknown" }
  const emitted = await controller.emit({
    fact: governed(drafted.data.draft.fact, { tier: input.tier, scope: input.scope }),
    at: drafted.data.draft.rev,
    token: input.token,
  })
  if (!emitted || isAtlasEmpty(emitted)) return
  if (!emitted.ok || !emitted.data?.emitted) return { ok: false, reason: emitted.data?.rejected ?? emitted.rejected ?? "unknown" }
  return { ok: true }
}
