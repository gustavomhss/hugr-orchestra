import { ButtonV2 } from "@opencode-ai/ui/v2/button-v2"
import { Switch } from "@opencode-ai/ui/v2/switch-v2"
import { TextInputV2 } from "@opencode-ai/ui/v2/text-input-v2"
import { useQuery } from "@tanstack/solid-query"
import { createMemo, createResource, For, onCleanup, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { pathKey } from "@/utils/path-key"
import { createMcpActions, mcpAction, mcpErrorDetail, mcpStatusLabels } from "./mcp-actions"
import "./mcp.css"

export default function McpPage(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useServerSDK()
  const [protocol] = createResource(() => sdk().protocol)

  return (
    <section class="orchestra-mcp" aria-labelledby="orchestra-mcp-title">
      <header>
        <h1 id="orchestra-mcp-title">{language.t("orchestra.nav.mcp")}</h1>
        <p>{language.t("orchestra.mcp.description")}</p>
      </header>
      <Show when={protocol.error}>
        <p role="alert">{language.t("orchestra.mcp.loadFailed")}</p>
      </Show>
      <Show when={protocol.loading}>
        <p role="status">{language.t("orchestra.mcp.loading")}</p>
      </Show>
      <Show when={protocol() === "v2"}>
        <p role="status">{language.t("orchestra.mcp.unavailable")}</p>
      </Show>
      <Show when={protocol() === "v1"}>
        <McpInventory {...props} />
      </Show>
    </section>
  )
}

function McpInventory(props: ChapterPageProps) {
  const language = useLanguage()
  const sync = useServerSync()
  const sdk = useServerSDK()
  // ServerSync owns a different query client from the route. Its child must have
  // MCP enabled so the existing dispatcher can resolve the current row status.
  const child = sync().child(props.directory, { bootstrap: false, mcp: true })[0]
  const query = useQuery(() => ({
    ...sync().queryOptions.mcp(pathKey(props.directory)),
    retry: false,
    refetchOnMount: "always",
  }))
  const actions = createMcpActions(async (name) => {
    if (!child.mcp[name]?.status) {
      sync().disableMcp(props.directory)
      sync().child(props.directory, { bootstrap: false, mcp: true })
      throw new Error(language.t("common.requestFailed"))
    }
    await sync().mcp.toggle(props.directory, name)
    // The dispatcher refreshes its own cache; refresh the route's observer too.
    await query.refetch({ throwOnError: true })
  })
  onCleanup(
    sdk().event.on(props.directory, (event) => {
      const type: string = event.type
      if (type === "mcp.status.changed") void query.refetch()
    }),
  )
  const [state, setState] = createStore({ search: "" })
  const items = createMemo(() =>
    Object.entries(query.isPending || query.isError ? {} : (query.data ?? {}))
      .filter(([name]) => name.toLowerCase().includes(state.search.trim().toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b)),
  )

  return (
    <>
      <div class="orchestra-mcp-toolbar">
        <TextInputV2
          type="search"
          aria-label={language.t("orchestra.mcp.search")}
          placeholder={language.t("orchestra.mcp.search")}
          value={state.search}
          onInput={(event) => setState("search", event.currentTarget.value)}
        />
        <bdi class="orchestra-mcp-directory" title={props.directory}>
          {props.directory}
        </bdi>
      </div>
      <Show when={query.isPending}>
        <p role="status">{language.t("orchestra.mcp.loading")}</p>
      </Show>
      <Show when={!query.isPending && query.isError}>
        <div role="alert" class="orchestra-mcp-message">
          <p>{language.t("orchestra.mcp.loadFailed")}</p>
          <p>{mcpErrorDetail(query.error)}</p>
          <ButtonV2 variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
            {language.t("orchestra.mcp.retry")}
          </ButtonV2>
        </div>
      </Show>
      <Show when={!query.isPending && !query.isError && !items().length}>
        <p role="status">
          {language.t(Object.keys(query.data ?? {}).length ? "orchestra.mcp.noMatches" : "dialog.mcp.empty")}
        </p>
      </Show>
      <Show when={!query.isPending && !query.isError && items().length}>
        <ul class="orchestra-mcp-list" aria-label={language.t("orchestra.nav.mcp")}>
          <For each={items()}>
            {([name, status]) => (
              <li data-mcp-name={name} data-status={status.status} class="orchestra-mcp-row">
                <div class="orchestra-mcp-details">
                  <h2>
                    <bdi>{name}</bdi>
                  </h2>
                  <p class="orchestra-mcp-status">{language.t(mcpStatusLabels[status.status])}</p>
                  {"error" in status && <p class="orchestra-mcp-error">{status.error}</p>}
                  <Show when={actions.state.failures[name]}>
                    {(failure) => (
                      <p role="alert" class="orchestra-mcp-error">
                        <Show when={failure().detail} fallback={language.t("common.requestFailed")}>
                          {(detail) => language.t("orchestra.mcp.actionError", { detail: detail() })}
                        </Show>
                      </p>
                    )}
                  </Show>
                </div>
                <div class="orchestra-mcp-actions" aria-busy={!!actions.state.pending[name]}>
                  <Show when={mcpAction(status.status) === "authenticate"}>
                    <ButtonV2
                      variant="outline"
                      disabled={!child.mcp_ready || actions.state.pending[name]}
                      onClick={() => void actions.run(name, status.status)}
                    >
                      {language.t("orchestra.mcp.authenticate")}
                    </ButtonV2>
                  </Show>
                  <Show when={mcpAction(status.status) !== "authenticate"}>
                    <Switch
                      checked={status.status === "connected"}
                      disabled={!child.mcp_ready || status.status === "pending" || actions.state.pending[name]}
                      onChange={() => void actions.run(name, status.status)}
                    >
                      {language.t("orchestra.mcp.connected")}
                    </Switch>
                  </Show>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </>
  )
}
