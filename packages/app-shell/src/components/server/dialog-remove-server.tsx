import { ButtonV2 } from "@orchestra/ui/v2/button-v2"
import { Dialog, DialogFooter, DialogHeader, DialogTitleGroup } from "@orchestra/ui/v2/dialog-v2"
import { useDialog } from "@orchestra/ui/context/dialog"
import { useLanguage } from "@/context/language"

// Deleting a server also drops its saved password and every tab open on it, so every delete entry point asks first.
export function DialogRemoveServer(props: { name: string; onConfirm: () => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  return (
    <Dialog>
      <DialogHeader closeLabel={language.t("common.close")}>
        <DialogTitleGroup
          title={language.t("orchestra.settings.servers.remove.title", { server: props.name })}
          description={language.t("orchestra.settings.servers.remove.description")}
        />
      </DialogHeader>
      <DialogFooter>
        <ButtonV2 variant="neutral" onClick={() => dialog.close()}>
          {language.t("common.cancel")}
        </ButtonV2>
        <ButtonV2
          variant="danger"
          onClick={() => {
            dialog.close()
            props.onConfirm()
          }}
        >
          {language.t("dialog.server.menu.delete")}
        </ButtonV2>
      </DialogFooter>
    </Dialog>
  )
}
