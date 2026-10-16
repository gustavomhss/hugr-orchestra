import { Show } from "solid-js"
import { failure } from "./dialogs"
import { useRelayCopy } from "./ui"

export type HookQueryState = {
  kind: "installs" | "activity"
  query: { isError: boolean; error: unknown; refetch: () => unknown }
}

export function HookQueryStatus(props: HookQueryState) {
  const copy = useRelayCopy()
  return (
    <div class={props.query.isError ? "mx-error" : "mx-note"} role={props.query.isError ? "alert" : "status"} data-hook-status={props.kind}>
      {copy.t(`orchestra.workflows.hookState.${props.kind}.${props.query.isError ? "error" : "loading"}`, { reason: props.query.isError ? failure(props.query.error) : "" })}
      <Show when={props.query.isError}>
        <button type="button" class="mx-btn" onClick={() => void props.query.refetch()}>
          {copy.t("orchestra.workflows.retry")}
        </button>
      </Show>
    </div>
  )
}
