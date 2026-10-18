import { Show } from "solid-js"
import { Ic } from "./ui"

// The header of a phase box: its name (renamed in place), step count, rename and remove buttons, and the link to the
// phase's instructions. It is also the grip that drags the whole phase.
export function PhaseHead(props: {
  id: string
  name: string
  steps: string
  editing: boolean
  editable: boolean
  renameLabel: string
  removeLabel: string
  // The label of the instructions link; no link without one.
  protocol?: string
  onEdit: () => void
  onCommit: (name: string) => void
  onCancel: () => void
  onUngroup: () => void
  onProtocol: () => void
}) {
  return (
    <div class="wf-group-head" data-grip={props.id}>
      <Show
        when={props.editing && props.editable}
        fallback={<b onDblClick={() => props.editable && props.onEdit()}>{props.name}</b>}
      >
        <input
          class="wf-group-name"
          dir="auto"
          aria-label={props.renameLabel}
          // Set once: a save that rebuilds the flow must not overwrite what is being typed.
          ref={(input) => {
            input.value = props.name
            queueMicrotask(() => {
              input.focus()
              input.select()
            })
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Enter") props.onCommit(event.currentTarget.value)
            if (event.key !== "Escape") return
            event.preventDefault()
            props.onCancel()
          }}
          onBlur={(event) => props.onCommit(event.currentTarget.value)}
        />
      </Show>
      <small>{props.steps}</small>
      <Show when={props.editable}>
        <span class="wf-group-tools">
          <button type="button" aria-label={props.renameLabel} title={props.renameLabel} onClick={props.onEdit}>
            <Ic name="edit" />
          </button>
          <button type="button" aria-label={props.removeLabel} title={props.removeLabel} onClick={props.onUngroup}>
            <Ic name="close" />
          </button>
        </span>
      </Show>
      <Show when={props.protocol}>
        <button type="button" class="mx-link" data-protocol={props.id} onClick={props.onProtocol}>
          {props.protocol}
        </button>
      </Show>
    </div>
  )
}
