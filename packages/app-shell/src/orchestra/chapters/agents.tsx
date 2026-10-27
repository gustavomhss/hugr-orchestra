import { createEffect, createMemo, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useQuery } from "@tanstack/solid-query"
import type { Agent } from "@/v2-wire"
import type { AgentFileInput } from "@/v2-types"
import { getFilename } from "@orchestra/core/util/path"
import { useLanguage } from "@/context/language"
import { ServerConnection } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useSDK } from "@/context/sdk"
import { ClientError } from "@orchestra/client"
import { useTabs } from "@/context/tabs"
import { directoryKey, normalizeAgentList } from "@/context/global-sync/utils"
import type { ChapterPageProps } from "../chapter-route"
import { AgentDialog } from "./agents-dialog"
import { agentModels, agentRoster, agentUnavailable, errorStatus, restoreInput } from "./agents-roster"
import { modelUnavailable } from "@/components/subagent-model-rules"
import { AgentsRoster } from "./agents-view"
import "./agents.css"

export default function Agents(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSync = useServerSync()
  // The chapter owns its catalog query. Full directory bootstrap would read /agent again in its owner cache.
  const sync = () => serverSync().child(props.directory, { bootstrap: false })
  const tabs = useTabs()
  const providers = useQuery(() => serverSync().queryOptions.providers(directoryKey(props.directory)))
  const query = useQuery(() => {
    const options = serverSync().queryOptions.agents(directoryKey(props.directory))
    return {
      // Share bootstrap's cache and in-flight request. Page-initiated reads preserve HTTP status.
      ...options,
      queryFn: async ({ signal }) => {
        return sdk()
          .api.agent.list({ location: { directory: props.directory } }, { signal })
          .then((result) => normalizeAgentList(result.data))
      },
      staleTime: Infinity,
      retry: false,
    }
  })
  const [state, setState] = createStore({
    editing: undefined as { agent?: Agent } | undefined,
    pending: undefined as { directory: string; path: string } | undefined,
    opening: false,
    failed: false,
    // The agent just removed, until the person restores it or removes another.
    removed: undefined as { id: string; name: string } | undefined,
    restoring: false,
    restoreFailed: false,
  })
  createEffect(() => {
    if (query.isSuccess && query.data) sync()[1]("agent", reconcile(query.data))
  })
  const roster = createMemo(() => agentRoster(query.isSuccess ? query.data : []))
  const connected = createMemo(() => new Set(providers.isSuccess ? providers.data.connected : []))
  const models = createMemo(() =>
    agentModels(
      [...(providers.isSuccess ? providers.data.all.values() : [])].filter((provider) => connected().has(provider.id)),
    ),
  )
  const unsupportedError = () => new Error(language.t("orchestra.agents.error.unsupported"), { cause: { status: 404 } })
  // The client rejects a declared failure with the server's body and an undeclared answer with a ClientError carrying
  // its status. A 200 that is not JSON is a server's embedded web app answering a route it lacks.
  const requestError = (error: unknown): never => {
    if (error instanceof ClientError && error.reason === "UnsupportedContentType") throw unsupportedError()
    const tag = error && typeof error === "object" && "_tag" in error ? error._tag : undefined
    const status = error instanceof ClientError ? errorStatus(error) : tag === "ConflictError" ? 409 : tag === "InvalidRequestError" ? 400 : undefined
    const kind = error && typeof error === "object" && "kind" in error ? error.kind : undefined
    throw new Error(language.t("orchestra.agents.error.save"), { cause: { status, kind } })
  }

  // Agent files live in `<profile>/.orchestra/agent`; the server reloads its V2 agents after a write.
  const load = (name: string) =>
    sdk()
      .orchestra.agents.getFile({ agentID: name, location: { directory: props.directory } })
      .then((result) => result.data, requestError)
  const save = async (name: string, input: AgentFileInput) => {
    await sdk()
      .orchestra.agents.updateFile({ agentID: name, location: { directory: props.directory }, ...input })
      .catch(requestError)
    await query.refetch()
  }
  const restore = (removed: { id: string; name: string }) => {
    setState({ restoring: true, restoreFailed: false })
    void load(removed.id)
      .then((file) => {
        if (!file.exists || file.invalid) throw new Error("not restorable")
        return save(removed.id, restoreInput(file))
      })
      .then(() => setState("removed", undefined))
      .catch(() => setState("restoreFailed", true))
      .finally(() => setState("restoring", false))
  }
  const availability = (agent: Agent) => {
    // Unknown until this profile's provider catalog has loaded.
    if (!providers.isSuccess) return
    const provider = agent.model?.providerID
    if (agent.model && provider && connected().has(provider)) {
      const issue = modelUnavailable(providers.data.all.get(provider)?.models[agent.model.modelID])
      if (issue)
        return {
          ok: false,
          title: language.t(`orchestra.agents.model.${issue}`, { model: `${provider}/${agent.model.modelID}` }),
          modelIssue: true,
        }
    }
    if (provider ? connected().has(provider) : connected().size > 0) return { ok: true, title: undefined }
    return {
      ok: false,
      title: provider
        ? language.t("orchestra.agents.providerMissingTitle", { provider })
        : language.t("orchestra.agents.noProviderTitle"),
    }
  }
  const openChat = () => {
    setState({ opening: true, failed: false })
    void tabs
      // Every desktop session runs on Maestro (#31), so the draft carries no agent choice.
      .newDraft({ server: ServerConnection.key(props.server), directory: props.directory })
      .catch(() => setState({ opening: false, failed: true }))
  }

  return (
    <section class="mx-page orchestra-agents" aria-labelledby="agents-title">
      <div class="agents-inner">
        <header class="mx-heading">
          <div>
            <div class="mx-eyebrow">{language.t("orchestra.agents.title")}</div>
            <h1 id="agents-title">{language.t("orchestra.agents.headline")}</h1>
            <p>{language.t("orchestra.agents.headlineMuted")}</p>
          </div>
          <button
            type="button"
            class="mx-btn primary"
            disabled={!query.isSuccess}
            onClick={() => setState("editing", {})}
          >
            {language.t("orchestra.agents.create")}
          </button>
        </header>
        <Show when={state.removed}>
          {(removed) => (
            <p class="mx-note agents-removed" role="status">
              {language.t("orchestra.agents.removed", { name: removed().name })}{" "}
              <button type="button" class="mx-link" disabled={state.restoring} onClick={() => restore(removed())}>
                {language.t("orchestra.agents.restore")}
              </button>
            </p>
          )}
        </Show>
        <Show when={state.restoreFailed}>
          <p class="mx-error" role="alert">
            {language.t("orchestra.agents.restoreFailed")}
          </p>
        </Show>
        <Show when={state.pending?.directory === props.directory ? state.pending : undefined}>
          {(pending) => (
            <p class="mx-note agents-pending" role="status">
              {language.t("orchestra.agents.reloadPending", { path: pending().path })}
            </p>
          )}
        </Show>
        <Show
          when={!query.isPending}
          fallback={
            <p class="mx-empty" role="status">
              {language.t("orchestra.agents.loading")}
            </p>
          }
        >
          <Show
            when={!query.isError}
            fallback={
              <div class="mx-empty">
                <p role="alert">
                  {language.t(
                    agentUnavailable(query.error) ? "orchestra.agents.unavailable" : "orchestra.agents.error",
                  )}
                </p>
                <button type="button" class="mx-btn" disabled={query.isFetching} onClick={() => void query.refetch()}>
                  {language.t("orchestra.agents.refresh")}
                </button>
              </div>
            }
          >
            <Show
              when={roster().length > 0}
              fallback={
                <div class="mx-empty">
                  <p role="status">{language.t("orchestra.agents.empty")}</p>
                  <button type="button" class="mx-btn" disabled={query.isFetching} onClick={() => void query.refetch()}>
                    {language.t("orchestra.agents.refresh")}
                  </button>
                </div>
              }
            >
              <AgentsRoster
                agents={query.data ?? []}
                scope={getFilename(props.directory) || props.directory}
                availability={availability}
                onConfigure={(agent) => setState("editing", { agent })}
                onChat={openChat}
                opening={state.opening}
                chatReady={tabs.ready()}
              />
            </Show>
          </Show>
        </Show>
        <Show when={state.failed}>
          <p class="mx-error agents-draft-error" role="alert">
            {language.t("orchestra.agents.draftError")}
          </p>
        </Show>
      </div>
      <Show when={state.editing} keyed>
        {(editing) => (
          <AgentDialog
            agent={editing.agent}
            agents={query.data ?? []}
            directory={props.directory}
            models={models()}
            modelsStatus={providers.status}
            onRetryModels={() => void providers.refetch()}
            load={load}
            save={save}
            onRemoved={(removed) => setState({ removed, restoreFailed: false })}
            onClose={() => {
              // A save that finishes late must not close a dialog opened after this one.
              if (state.editing === editing) setState("editing", undefined)
            }}
          />
        )}
      </Show>
    </section>
  )
}
