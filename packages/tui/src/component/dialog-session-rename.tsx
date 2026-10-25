import { DialogPrompt } from "../ui/dialog-prompt"
import { useDialog } from "../ui/dialog"
import { useSync } from "../context/sync"
import { createMemo } from "solid-js"
import { useSDK } from "../context/sdk"
import { useToast } from "../ui/toast"

interface DialogSessionRenameProps {
  session: string
}

export function DialogSessionRename(props: DialogSessionRenameProps) {
  const dialog = useDialog()
  const sync = useSync()
  const sdk = useSDK()
  const toast = useToast()
  const session = createMemo(() => sync.session.get(props.session))

  return (
    <DialogPrompt
      title="Rename Session"
      value={session()?.title}
      onConfirm={async (value) => {
        const error = await sdk.api.sessions.rename({ sessionID: props.session, title: value }).then(
          () => undefined,
          (error: unknown) => error ?? "rename failed",
        )
        if (error) {
          toast.show({ variant: "error", message: JSON.stringify(error) })
          return
        }
        dialog.clear()
      }}
      onCancel={() => dialog.clear()}
    />
  )
}
