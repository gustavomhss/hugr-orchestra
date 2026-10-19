import { Button } from "@orchestra/ui/button"
import { useDialog } from "@orchestra/ui/context/dialog"
import { Dialog } from "@orchestra/ui/dialog"

// One question with one action behind it. Escape, the overlay and the cancel button all decline, so a caller that
// needs to know about declining passes `onClose` to `dialog.show`.
export function DialogConfirmChoice(props: {
  title: string
  description: string
  confirm: string
  cancel: string
  onConfirm: () => void
}) {
  const dialog = useDialog()
  return (
    <Dialog title={props.title} description={props.description}>
      <div class="flex justify-end gap-2 px-3 pb-3">
        <Button size="large" variant="secondary" onClick={() => dialog.close()}>
          {props.cancel}
        </Button>
        <Button
          size="large"
          variant="primary"
          autofocus
          onClick={() => {
            props.onConfirm()
            dialog.close()
          }}
        >
          {props.confirm}
        </Button>
      </div>
    </Dialog>
  )
}
