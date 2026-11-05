import type { PassName } from "../../../docs/specs/rag-studio/seam"

export function runPasses(passes: PassName[]): Promise<{ refused: "one_pass" }> {
  if (passes.length !== 1) return Promise.resolve({ refused: "one_pass" })
  throw new Error("rejected")
}
