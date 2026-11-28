import { createMemo } from "solid-js"
import { modelExecutionReason, useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"

export function DialogVariant() {
  const local = useLocal()
  const dialog = useDialog()

  const options = createMemo(() => {
    const raw = local.model.variant.selected()
    return [
      {
        value: JSON.stringify(["model-default"]),
        title: "Model default",
        onSelect: () => {
          dialog.clear()
          local.model.variant.set(undefined)
        },
      },
      ...local.model.variant.list().map((variant) => ({
        value: JSON.stringify(["variant", variant]),
        title: variant,
        onSelect: () => {
          if (!local.model.variant.list().includes(variant)) return
          dialog.clear()
          local.model.variant.set(variant)
        },
      })),
      ...(typeof raw === "string" && !local.model.variant.list().includes(raw) ? [{
        value: JSON.stringify(["variant", raw]),
        title: raw, disabled: true,
        footer: modelExecutionReason("variant-unavailable"), onSelect() {},
      }] : []),
    ]
  })

  return (
    <DialogSelect<string>
      options={options()}
      title={"Select variant"}
      current={typeof local.model.variant.selected() === "string"
        ? JSON.stringify(["variant", local.model.variant.selected()])
        : local.model.variant.selected() === null ? JSON.stringify(["model-default"])
          : typeof local.model.variant.current() === "string" ? JSON.stringify(["variant", local.model.variant.current()])
            : JSON.stringify(["model-default"])}
      flat={true}
      showDisabled={true}
    />
  )
}
