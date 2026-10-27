import { getOwner, runWithOwner } from "solid-js"
import { useLayout } from "@/context/layout"
import { useTabs } from "@/context/tabs"
import type { RelayDocument } from "./client"
import type { useRelayCopy } from "./ui"

type Translate = ReturnType<typeof useRelayCopy>["t"]
type CopyKey = Parameters<Translate>[0]

// Maestro runs workflows. The UI never starts a run: "Run" and "Use in chat" open a Maestro chat with the workflow named
// in the prompt, and the owner finishes the sentence (Run) or Maestro takes the request from there.
export type ChatKind = "run" | "use"

export function workflowPrompt(t: Translate, kind: ChatKind, document: Pick<RelayDocument, "id" | "name">) {
  const key = kind === "run" ? "orchestra.workflows.run.prompt" : "orchestra.workflows.useInChat.prompt"
  return t(key, { name: document.name, id: document.id })
}

// Why Run is off, as a copy key; undefined when a chat can ask Maestro for the run. Maestro runs only the published version.
export function runBlockedBy(document: Pick<RelayDocument, "activeVersionId" | "runnable">): CopyKey | undefined {
  if (!document.activeVersionId) return "orchestra.workflows.row.publishFirst"
  if (!document.runnable) return "orchestra.workflows.row.toolsMissing"
  return undefined
}

// Opens a draft chat in the project with the workflow's prompt filled in. Every desktop session runs on Maestro.
export function useWorkflowChat(directory: string, t: Translate) {
  // The contexts are read when the button is pressed, in the owner that rendered it, so a screen that never opens a chat
  // does not need the tab and layout providers.
  const owner = getOwner()
  return (kind: ChatKind, document: Pick<RelayDocument, "id" | "name">) =>
    runWithOwner(owner, () => {
      const tabs = useTabs()
      const layout = useLayout()
      return void tabs.newDraft({ server: layout.home.selection().server, directory }, workflowPrompt(t, kind, document))
    })
}
