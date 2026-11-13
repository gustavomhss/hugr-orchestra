import type { Fill, PassName } from "./types"
import { requireStore } from "./context"
import { orphanDelete } from "./orphan"
import { redoNumbers } from "./embed"
import { rechunk } from "./rechunk"
import { reparse } from "./reparse"

export async function runPass(
  pass: PassName,
  sourceId: string,
): Promise<{ pass: "redo_numbers"; result: "not_applicable" | "no_key" } | { pass: PassName; fill: Fill }> {
  if (pass === "redo_numbers") return redoNumbers(sourceId)
  if (pass === "reparse") return { pass, ...(await reparse(sourceId)) }
  if (pass === "rechunk") return { pass, ...(await rechunk(sourceId)) }
  void sourceId
  void requireStore()
  return { pass, ...(await orphanDelete()) }
}
