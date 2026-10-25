import type { PromptInfo } from "../../component/prompt/history"
import type { SessionMessage } from "../../types"

/** The text a person typed into a prompt. Synthetic prompts are host-injected, so they have none. */
export function promptText(message: SessionMessage) {
  return message.type === "user" ? message.text : ""
}

/** The prompt `message` was sent with, ready to restore into the editor: its typed text and attached files. */
export function promptDraft(message: SessionMessage): PromptInfo {
  if (message.type !== "user" && message.type !== "synthetic") return { input: "", parts: [] }
  return {
    input: promptText(message),
    parts: (message.files ?? []).map((file) => ({
      type: "file" as const,
      mime: file.mime,
      filename: file.name,
      url: file.uri,
      source: file.source
        ? {
            type: "file" as const,
            path: file.uri.replace(/^file:\/\//, ""),
            text: { value: file.source.text, start: file.source.start, end: file.source.end },
          }
        : undefined,
    })),
  }
}
