import { Popover } from "@orchestra/ui/popover"
import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { relative } from "@/orchestra/actions/format"
import { useSessionCapabilities } from "./capabilities"

/**
 * The header's "N running" pill. It reads only `process_control` results in the transcript, so it shows the latest
 * status the agent observed and offers no Stop.
 */
export function CapabilityProcesses() {
  const language = useLanguage()
  const capabilities = useSessionCapabilities()
  const [open, setOpen] = createSignal(false)
  const running = () => capabilities?.running() ?? 0
  return (
    <Show when={running() > 0}>
      <Popover
        open={open()}
        onOpenChange={setOpen}
        triggerAs="button"
        triggerProps={{
          type: "button",
          // Kobalte marks the open trigger with data-expanded; triggerProps types reject data-* keys, so style by class.
          class: "capability-processes-trigger",
          "aria-label": language.t("orchestra.capabilityProcesses.running", { n: running() }),
        }}
        trigger={
          <>
            <span data-slot="capability-processes-dot" aria-hidden="true" />
            <span>{language.t("orchestra.capabilityProcesses.running", { n: running() })}</span>
          </>
        }
        title={language.t("orchestra.capabilityProcesses.title")}
        placement="bottom-end"
        gutter={6}
        class="[&_[data-slot=popover-body]]:p-0 w-[340px] max-w-[calc(100vw-40px)]"
      >
        <div data-component="capability-processes">
          <ul data-slot="capability-processes-list">
            <For each={capabilities?.processes() ?? []}>
              {(item) => (
                <li>
                  <button
                    type="button"
                    data-slot="capability-process"
                    title={language.t("orchestra.capabilityProcesses.reveal")}
                    onClick={() => {
                      setOpen(false)
                      capabilities?.revealCall(item.callID)
                    }}
                  >
                    <span data-slot="capability-process-argv">
                      {item.argv ?? language.t("orchestra.capabilityProcesses.unnamed", { id: item.id })}
                    </span>
                    <span data-slot="capability-process-meta">
                      <span data-slot="capability-process-state" data-state={item.state}>
                        {language.t(`orchestra.capabilityProcesses.state.${item.state}`)}
                      </span>
                      <Show when={item.exit?.code !== undefined}>
                        <span>{language.t("orchestra.capabilityProcesses.exit.code", { code: String(item.exit?.code) })}</span>
                      </Show>
                      <Show when={item.exit?.signal}>
                        {(signal) => <span>{language.t("orchestra.capabilityProcesses.exit.signal", { signal: signal() })}</span>}
                      </Show>
                      <time datetime={new Date(item.time).toISOString()}>{relative(new Date(item.time).toISOString())}</time>
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
          <p data-slot="capability-processes-note">{language.t("orchestra.capabilityProcesses.note")}</p>
        </div>
      </Popover>
    </Show>
  )
}
