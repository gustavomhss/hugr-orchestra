import { createMemo } from "solid-js"
import { useLocal } from "../context/local"
import { DialogSelect } from "../ui/dialog-select"
import { useDialog } from "../ui/dialog"
import { agentKey } from "../util/agent"

export function DialogAgent() {
  const local = useLocal()
  const dialog = useDialog()

  const current = createMemo(() => {
    const item = local.agent.current()
    return item && agentKey(item)
  })
  const options = createMemo(() =>
    local.agent.list().map((item) => {
      return {
        value: agentKey(item),
        title: item.name,
        description: item.native ? "native" : item.description,
      }
    }),
  )

  return (
    <DialogSelect
      title="Select agent"
      current={current()}
      options={options()}
      onSelect={(option) => {
        local.agent.set(option.value)
        dialog.clear()
      }}
    />
  )
}
