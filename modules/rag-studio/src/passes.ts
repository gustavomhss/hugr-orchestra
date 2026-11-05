import type { Fill, PassName } from "../../../docs/specs/rag-studio/seam"
import { requireStore } from "./context"
import { orphanDelete } from "./orphan"
import { rechunk } from "./rechunk"
import { reparse } from "./reparse"

export async function runPass(
  pass: PassName,
  sourceId: string,
): Promise<{ pass: "redo_numbers"; result: "not_applicable" } | { pass: PassName; fill: Fill }> {
  if (pass === "redo_numbers") return { pass: "redo_numbers", result: "not_applicable" }
  if (pass === "reparse") return { pass, ...(await reparse(sourceId)) }
  if (pass === "rechunk") return { pass, ...(await rechunk(sourceId)) }
  void sourceId
  void requireStore()
  return { pass, ...(await orphanDelete()) }
}
