import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server"
import { useCheckServerHealth } from "@/utils/server-health"

// Startup recovery has no router, Tabs, Command or server-scoped provider dependencies.
export function ConnectionRecovery(props: { onServerSelected?: (key: ServerConnection.Key) => void }) {
  const server = useServer()
  const language = useLanguage()
  const check = useCheckServerHealth()
  const [state, setState] = createStore({
    open: false,
    url: "",
    name: "",
    username: "",
    password: "",
    busy: false,
    error: "",
  })
  const fields = ["url", "name", "username", "password"] as const
  const edit = () => {
    const conn = server.current
    setState({
      open: true,
      url: conn?.http.url ?? "",
      name: conn?.displayName ?? "",
      username: conn?.http.username ?? "",
      password: conn?.http.password ?? "",
      error: "",
    })
  }
  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    if (state.busy) return
    const url = normalizeServerUrl(state.url)
    if (!url || !URL.canParse(url) || !/^https?:\/\//.test(url))
      return setState("error", language.t("orchestra.shell.server.invalid"))
    setState({ busy: true, error: "" })
    const conn: ServerConnection.Http = {
      type: "http",
      displayName: state.name || undefined,
      http: { url, username: state.username || undefined, password: state.password || undefined },
    }
    const result = await check(conn.http).then(
      (health) => ({ health }),
      (error: unknown) => ({ error }),
    )
    setState("busy", false)
    if (!("health" in result) || !result.health.healthy)
      return setState("error", language.t("orchestra.shell.server.failed"))
    const saved = server.add(conn)
    if (saved) props.onServerSelected?.(ServerConnection.key(saved))
  }
  return (
    <section class="w-full max-w-sm shrink-0 flex flex-col gap-3" aria-label={language.t("status.popover.tab.servers")}>
      <div class="flex gap-3 justify-center">
        <button
          type="button"
          class="rounded-md px-3 py-2 bg-surface-base text-text-strong"
          disabled={state.busy}
          onClick={edit}
        >
          {language.t("dialog.server.edit.title")}
        </button>
        <button
          type="button"
          class="rounded-md px-3 py-2 bg-surface-base text-text-strong"
          disabled={state.busy}
          onClick={() => setState({ open: true, url: "", name: "", username: "", password: "", error: "" })}
        >
          {language.t("dialog.server.add.title")}
        </button>
      </div>
      <Show when={state.open}>
        <form class="flex flex-col gap-3" onSubmit={submit}>
          <For each={fields}>
            {(field) => (
              <label class="flex flex-col gap-1 text-text-base">
                {language.t(`dialog.server.add.${field}`)}
                <input
                  class="rounded-md bg-surface-base p-2 text-text-strong"
                  type={field === "password" ? "password" : "text"}
                  value={state[field]}
                  disabled={state.busy}
                  autocomplete={field === "password" ? "current-password" : field === "username" ? "username" : "off"}
                  onInput={(event) => setState(field, event.currentTarget.value)}
                />
              </label>
            )}
          </For>
          <Show when={state.error}>
            <p role="alert">{state.error}</p>
          </Show>
          <button type="submit" class="rounded-md px-3 py-2 bg-surface-base text-text-strong" disabled={state.busy}>
            {language.t(state.busy ? "dialog.server.add.checking" : "common.save")}
          </button>
        </form>
      </Show>
    </section>
  )
}
