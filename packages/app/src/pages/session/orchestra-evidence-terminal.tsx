import { Show, createMemo, onCleanup } from "solid-js"
import { createStore } from "solid-js/store"
import { Terminal } from "@/components/terminal"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useTerminal } from "@/context/terminal"
import { useSessionLayout } from "@/pages/session/session-layout"
import { errorMessage } from "@/pages/layout/helpers"
import { createSessionOwnership } from "./session-ownership"

// The Dock's Terminal pane shows the workspace's active terminal; it never starts one by itself. One
// PTY has at most one renderer: choosing this pane moves an open bottom terminal here and leaving it
// moves it back, while opening the bottom panel meanwhile hands the terminal over to it. A pane that is
// only restored leaves an open bottom terminal where it is. Closing or leaving the pane never ends the
// process.
export function OrchestraEvidenceTerminal(props: { takeover: boolean }) {
  const terminal = useTerminal()
  const language = useLanguage()
  const layout = useLayout()
  const session = useSessionLayout()
  const owner = layout.view(session.sessionKey())
  const ownership = createSessionOwnership(session.sessionKey)
  const bottom = props.takeover && owner.terminal.opened()
  if (bottom) owner.terminal.close()
  onCleanup(() => {
    if (bottom && !owner.terminal.opened()) owner.terminal.open()
  })
  const [state, setState] = createStore({
    error: undefined as string | undefined,
    creationError: undefined as string | undefined,
    creating: false,
  })
  const active = createMemo(() => terminal.all().find((pty) => pty.id === terminal.active())?.id)
  const create = () => {
    if (state.creating) return
    const attempt = ownership.capture()
    setState({ creating: true, creationError: undefined })
    void terminal.new({ focus: true }).then((result) =>
      attempt.run(() => {
        setState({
          creating: false,
          creationError:
            result.status === "failed"
              ? errorMessage(result.error, language.t("error.chain.unknown")) || language.t("error.chain.unknown")
              : undefined,
        })
      }),
    )
  }

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
            when={!state.error}
            fallback={
              <div class="orchestra-dock-state" role="alert">
                <span>{state.error}</span>
                <button type="button" onClick={() => setState("error", undefined)}>
                  {language.t("orchestra.dock.retry")}
                </button>
              </div>
            }
          >
            <Show
              when={active()}
              keyed
              fallback={
                <div
                  class="orchestra-dock-state"
                  role={state.creationError ? "alert" : "status"}
                  aria-label={state.creationError ? language.t("command.terminal.new") : undefined}
                >
                  <Show when={state.creationError}>
                    <strong>{language.t("common.requestFailed")}</strong>
                  </Show>
                  <span>
                    {state.creating
                      ? language.t("terminal.loading")
                      : (state.creationError ?? language.t("orchestra.dock.terminal.empty"))}
                  </span>
                  <button type="button" disabled={state.creating} aria-busy={state.creating} onClick={create}>
                    {language.t(state.creationError ? "orchestra.dock.retry" : "command.terminal.new")}
                  </button>
                </div>
              }
            >
              {(id) => {
                const ops = terminal.bind()
                return (
                  <Show when={terminal.all().find((item) => item.id === id)}>
                    {(pty) => (
                      <div id={`terminal-wrapper-${id}`} class="orchestra-dock-terminal">
                        <Terminal
                          pty={pty()}
                          autoFocus={terminal.focusRequested(id)}
                          onAutoFocus={() => terminal.consumeFocus(id)}
                          onConnect={() => ops.trim(id)}
                          onCleanup={ops.update}
                          onConnectError={(error) =>
                            setState(
                              "error",
                              error instanceof Error ? error.message : language.t("orchestra.dock.terminal.failed"),
                            )
                          }
                        />
                      </div>
                    )}
                  </Show>
                )
              }}
            </Show>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
