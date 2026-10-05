import { Show } from "solid-js"
import type { PromptInputV2Interaction } from "@opencode-ai/session-ui/v2/prompt-input/interaction"
import { useLanguage } from "@/context/language"
import { useSessionDelivery } from "./delivery"

// The approved composer's left tools after the add menu: pick context files from this session's
// project, choose how the next prompt is delivered, and stop the running turn without clearing
// a prompt being written.
export function OrchestraComposeTools(props: { controller: PromptInputV2Interaction; sessionID: string }) {
  const language = useLanguage()
  const delivery = useSessionDelivery(() => props.sessionID)
  const deliveryHint = () => {
    if (!delivery.supported()) return language.t("orchestra.chat.delivery.unsupported")
    return language.t(delivery.choice() === "queue" ? "orchestra.chat.delivery.queueHint" : "orchestra.chat.delivery.steerHint")
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
          <path d="M4.2 2.6h5.1l2.5 2.5v8.3H4.2z" />
          <path d="M9.3 2.6v2.5h2.5M6.2 8.3h3.6M6.2 10.4h3.6" />
        </svg>
      </button>
      <button
        type="button"
        data-action="prompt-delivery"
        data-delivery={delivery.supported() ? delivery.choice() : "steer"}
        aria-disabled={!delivery.supported() || undefined}
        aria-description={deliveryHint()}
        title={deliveryHint()}
        onClick={() => delivery.toggle()}
      >
        {language.t(
          delivery.supported() && delivery.choice() === "queue"
            ? "orchestra.chat.delivery.queue"
            : "orchestra.chat.delivery.steer",
        )}
      </button>
      <Show when={props.controller.view.submit.working?.()}>
        <button type="button" data-action="prompt-stop-run" onClick={() => props.controller.view.submit.onStop()}>
          {language.t("orchestra.chat.stop")}
        </button>
      </Show>
    </div>
  )
}
