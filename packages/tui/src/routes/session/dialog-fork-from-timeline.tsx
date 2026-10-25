import { createMemo, onMount } from "solid-js"
import { useSync } from "../../context/sync"
import { DialogSelect, type DialogSelectOption } from "../../ui/dialog-select"
import { Locale } from "../../util/locale"
import { useSDK } from "../../context/sdk"
import { useRoute } from "../../context/route"
import { useToast } from "../../ui/toast"
import { useDialog, type DialogContext } from "../../ui/dialog"
import { promptDraft, promptText } from "./prompt-draft"

export function DialogForkFromTimeline(props: { sessionID: string; onMove: (messageID?: string) => void }) {
  const sync = useSync()
  const dialog = useDialog()
  const sdk = useSDK()
  const route = useRoute()
  const toast = useToast()

  onMount(() => {
    dialog.setSize("large")
  })

  const options = createMemo((): DialogSelectOption<string | undefined>[] => {
    const messages = sync.data.message[props.sessionID] ?? []
    const fullSession = {
      title: "Full session",
      value: undefined,
      onSelect: async (dialog: DialogContext) => {
        const forked = await sdk.api.sessions.fork({ sessionID: props.sessionID }).then(
          (value) => ({ data: value, error: undefined }),
          (error: unknown) => ({ data: undefined, error }),
        )
        if (!forked.data) {
          toast.show({ variant: "error", message: JSON.stringify(forked.error) })
          dialog.clear()
          return
        }
        route.navigate({
          sessionID: forked.data.id,
          type: "session",
        })
        dialog.clear()
      },
    } satisfies DialogSelectOption<string | undefined>
    const result = [] as DialogSelectOption<string | undefined>[]
    for (const message of messages) {
      const text = promptText(message)
      if (!text) continue
      result.push({
        title: text.replace(/\n/g, " "),
        value: message.id,
        footer: Locale.time(message.time.created),
        onSelect: async (dialog) => {
          const forked = await sdk.api.sessions.fork({ sessionID: props.sessionID, messageID: message.id }).then(
            (value) => ({ data: value, error: undefined }),
            (error: unknown) => ({ data: undefined, error }),
          )
          if (!forked.data) {
            toast.show({ variant: "error", message: JSON.stringify(forked.error) })
            dialog.clear()
            return
          }
          route.navigate({
            sessionID: forked.data.id,
            type: "session",
            prompt: promptDraft(message),
          })
          dialog.clear()
        },
      })
    }
    return [fullSession, ...result.reverse()]
  })

  return <DialogSelect onMove={(option) => props.onMove(option.value)} title="Fork session" options={options()} />
}
