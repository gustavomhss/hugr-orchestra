import { getFilename } from "@orchestra/core/util/path"
import { useQuery } from "@tanstack/solid-query"
import { createMemo, createResource, For, Match, onCleanup, Show, Switch } from "solid-js"
import { toggleMcp } from "@/context/global-sync/mcp"
import { createStore } from "solid-js/store"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import type { ChapterPageProps } from "@/orchestra/chapter-route"
import { displayName } from "@/pages/layout/helpers"
import { pathKey } from "@/utils/path-key"
import { MxBadge, MxPage, MxToggle } from "./kit"
import { createMcpActions, mcpErrorDetail } from "./mcp-actions"
import { McpEditDialog, McpRemoveDialog, McpToolsDialog } from "./mcp-dialogs"
import { mcpAction, mcpBadges, type McpCard, mcpCards, mcpError, mcpMatches } from "./mcp-model"
import { createMcpSource } from "./mcp-source"
import "./mcp.css"

export default function McpPage(props: ChapterPageProps) {
  const language = useLanguage()
  const global = useGlobal()
  const platform = usePlatform()
  const serverSDK = useServerSDK()
  const sdk = useSDK()
  const sync = useServerSync()
  const key = pathKey(props.directory)
  const source = createMcpSource({
    server: props.server,
    directory: props.directory,
    sdk: sdk(),
    serverSDK: serverSDK(),
    // Called through a wrapper: window.fetch throws when invoked as a method of another object.
    fetch: (url, init) => (platform.fetch ?? globalThis.fetch)(url, init),
  })
  const [v1] = createResource(source.v1)
  // ServerSync keeps observing this profile's MCP status and resources after the page closes, so a
  // status event still refreshes the owning profile while another profile is open.
  sync().child(props.directory, { bootstrap: false, mcp: true })
  // The server's own query client, where ServerSync keeps the status popover and @-resources.
  const client = () => global.ensureServerCtx(props.server).queryClient
  // The page's own status query: ServerSync's copy retries in the background, while the page reports a
  // failed load at once.
  const status = useQuery(
    () => ({
      queryKey: [serverSDK().scope, key, "orchestra-mcp-status"] as const,
      queryFn: source.status,
      retry: false,
      refetchOnMount: "always",
    }),
    client,
  )
  const config = useQuery(
    () => ({
      queryKey: [serverSDK().scope, key, "orchestra-mcp-config"] as const,
      queryFn: source.config,
      retry: false,
    }),
    client,
  )
  const entries = useQuery(
    () => ({
      queryKey: [serverSDK().scope, key, "orchestra-mcp-entries"] as const,
      queryFn: source.entries,
      retry: false,
    }),
    client,
  )
  const tools = useQuery(
    () => ({ queryKey: [serverSDK().scope, key, "orchestra-mcp-tools"] as const, queryFn: source.tools, retry: false }),
    client,
  )
  const refresh = () =>
    Promise.all([
      status.refetch(),
      config.refetch(),
      entries.refetch(),
      tools.refetch(),
      client().refetchQueries(sync().queryOptions.mcp(key)),
      client().refetchQueries(sync().queryOptions.mcpResources(key)),
    ]).then(() => undefined)
  onCleanup(
    serverSDK().event.on(props.directory, (event) => {
      const type: string = event.type
      if (type === "mcp.status.changed") void refresh()
      if (type === "mcp.tools.changed") void tools.refetch()
    }),
  )
  const actions = createMcpActions()
  const [state, setState] = createStore({
    search: "",
    dialog: undefined as { type: "edit" | "tools" | "remove"; name?: string } | undefined,
  })
  const profile = createMemo(() => {
    const project = global
      .ensureServerCtx(props.server)
      .projects.list()
      .find((item) => pathKey(item.worktree) === key || item.sandboxes?.some((sandbox) => pathKey(sandbox) === key))
    return project ? displayName(project) : getFilename(props.directory) || props.directory
  })
  const cards = createMemo(() =>
    mcpCards(status.isPending || status.isError ? {} : (status.data ?? {}), config.data, entries.data, tools.data),
  )
  const byName = createMemo(() => new Map(cards().map((card) => [card.name, card])))
  const label = (card: McpCard) => language.t(mcpBadges[card.status.status].label)
  // Rows are keyed by name so a status refresh updates cards in place instead of recreating them.
  const visible = createMemo(() =>
    cards()
      .filter((card) => mcpMatches(card, state.search, label(card)))
      .map((card) => card.name),
  )
  const selected = createMemo(() => (state.dialog?.name ? byName().get(state.dialog.name) : undefined))
  const opener = { element: undefined as HTMLElement | undefined }
  const open = (dialog: NonNullable<typeof state.dialog>) => {
    if (!state.dialog && document.activeElement instanceof HTMLElement) opener.element = document.activeElement
    setState("dialog", dialog)
  }
  // The native close restores focus; when a dialog replaced another one, return it to the card.
  const close = () => {
    setState("dialog", undefined)
    queueMicrotask(() => {
      if (document.activeElement === document.body && opener.element?.isConnected) opener.element.focus()
    })
  }
  const toggle = (card: McpCard) =>
    actions.run(card.name, () =>
      toggleMcp({
        status: card.status.status,
        connect: () => source.connect(card.name),
        disconnect: () => source.disconnect(card.name),
        authenticate: () => source.authenticate(card.name),
        refresh,
      }),
    )
  // The refresh after a config write can take as long as MCP startup, so dialogs do not wait for it.
  const save = (name: string, value: Parameters<typeof source.save>[1]) =>
    source.save(name, value).then(() => void refresh())
  const remove = (name: string) => source.remove(name).then(() => void refresh())

  return (
    <MxPage
      id="orchestra-mcp"
      eyebrow={language.t("orchestra.mcp.eyebrow", { profile: profile() })}
      title={language.t("orchestra.nav.mcp")}
      description={language.t("orchestra.mcp.description")}
      action={
        <button type="button" class="mx-btn primary" onClick={() => open({ type: "edit" })}>
          {language.t("orchestra.mcp.add")}
        </button>
      }
    >
      <div class="mx-toolbar">
        <input
          class="mx-search"
          type="search"
          placeholder={language.t("orchestra.mcp.searchPlaceholder")}
          aria-label={language.t("orchestra.mcp.search")}
          value={state.search}
          onInput={(event) => setState("search", event.currentTarget.value)}
        />
        <MxBadge>
          <bdi title={props.directory}>{profile()}</bdi>
        </MxBadge>
      </div>
      <Switch>
        <Match when={status.isPending}>
          <div class="mx-empty" role="status">
            {language.t("orchestra.mcp.loading")}
          </div>
        </Match>
        <Match when={status.isError}>
          <div class="mx-empty orchestra-mcp-message" role="alert">
            <p>{language.t("orchestra.mcp.loadFailed")}</p>
            <p>{mcpErrorDetail(status.error)}</p>
            <button type="button" class="mx-btn" disabled={status.isFetching} onClick={() => void status.refetch()}>
              {language.t("orchestra.mcp.retry")}
            </button>
          </div>
        </Match>
        <Match when={!cards().length}>
          <div class="mx-empty" role="status">
            {language.t("orchestra.mcp.empty")}
            <br />
            {language.t("orchestra.mcp.emptyHint")}
          </div>
        </Match>
        <Match when={!visible().length}>
          <div class="mx-empty" role="status">
            {language.t("orchestra.mcp.noMatches")}
          </div>
        </Match>
        <Match when={visible().length}>
          <div class="mx-grid" role="list" aria-label={language.t("orchestra.nav.mcp")}>
            <For each={visible()}>
              {(name) => (
                <Show when={byName().get(name)}>
                  {(card) => (
                    <article
                      class="mx-card orchestra-mcp-card"
                      role="listitem"
                      data-mcp-name={name}
                      data-status={card().status.status}
                      aria-busy={!!actions.state.pending[name]}
                    >
                      <div class="mx-card-top">
                        <span class="mx-mark">
                          <svg class="orchestra-mcp-ic" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M5 2v3M11 2v3M3 5h10v3a5 5 0 0 1-10 0V5ZM8 13v2" />
                          </svg>
                        </span>
                        <h3>
                          <bdi>{name}</bdi>
                        </h3>
                      </div>
                      <Show when={card().endpoint}>
                        {(endpoint) => (
                          <p>
                            <bdi>{endpoint()}</bdi>
                          </p>
                        )}
                      </Show>
                      <div class="mx-meta">
                        <span class={["mx-badge", mcpBadges[card().status.status].tone].filter(Boolean).join(" ")}>
                          {label(card())}
                        </span>
                        <Show when={card().transport}>{(transport) => <MxBadge>{transport()}</MxBadge>}</Show>
                        <Show when={card().tools}>
                          {(list) => (
                            <MxBadge>
                              {language.t(
                                list().length === 1 ? "orchestra.mcp.toolCountOne" : "orchestra.mcp.toolCount",
                                { count: list().length },
                              )}
                            </MxBadge>
                          )}
                        </Show>
                      </div>
                      <Show when={mcpError(card().status)}>
                        {(detail) => <p class="orchestra-mcp-detail">{detail()}</p>}
                      </Show>
                      <Show when={actions.state.failures[name]}>
                        {(failure) => (
                          <p role="alert" class="orchestra-mcp-detail">
                            {language.t("orchestra.mcp.actionError", {
                              detail: failure().detail ?? language.t("common.requestFailed"),
                            })}
                          </p>
                        )}
                      </Show>
                      <footer class="mx-card-foot">
                        <div>
                          <button type="button" class="mx-btn" onClick={() => open({ type: "edit", name })}>
                            {language.t("orchestra.mcp.configure")}
                          </button>{" "}
                          <button type="button" class="mx-btn" onClick={() => open({ type: "tools", name })}>
                            {language.t("orchestra.mcp.tools")}
                          </button>
                        </div>
                        <Show
                          when={mcpAction(card().status.status) !== "authenticate"}
                          fallback={
                            <button
                              type="button"
                              class="mx-btn"
                              disabled={!!actions.state.pending[name]}
                              onClick={() => void toggle(card())}
                            >
                              {language.t("orchestra.mcp.authenticate")}
                            </button>
                          }
                        >
                          <MxToggle
                            checked={card().status.status === "connected"}
                            label={language.t("orchestra.mcp.enable", { name })}
                            disabled={!mcpAction(card().status.status) || !!actions.state.pending[name]}
                            onChange={() => void toggle(card())}
                          />
                        </Show>
                      </footer>
                    </article>
                  )}
                </Show>
              )}
            </For>
          </div>
          <p class="mx-note">{language.t("orchestra.mcp.note")}</p>
        </Match>
      </Switch>
      <Switch>
        <Match when={state.dialog?.type === "edit"}>
          <McpEditDialog
            card={selected()}
            names={cards().map((card) => card.name)}
            writable={v1() !== false}
            onSave={save}
            onRemove={() => setState("dialog", { type: "remove", name: state.dialog?.name })}
            onClose={close}
          />
        </Match>
        <Match when={state.dialog?.type === "tools" && selected()}>
          {(card) => <McpToolsDialog card={card()} status={label(card())} supported={v1() !== false} onClose={close} />}
        </Match>
        <Match when={state.dialog?.type === "remove" && state.dialog.name}>
          {(name) => (
            <McpRemoveDialog name={name()} profile={profile()} onConfirm={() => remove(name())} onClose={close} />
          )}
        </Match>
      </Switch>
    </MxPage>
  )
}
