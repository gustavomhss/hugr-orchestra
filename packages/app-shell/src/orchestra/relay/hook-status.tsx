import { useNavigate } from "@solidjs/router"
import { createSignal, Show } from "solid-js"
import { RelayError } from "./client"
import { failure } from "./dialogs"
import { RepairDialog } from "./hook-dialogs"
import { relayPath } from "./route"
import type { RelaySource } from "./source"
import { useRelayCopy } from "./ui"

export type HookQueryState = {
  kind: "installs" | "activity"
  query: { isError: boolean; error: unknown; refetch: () => unknown }
  // The Hooks library passes its source so a damaged hooks file can be reset on the spot; without it the banner
  // sends the user to the library.
  source?: RelaySource
}

// A hooks.json the server cannot read. The runtime then refuses every tool call and prompt of the project, and only
// the explicit repair route can clear it.
export const hooksDamaged = (error: unknown) =>
  error instanceof RelayError &&
  error.status === 409 &&
  (error.code === "profile-invalid" || error.code === "profile-not-file-or-overflow")

export function HookQueryStatus(props: HookQueryState) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.kind === "installs" && props.query.isError && hooksDamaged(props.query.error)}
      fallback={
        <div
          class={props.query.isError ? "mx-error" : "mx-note"}
          role={props.query.isError ? "alert" : "status"}
          data-hook-status={props.kind}
        >
          {copy.t(`orchestra.workflows.hookState.${props.kind}.${props.query.isError ? "error" : "loading"}`, {
            reason: props.query.isError ? failure(props.query.error) : "",
          })}
          <Show when={props.query.isError}>
            <button type="button" class="mx-btn" onClick={() => void props.query.refetch()}>
              {copy.t("orchestra.workflows.retry")}
            </button>
          </Show>
        </div>
      }
    >
      <DamagedHooks query={props.query} source={props.source} />
    </Show>
  )
}

function DamagedHooks(props: { query: HookQueryState["query"]; source?: RelaySource }) {
  const copy = useRelayCopy()
  const navigate = useNavigate()
  const [confirm, setConfirm] = createSignal(false)
  return (
    <>
      <div class="hk-damaged" role="alert" data-hook-status="installs" data-hook-damaged="">
        <strong>{copy.t("orchestra.hooks.repair.title")}</strong>
        <p>{copy.t("orchestra.hooks.repair.body")}</p>
        <small>{failure(props.query.error)}</small>
        <div class="hk-damaged-actions">
          <Show
            when={props.source}
            fallback={
              <button type="button" class="mx-btn" onClick={() => navigate(relayPath.library("hook"))}>
                {copy.t("orchestra.hooks.repair.open")}
              </button>
            }
          >
            <button type="button" class="mx-btn danger" onClick={() => setConfirm(true)}>
              {copy.t("orchestra.hooks.repair.action")}
            </button>
          </Show>
          <button type="button" class="mx-btn" onClick={() => void props.query.refetch()}>
            {copy.t("orchestra.workflows.retry")}
          </button>
        </div>
      </div>
      <Show when={confirm() ? props.source : undefined}>
        {(source) => <RepairDialog source={source()} onClose={() => setConfirm(false)} />}
      </Show>
    </>
  )
}
