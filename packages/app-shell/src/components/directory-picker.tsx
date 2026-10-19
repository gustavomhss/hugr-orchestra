import { useDialog } from "@orchestra/ui/context/dialog"
import { ServerConnection } from "@/context/server"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { errorMessage } from "@/pages/layout/helpers"
import { showToast } from "@/utils/toast"
import { lazy } from "solid-js"
import { DialogSelectDirectory } from "./dialog-select-directory"
import { directoryPickerKind } from "./directory-picker-policy"

const DialogSelectDirectoryV2 = lazy(() =>
  import("./dialog-select-directory-v2").then((module) => ({ default: module.DialogSelectDirectoryV2 })),
)

type DirectoryPickerInput = {
  server: ServerConnection.Any
  title?: string
  multiple?: boolean
  onSelect: (result: string | string[] | null) => void
}

export function useDirectoryPicker() {
  const platform = usePlatform()
  const dialog = useDialog()
  const language = useLanguage()

  return (input: DirectoryPickerInput) => {
    if (directoryPickerKind(platform.platform, input.server) === "native" && platform.platform === "desktop") {
      void platform
        .openDirectoryPickerDialog({ title: input.title, multiple: input.multiple })
        .then(input.onSelect, (error: unknown) =>
          showToast({
            variant: "error",
            title: language.t("orchestra.shell.picker.failed"),
            description: errorMessage(error, language.t("common.requestFailed")),
          }),
        )
      return
    }

    let selected = false
    const onSelect = (result: string | string[] | null) => {
      selected = result !== null
      input.onSelect(result)
    }
    const cancel = () => {
      if (!selected) input.onSelect(null)
    }
    if (platform.platform === "desktop") {
      dialog.show(() => <DialogSelectDirectoryV2 {...input} onSelect={onSelect} />, cancel)
      return
    }
    dialog.show(() => <DialogSelectDirectory {...input} onSelect={onSelect} />, cancel)
  }
}
