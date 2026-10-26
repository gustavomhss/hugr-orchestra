import { createMemo } from "solid-js"
import { useSync } from "../../context/sync"
import { DialogSelect } from "../../ui/dialog-select"
import { useSDK } from "../../context/sdk"
import { useRoute } from "../../context/route"
import { useClipboard } from "../../context/clipboard"
import { useToast } from "../../ui/toast"
import { errorMessage } from "../../util/error"
import type { PromptInfo } from "../../component/prompt/history"
import { promptDraft, promptText } from "./prompt-draft"

export function DialogMessage(props: {
  messageID: string
  sessionID: string
  setPrompt?: (prompt: PromptInfo) => void
}) {
  const sync = useSync()
  const sdk = useSDK()
  const message = createMemo(() => sync.data.message[props.sessionID]?.find((x) => x.id === props.messageID))
  const route = useRoute()
  const clipboard = useClipboard()
  const toast = useToast()

  return (
    <DialogSelect
      title="Message Actions"
      options={[
        {
          title: "Revert",
          value: "session.revert",
          description: "undo messages and file changes",
          onSelect: (dialog) => {
            const msg = message()
            if (!msg) return

            void sdk.actions.revert({ sessionID: props.sessionID, messageID: msg.id }).catch((error) => {
              toast.show({ title: "Failed to revert", message: errorMessage(error), variant: "error" })
            })

            props.setPrompt?.(promptDraft(msg))

            dialog.clear()
          },
        },
        {
          title: "Copy",
          value: "message.copy",
          description: "message text to clipboard",
          onSelect: async (dialog) => {
            const msg = message()
            if (!msg) return

            await clipboard.write?.(promptText(msg))
            dialog.clear()
          },
        },
        {
          title: "Fork",
          value: "session.fork",
          description: "create a new session",
          onSelect: async (dialog) => {
            const result = await sdk.api.sessions.fork({ sessionID: props.sessionID, messageID: props.messageID }).then(
              (value) => ({ data: value, error: undefined }),
              (error: unknown) => ({ data: undefined, error }),
            )
            if (!result.data) {
              toast.show({ variant: "error", message: JSON.stringify(result.error) })
              dialog.clear()
              return
            }
            const msg = message()
            const prompt = msg ? promptDraft(msg) : undefined
            route.navigate({
              sessionID: result.data.id,
              type: "session",
              prompt,
            })
            dialog.clear()
          },
        },
      ]}
    />
  )
}
