import { createContext, useContext } from "solid-js"
import { createStore } from "solid-js/store"

export type SourceStatus = "not_yet_read" | "read" | "failed"

// Files and Maintain share reads within the current chapter and Location.
export function createRagRoster() {
  const [roster, setRoster] = createStore({
    status: "loading" as "loading" | "ready" | "error",
    sources: [] as Array<{ id: string; path: string; status: SourceStatus }>,
    openId: "",
    revision: 0,
    embeddingModel: "",
    pipelineKnown: false,
    pipelineFailed: false,
  })
  return { roster, setRoster }
}

const RagRoster = createContext<ReturnType<typeof createRagRoster>>()
export const RagRosterProvider = RagRoster.Provider

export function useRagRoster() {
  const context = useContext(RagRoster)
  if (!context) throw new Error("Rag Studio roster is missing")
  return context
}

export function statusKey(status: SourceStatus) {
  if (status === "read") return "orchestra.ragStudio.status.read" as const
  if (status === "failed") return "orchestra.ragStudio.status.failed" as const
  return "orchestra.ragStudio.status.not_yet_read" as const
}

export function statusTone(status: SourceStatus) {
  if (status === "read") return "good" as const
  if (status === "failed") return "bad" as const
  return undefined
}
