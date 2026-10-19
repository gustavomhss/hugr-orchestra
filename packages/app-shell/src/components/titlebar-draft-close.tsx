import { useDialog } from "@orchestra/ui/context/dialog"
import { DialogConfirmChoice } from "@/components/dialog-confirm-choice"
import { useLanguage } from "@/context/language"
import { useTabs, type Tab } from "@/context/tabs"

// Closing a draft deletes its saved prompt, so a draft with text or attachments asks first.
export function useDraftCloseGuard() {
  const dialog = useDialog()
  const language = useLanguage()
  const tabs = useTabs()
  return (tab: Tab, close: () => unknown) => {
    if (tab.type !== "draft") return close()
    void tabs.draftHasContent(tab).then((content) => {
      if (!content) return close()
      void dialog.show(() => (
        <DialogConfirmChoice
          title={language.t("orchestra.shell.draft.close.title")}
          description={language.t("orchestra.shell.draft.close.description")}
          confirm={language.t("orchestra.shell.draft.close.confirm")}
          cancel={language.t("common.cancel")}
          onConfirm={close}
        />
      ))
    })
  }
}
