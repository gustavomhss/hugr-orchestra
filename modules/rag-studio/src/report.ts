import type { FileStatus, Light, QuestionResult, SpanRef } from "./types"

const reasons = (): Record<Light, string> => ({
  not_in_corpus: "not_in_corpus",
  search_miss: "search_miss",
  dropped_before_model: "dropped_before_model",
  sent: "sent",
})

export function shape(input: {
  revisionId: string
  light: Light | null
  fileStatus: FileStatus | null
  span: SpanRef | null
  hits: string[]
  dropped: string[]
  promptText: string
  promptChunkIds: string[]
  retrievalOptional: boolean
  sense: QuestionResult["sense"]
}): QuestionResult {
  if (input.hits === undefined || input.dropped === undefined) throw new Error("rejected")
  return {
    revisionId: input.revisionId,
    light: input.light,
    reasons: reasons(),
    fileStatus: input.fileStatus,
    span: input.light === "not_in_corpus" || input.light === null ? null : input.span,
    hits: input.light === "not_in_corpus" ? [] : input.hits,
    dropped: input.dropped,
    promptText: input.promptText,
    promptChunkIds: input.promptChunkIds,
    retrievalOptional: input.retrievalOptional,
    sense: input.sense,
  }
}
