import { requireStore } from "./context"

export function record(questionId: string, hits: string[], dropped: string[], k: number) {
  if (hits.includes("not_recorded") || dropped.includes("not_recorded")) throw new Error("rejected")
  requireStore().putTrace({ questionId, hits, dropped, k })
}
