import { createEffect, createMemo, onCleanup, Show } from "solid-js"
import { createStore, reconcile } from "solid-js/store"
import { useLocation, useNavigate } from "@solidjs/router"
import { useQueries, useQuery, useQueryClient } from "@tanstack/solid-query"
import type { Agent } from "@/v2-wire"
import type { AgentFileInput } from "@/v2-types"
import { getFilename } from "@orchestra/core/util/path"
import { useLanguage } from "@/context/language"
import { withServerReason } from "@/utils/server-errors"
import { ServerConnection } from "@/context/server"
import { useServerSync } from "@/context/server-sync"
import { useSDK } from "@/context/sdk"
import { useServerSDK } from "@/context/server-sdk"
import { setCrumbTrail } from "@/orchestra/crumbs"
import { ClientError } from "@orchestra/client"
import { useTabs } from "@/context/tabs"
import { directoryKey, normalizeAgentList } from "@/context/global-sync/utils"
import { agentKey } from "@/context/agent-identity"
import type { ChapterPageProps } from "../chapter-route"
import { AgentDialog } from "./agents-dialog"
import { agentModels, agentRoster, agentUnavailable, errorStatus, restoreInput } from "./agents-roster"
import { modelUnavailable } from "@/components/subagent-model-rules"
import { AgentsRoster } from "./agents-view"
import { agentSkills, AgentScreen } from "./agents-detail"
import { AtlasAPIError, createAtlasAPI, isAtlasEmpty } from "./atlas/atlas-api"
import { atlasHref } from "./atlas/atlas-route"
import "./agents.css"

export default function Agents(props: ChapterPageProps) {
  const language = useLanguage()
  const sdk = useSDK()
  const serverSync = useServerSync()
  // The chapter owns its catalog query. Full directory bootstrap would read /agent again in its owner cache.
  // `mcp` keeps the configured MCP servers in the store, for the per-server rows of an agent's tool permissions.
  const sync = () => serverSync().child(props.directory, { bootstrap: false, mcp: true })
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
  const location = useLocation()
  const navigate = useNavigate()
  const serverSDK = useServerSDK()
  const queryClient = useQueryClient()
  // `/orchestra/agents/<id>` opens that agent's page; the bare chapter shows the roster.
  const selectedID = createMemo(() =>
    decodeURIComponent(location.pathname.match(/^\/orchestra\/agents\/([^/]+)/)?.[1] ?? ""),
  )
  // A refetch after a save replaces the agent objects; the page stays mounted because it is keyed by the id.
  const selected = () => (query.isSuccess ? query.data.find((agent) => agentKey(agent) === selectedID()) : undefined)
  const details = useQueries(() => ({
    queries: (query.isSuccess ? query.data : []).map((agent) => ({
      queryKey: ["agent-detail", props.directory, agentKey(agent)],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        sdk()
          .orchestra.agents.detail({ agentID: agentKey(agent), location: { directory: props.directory } }, { signal })
          .then((result) => result.data),
      retry: false,
      staleTime: 60_000,
    })),
  }))
  const detail = (agent: Agent) => {
    const index = (query.data ?? []).indexOf(agent)
    return index < 0 ? undefined : details[index]
  }
  const atlas = useQuery(() => ({
    queryKey: ["agent-atlas", props.directory],
    queryFn: ({ signal }) => createAtlasAPI(sdk(), serverSDK().orchestra).snapshot(signal),
    retry: false,
    staleTime: 60_000,
  }))
  const memory = (agent: Agent) => {
    if (atlas.isError)
      return {
        missing: atlas.error instanceof AtlasAPIError && atlas.error.reason === "unsupported" ? "unsupported" : "error",
      } as const
    if (!atlas.isSuccess) return
    if (isAtlasEmpty(atlas.data)) return { missing: "empty" } as const
    return { records: atlas.data.memory[agentKey(agent)] ?? [] }
  }
  const stats = (agent: Agent) => {
    const found = detail(agent)?.data
    const records = memory(agent)
    return {
      tools: found?.tools.length,
      skills: found || agent.skills?.length ? agentSkills(agent, found).length : undefined,
      memories: !records
        ? undefined
        : "records" in records
          ? records.records?.length
          : records.missing === "empty"
            ? 0
            : undefined,
    }
  }
  createEffect(() => {
    const agent = selected()
    setCrumbTrail(agent ? [agent.name] : [])
  })
  onCleanup(() => setCrumbTrail([]))
  const modelName = (agent: Agent) =>
    agent.model && providers.isSuccess
      ? providers.data.all.get(agent.model.providerID)?.models[agent.model.modelID]?.name
      : undefined
  const unsupportedError = () => new Error(language.t("orchestra.agents.error.unsupported"), { cause: { status: 404 } })
  // The client rejects a declared failure with the server's body and an undeclared answer with a ClientError carrying
  // its status. A 200 that is not JSON is a server's embedded web app answering a route it lacks.
  const requestError = (error: unknown): never => {
    if (error instanceof ClientError && error.reason === "UnsupportedContentType") throw unsupportedError()
    const tag = error && typeof error === "object" && "_tag" in error ? error._tag : undefined
    const status =
      error instanceof ClientError
        ? errorStatus(error)
        : tag === "ConflictError"
          ? 409
          : tag === "InvalidRequestError"
            ? 400
            : undefined
    const kind = error && typeof error === "object" && "kind" in error ? error.kind : undefined
    throw new Error(withServerReason(language.t("orchestra.agents.error.save"), error), { cause: { status, kind } })
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
    await queryClient.invalidateQueries({ queryKey: ["agent-detail", props.directory, name] })
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
  // An agent is working while any of its Sessions in this directory is not idle.
  const working = (agent: Agent) =>
    sync()[0].session.some((session) => session.agent === agentKey(agent) && sync()[0].session_working(session.id))

  const openChat = () => {
    setState({ opening: true, failed: false })
    void tabs
      // Every desktop session runs on Maestro (#31), so the draft carries no agent choice.
      .newDraft({ server: ServerConnection.key(props.server), directory: props.directory })
      .catch(() => setState({ opening: false, failed: true }))
  }

  const rosterView = () => (
    <>
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
                {language.t(agentUnavailable(query.error) ? "orchestra.agents.unavailable" : "orchestra.agents.error")}
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
              modelName={modelName}
              stats={stats}
              working={working}
              onOpen={(agent) => navigate(`/orchestra/agents/${encodeURIComponent(agentKey(agent))}`)}
              onChat={openChat}
              opening={state.opening}
              chatReady={tabs.ready()}
            />
          </Show>
        </Show>
      </Show>
    </>
  )

  return (
    <section class="mx-page orchestra-agents" aria-labelledby="agents-title">
      <div class="agents-inner">
        <Show when={selected() && selectedID()} keyed fallback={rosterView()}>
          {(_) => (
            <Show when={selected()}>
              {(agent) => (
                <AgentScreen
                  agent={agent()}
                  agents={query.data ?? []}
                  directory={props.directory}
                  models={models()}
                  modelsStatus={providers.status}
                  onRetryModels={() => void providers.refetch()}
                  status={availability(agent())}
                  working={working(agent())}
                  modelName={modelName(agent())}
                  detail={detail(agent())?.data}
                  mcpServers={Object.keys(sync()[0].mcp)}
                  detailFailed={detail(agent())?.isError}
                  memory={memory(agent())}
                  memoryHref={atlasHref("memory", agentKey(agent()))}
                  load={load}
                  save={save}
                  onRemoved={(removed) => {
                    setState({ removed, restoreFailed: false })
                    navigate("/orchestra/agents")
                  }}
                  onBack={() => navigate("/orchestra/agents")}
                  onOpenAtlas={() => navigate(atlasHref("memory", agentKey(agent())))}
                  onChat={openChat}
                  opening={state.opening}
                  chatReady={tabs.ready()}
                />
              )}
            </Show>
          )}
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
