import { Show, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Terminal } from "@/components/terminal"
import { useLanguage } from "@/context/language"
import { useTerminal } from "@/context/terminal"
import { useSessionLayout } from "@/pages/session/session-layout"

// The Dock's Terminal pane shows the workspace's active terminal; it never starts one by itself. One
// PTY has at most one renderer: selecting this pane moves an open bottom terminal here and leaving it
// moves it back, while opening the bottom panel meanwhile hands the terminal over to it. Closing or
// leaving the pane never ends the process.
export function OrchestraEvidenceTerminal() {
  const terminal = useTerminal()
  const language = useLanguage()
  const owner = useSessionLayout().view()
  const bottom = owner.terminal.opened()
  if (bottom) owner.terminal.close()
  onCleanup(() => {
    if (bottom && !owner.terminal.opened()) owner.terminal.open()
  })
  const [recovered, setRecovered] = createStore<Record<string, boolean>>({})
  const active = createMemo(() => terminal.all().find((pty) => pty.id === terminal.active())?.id)

  return (
    <div class="orchestra-dock-local" data-pane="terminal">
      <Show
        when={terminal.ready()}
        fallback={
          <p class="orchestra-dock-note" role="status">
            {language.t("terminal.loading")}
          </p>
        }
      >
        <Show
          when={!owner.terminal.opened()}
          fallback={
            <div class="orchestra-dock-state" role="status">
              <span>{language.t("orchestra.dock.terminal.elsewhere")}</span>
              <button type="button" onClick={() => owner.terminal.close()}>
                {language.t("orchestra.dock.terminal.showHere")}
              </button>
            </div>
          }
        >
          <Show
            when={active()}
            keyed
            fallback={
              <div class="orchestra-dock-state" role="status">
                <span>{language.t("orchestra.dock.terminal.empty")}</span>
                <button type="button" onClick={() => terminal.new({ focus: true })}>
                  {language.t("command.terminal.new")}
                </button>
              </div>
            }
          >
            {(id) => {
              const ops = terminal.bind()
              return (
                <Show when={terminal.all().find((item) => item.id === id)}>
                  {(pty) => {
                    const key = () => String(pty().titleNumber || pty().title || id)
                    return (
                      <div id={`terminal-wrapper-${id}`} class="orchestra-dock-terminal">
                        <Terminal
                          pty={pty()}
                          autoFocus={terminal.focusRequested(id)}
                          onAutoFocus={() => terminal.consumeFocus(id)}
                          onConnect={() => {
                            setRecovered(key(), false)
                            ops.trim(id)
                          }}
                          onCleanup={ops.update}
                          onConnectError={() => {
                            if (recovered[key()]) return
                            setRecovered(key(), true)
                            void ops.clone(id)
                          }}
                        />
                      </div>
                    )
                  }}
                </Show>
              )
            }}
          </Show>
        </Show>
      </Show>
    </div>
  )
}
