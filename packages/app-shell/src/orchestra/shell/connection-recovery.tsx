import { For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { normalizeServerUrl, ServerConnection, useServer } from "@/context/server"
import { useCheckServerHealth } from "@/utils/server-health"

// Startup recovery has no router, Tabs, Command or server-scoped provider dependencies.
export function ConnectionRecovery(props: { onServerSelected?: (key: ServerConnection.Key) => void }) {
  const server = useServer()
  const language = useLanguage()
  const platform = usePlatform()
  const check = useCheckServerHealth()
  const [state, setState] = createStore({
    open: false,
    // The unreachable entry being edited. Saving a different address replaces it instead of adding a second one.
    replace: undefined as ServerConnection.Key | undefined,
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
      replace: conn?.type === "http" ? ServerConnection.key(conn) : undefined,
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
    if (!saved) return
    const key = ServerConnection.key(saved)
    if (state.replace && state.replace !== key) await replaceEntry(state.replace, key)
    props.onServerSelected?.(key)
  }
  // The default server is what the app opens on launch, so it moves with the entry it pointed at.
  const replaceEntry = async (previous: ServerConnection.Key, next: ServerConnection.Key) => {
    server.remove(previous)
    const isDefault = (await platform.getDefaultServer?.().catch(() => null)) === previous
    if (isDefault) await Promise.resolve(platform.setDefaultServer?.(next)).catch(() => undefined)
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
          onClick={() =>
            setState({ open: true, replace: undefined, url: "", name: "", username: "", password: "", error: "" })
          }
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
          <div class="flex gap-3 justify-end">
            <button
              type="button"
              class="rounded-md px-3 py-2 bg-surface-base text-text-strong"
              disabled={state.busy}
              onClick={() => setState({ open: false, error: "" })}
            >
              {language.t("common.cancel")}
            </button>
            <button type="submit" class="rounded-md px-3 py-2 bg-surface-base text-text-strong" disabled={state.busy}>
              {language.t(state.busy ? "dialog.server.add.checking" : "common.save")}
            </button>
          </div>
        </form>
      </Show>
    </section>
  )
}
