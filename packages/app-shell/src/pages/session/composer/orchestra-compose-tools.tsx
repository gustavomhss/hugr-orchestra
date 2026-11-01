import { createUniqueId, Show } from "solid-js"
import type { PromptInputV2Interaction } from "@orchestra/session-ui/v2/prompt-input/interaction"
import { useLanguage } from "@/context/language"
import { usePermission } from "@/context/permission"
import { useSDK } from "@/context/sdk"
import { useSessionDelivery } from "./delivery"

// The approved composer's left tools after the add menu: pick context files from this session's
// project, choose how the next prompt is delivered, whether tool permissions ask or are accepted
// for this session, and stop the running turn without clearing a prompt being written.
export function OrchestraComposeTools(props: { controller: PromptInputV2Interaction; sessionID: string }) {
  const language = useLanguage()
  const permission = usePermission()
  const sdk = useSDK()
  const delivery = useSessionDelivery(() => props.sessionID)
  const queued = () => delivery.choice() === "queue"
  const accepting = () => permission.isAutoAccepting(props.sessionID, sdk().directory)
  const hintID = createUniqueId()
  const permissionHintID = createUniqueId()
  const permissionHint = () =>
    language.t(accepting() ? "orchestra.chat.permissions.autoHint" : "orchestra.chat.permissions.askHint")
  const deliveryHint = () => {
    return language.t(
      delivery.choice() === "queue" ? "orchestra.chat.delivery.queueHint" : "orchestra.chat.delivery.steerHint",
    )
  }
  return (
    <div data-slot="orchestra-compose-tools">
      <button
        type="button"
        data-action="prompt-context-files"
        aria-label={language.t("orchestra.chat.contextFiles")}
        title={language.t("orchestra.chat.contextFiles")}
        onClick={() => props.controller.openContext()}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M4 2h5l3 3v9H4V2ZM9 2v3h3M6 8h4M6 11h3" />
        </svg>
      </button>
      <button
        type="button"
        data-action="prompt-delivery"
        data-delivery={queued() ? "queue" : "steer"}
        aria-pressed={queued()}
        aria-describedby={hintID}
        title={deliveryHint()}
        onClick={() => delivery.toggle()}
      >
        {language.t(queued() ? "orchestra.chat.delivery.queue" : "orchestra.chat.delivery.steer")}
      </button>
      <span id={hintID} hidden>
        {deliveryHint()}
      </span>
      <button
        type="button"
        data-action="prompt-permissions"
        aria-pressed={accepting()}
        aria-describedby={permissionHintID}
        title={permissionHint()}
        onClick={() => permission.toggleAutoAccept(props.sessionID, sdk().directory)}
      >
        {language.t(accepting() ? "orchestra.chat.permissions.auto" : "orchestra.chat.permissions.ask")}
      </button>
      <span id={permissionHintID} hidden>
        {permissionHint()}
      </span>
      <Show when={props.controller.view.submit.working?.()}>
        <button type="button" data-action="prompt-stop-run" onClick={() => props.controller.view.submit.onStop()}>
          {language.t("orchestra.chat.stop")}
        </button>
      </Show>
    </div>
  )
}
