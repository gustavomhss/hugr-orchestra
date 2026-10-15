import { createUniqueId, Show } from "solid-js"
import type { PromptInputV2Interaction } from "@orchestra/session-ui/v2/prompt-input/interaction"
import { useLanguage } from "@/context/language"
import { useSessionDelivery } from "./delivery"

// The approved composer's left tools after the add menu: pick context files from this session's
// project, choose how the next prompt is delivered, and stop the running turn without clearing
// a prompt being written.
export function OrchestraComposeTools(props: { controller: PromptInputV2Interaction; sessionID: string }) {
  const language = useLanguage()
  const delivery = useSessionDelivery(() => props.sessionID)
  const queued = () => delivery.supported() && delivery.choice() === "queue"
  const hintID = createUniqueId()
  const deliveryHint = () => {
    if (!delivery.supported()) return language.t("orchestra.chat.delivery.unsupported")
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
        aria-disabled={!delivery.supported() || undefined}
        aria-describedby={hintID}
        title={deliveryHint()}
        onClick={() => delivery.toggle()}
      >
        {language.t(queued() ? "orchestra.chat.delivery.queue" : "orchestra.chat.delivery.steer")}
      </button>
      <span id={hintID} hidden>
        {deliveryHint()}
      </span>
      <Show when={props.controller.view.submit.working?.()}>
        <button type="button" data-action="prompt-stop-run" onClick={() => props.controller.view.submit.onStop()}>
          {language.t("orchestra.chat.stop")}
        </button>
      </Show>
    </div>
  )
}
