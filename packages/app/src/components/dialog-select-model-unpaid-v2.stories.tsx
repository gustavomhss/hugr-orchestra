// @ts-nocheck
import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { onMount } from "solid-js"
import { DialogSelectModelUnpaidV2 } from "./dialog-select-model-unpaid-v2"

function SelectModelWithoutProviders() {
  const dialog = useDialog()
  const open = () => dialog.show(() => <DialogSelectModelUnpaidV2 />)

  onMount(open)

  return (
    <Button variant="secondary" onClick={open}>
      Open select model dialog
    </Button>
  )
}

export default {
  title: "App/Dialogs/Select Model",
  id: "app-dialog-select-model",
}

export const WithoutProviders = {
  render: () => <SelectModelWithoutProviders />,
}
