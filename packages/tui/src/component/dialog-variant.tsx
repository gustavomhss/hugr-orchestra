import { createMemo } from "solid-js"
import { modelExecutionReason, useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"

export function DialogVariant() {
  const local = useLocal()
  const dialog = useDialog()

  const selected = () => {
    const raw = local.model.variant.selected()
    return raw === undefined ? local.model.variant.current() : raw
  }
  const options = createMemo(() => {
    const variant = selected()
    const variants = local.model.variant.list()
    return [
      {
        value: JSON.stringify(["model-default"]),
        title: "Model default",
        onSelect: () => {
          dialog.clear()
          local.model.variant.set(undefined)
        },
      },
      ...variants.map((variant) => ({
        value: JSON.stringify(["variant", variant]),
        title: variant === "" ? '""' : variant,
        onSelect: () => {
          if (!local.model.variant.list().includes(variant)) return
          dialog.clear()
          local.model.variant.set(variant)
        },
      })),
      ...(typeof variant === "string" && !variants.includes(variant) ? [{
        value: JSON.stringify(["variant", variant]),
        title: variant === "" ? '""' : variant, disabled: true,
        footer: modelExecutionReason("variant-unavailable"), onSelect() {},
      }] : []),
    ]
  })

  return (
    <DialogSelect<string>
      options={options()}
      title={"Select variant"}
      current={typeof selected() === "string" ? JSON.stringify(["variant", selected()]) : JSON.stringify(["model-default"])}
      flat={true}
      showDisabled={true}
    />
  )
}
