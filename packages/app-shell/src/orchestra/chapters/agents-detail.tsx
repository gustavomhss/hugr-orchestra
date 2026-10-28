import { createMemo, For, Match, onMount, Show, Switch } from "solid-js"
import { createStore } from "solid-js/store"
import type { Agent } from "@/v2-wire"
import type { AgentFileInfo, AgentFileInput } from "@/v2-types"
import type { AgentsDetailOutput } from "@orchestra/client"
import { useLanguage } from "@/context/language"
import { agentKey } from "@/context/agent-identity"
import { AVATAR_LIBRARY, avatarFromFile } from "../avatars"
import type { AtlasSnapshot } from "./atlas/atlas-types"
import {
  AGENT_MODES,
  agentDraft,
  agentFileInput,
  agentFileTarget,
  agentUnavailable,
  draftError,
  errorKind,
  errorStatus,
  inheritedAction,
  isMaestro,
  mcpPermission,
  PERMISSION_TOOLS,
  removeInput,
  type ModelGroup,
  type PermissionChoice,
} from "./agents-roster"
import { AgentPortrait } from "./agents-view"

const TABS = ["overview", "prompt", "tools", "toolkit", "skills", "memory"] as const
type Tab = (typeof TABS)[number]

export type AgentDetail = AgentsDetailOutput["data"]
export type AgentMemory = AtlasSnapshot["memory"][string]
/** The agent's Atlas records: undefined while the snapshot loads, a reason when there is no store to read. */
export type AgentMemoryState = { records: AgentMemory } | { missing: "empty" | "unsupported" | "error" } | undefined

/**
 * The seat's skill roots, each holding the nodes below it, then the catalog skills the seat does not already carry.
 * Only the roots and catalog skills are listed to the agent; a child opens through its parent.
 */
export function agentSkills(agent: Agent, detail: AgentDetail | undefined): AgentSkill[] {
  const tree = agent.skills ?? []
  const below = Map.groupBy(
    tree.filter((skill) => skill.parent !== undefined),
    (skill) => skill.parent ?? "",
  )
  const node = (skill: (typeof tree)[number]): AgentSkill => ({
    name: skill.name,
    description: skill.description,
    when: skill.when,
    location: undefined,
    children: (below.get(skill.name) ?? []).map(node),
  })
  const names = new Set(tree.map((skill) => skill.name))
  return [
    ...tree.filter((skill) => skill.parent === undefined).map(node),
    ...(detail?.skills ?? [])
      .filter((skill) => !names.has(skill.name))
      .map((skill) => ({
        name: skill.name,
        description: skill.description ?? undefined,
        when: undefined,
        location: skill.location,
        children: [],
      })),
  ]
}

type AgentSkill = {
  name: string
  description: string | undefined
  when: string | undefined
  location: string | undefined
  children: AgentSkill[]
}

// The page for one agent (`/orchestra/agents/<id>`): who it is, what it is told, what it can use and what it remembers.
export function AgentScreen(props: {
  agent: Agent
  agents: readonly Agent[]
  directory: string
  models: readonly ModelGroup[]
  modelsStatus?: "pending" | "error" | "success"
  onRetryModels?: () => void
  status?: { ok: boolean; title?: string; modelIssue?: boolean }
  working?: boolean
  modelName?: string
  detail?: AgentDetail
  detailFailed?: boolean
  /** Configured MCP servers in this project; each gets one permission row. */
  mcpServers: readonly string[]
  memory: AgentMemoryState
  memoryHref: string
  load: (id: string) => Promise<AgentFileInfo>
  save: (id: string, input: AgentFileInput) => Promise<void>
  onRemoved: (removed: { id: string; name: string }) => void
  onBack: () => void
  onOpenAtlas: () => void
  onChat: () => void
  opening?: boolean
  chatReady?: boolean
}) {
  const language = useLanguage()
  const maestro = isMaestro(props.agent)
  const [state, setState] = createStore({
    tab: "overview" as Tab,
    phase: "loading" as "loading" | "edit" | "confirm",
    file: undefined as AgentFileInfo | undefined,
    loadError: "" as "" | "unsupported" | "failed",
    saving: false,
    saved: false,
    error: "",
    // The draft as last loaded, to tell whether anything changed.
    baseline: "",
  })
  const [draft, setDraft] = createStore(agentDraft(props.agent, undefined))
  const readOnly = () => state.loadError !== "" || state.file?.invalid === true
  const dirty = () => state.phase === "edit" && !readOnly() && JSON.stringify(draft) !== state.baseline
  const relative = (filepath: string) =>
    filepath.startsWith(`${props.directory}/`) ? filepath.slice(props.directory.length + 1) : filepath
  const skills = createMemo(() => agentSkills(props.agent, props.detail))
  const memory = createMemo(() => {
    const memory = props.memory
    if (!memory || !("records" in memory)) return
    return [...memory.records].sort((a, b) => b.seq - a.seq)
  })
  const memoryCount = (kind: string) => memory()?.filter((record) => record.kind === kind).length ?? 0
  const count = (tab: Tab) => {
    if (tab === "tools") return props.detail?.tools.length
    if (tab === "toolkit")
      return props.detail?.engines.length
    if (tab === "skills") return props.detail || props.agent.skills?.length ? skills().length : undefined
    if (tab === "memory") return memory()?.length
  }

  const load = () => {
    setState({ phase: "loading", loadError: "" })
    props
      // Agent files are keyed by the stable id; the display name is configurable.
      .load(agentKey(props.agent))
      .then((file) => {
        setDraft(agentDraft(props.agent, file, props.mcpServers))
        setState({ phase: "edit", file, baseline: JSON.stringify(agentDraft(props.agent, file, props.mcpServers)) })
      })
      .catch((error: unknown) =>
        setState({ phase: "edit", loadError: agentUnavailable(error) ? "unsupported" : "failed" }),
      )
  }
  onMount(load)

  const saveFailure = (error: unknown) => {
    if (agentUnavailable(error)) return language.t("orchestra.agents.error.unsupported")
    if (errorStatus(error) === 409) return language.t("orchestra.agents.error.conflict")
    const kind = errorKind(error)
    if (kind === "agent_file_case") return language.t("orchestra.agents.error.case")
    if (kind === "agent_file_outside") return language.t("orchestra.agents.error.outside")
    if (kind === "agent_file_unparseable")
      return language.t("orchestra.agents.error.invalid", { path: relative(state.file?.path ?? "") })
    if (kind === "agent_file_protected") return language.t("orchestra.agents.maestroLocked")
    return language.t("orchestra.agents.error.save")
  }
  const notice = () => {
    if (state.loadError === "unsupported") return language.t("orchestra.agents.error.unsupported")
    if (state.loadError === "failed") return language.t("orchestra.agents.error.load")
    if (state.file?.invalid) return language.t("orchestra.agents.error.invalid", { path: relative(state.file.path) })
    return state.error
  }
  const submit = () => {
    if (state.saving || readOnly() || state.phase !== "edit") return
    const problem = draftError(draft, props.agents.map(agentKey), false)
    if (problem) return setState("error", language.t(`orchestra.agents.error.${problem}`))
    setState({ saving: true, error: "", saved: false })
    props
      .save(agentFileTarget(draft, props.agent), agentFileInput(draft, state.file, props.agent))
      .then(() => {
        setState({ saving: false, saved: true })
        load()
      })
      .catch((error: unknown) => setState({ saving: false, error: saveFailure(error) }))
  }
  const remove = () => {
    if (state.saving || maestro) return
    // The roster refresh after the write can rewrite this agent in place, so what restoring needs is read first.
    const removed = { id: agentKey(props.agent), name: props.agent.name }
    setState({ saving: true, error: "" })
    props
      .save(agentFileTarget(draft, props.agent), removeInput(state.file))
      .then(() => props.onRemoved(removed))
      .catch((error: unknown) => setState({ saving: false, error: saveFailure(error) }))
  }
  const discard = () => {
    setDraft(JSON.parse(state.baseline))
    setState("error", "")
  }

  const permissionRows = () => [
    ...PERMISSION_TOOLS.map((tool) => ({ tool, label: language.t(`orchestra.agents.tool.${tool}`) })),
    ...props.mcpServers.map((server) => ({
      tool: mcpPermission(server),
      label: language.t("orchestra.agents.tool.mcp", { server }),
    })),
  ]
  const inheritLabel = (tool: string) => {
    const action = inheritedAction(props.agent.permission, tool, state.file?.permission?.[tool])
    if (!action) return language.t("orchestra.agents.choice.inherit")
    return language.t("orchestra.agents.choice.inheritValue", { action })
  }
  const upload = (file: File | undefined) => {
    if (!file) return
    avatarFromFile(file).then((avatar) => {
      if (!avatar) return setState("error", language.t("orchestra.agents.avatar.error"))
      setState("error", "")
      setDraft("avatar", avatar)
    })
  }
  const knownModel = () => props.models.flatMap((group) => group.models).find((model) => model.value === draft.model)
  const modelsReady = () => !props.modelsStatus || props.modelsStatus === "success"
  const modelIssue = () =>
    modelsReady() && draft.model && (knownModel()?.unavailable ?? (!knownModel() ? "unavailable" : undefined))
  const customized = () => state.file?.system !== undefined && draft.system !== ""
  const words = () => draft.system.trim().split(/\s+/).filter(Boolean).length
  const steps = () =>
    props.agent.steps === undefined
      ? language.t("orchestra.agents.stepsUnlimited")
      : props.agent.steps === 1
        ? language.t("orchestra.agents.stepsOne")
        : language.t("orchestra.agents.stepsCount", { count: props.agent.steps })
  const date = (at: string | null) => {
    if (!at) return
    const value = new Date(at)
    return Number.isNaN(value.getTime())
      ? undefined
      : value.toLocaleDateString(language.intl(), { dateStyle: "medium" })
  }
  const select = (tab: Tab, focus = false) => {
    setState("tab", tab)
    if (focus) document.getElementById(`agent-tab-${tab}`)?.focus()
  }

  return (
    <div class="agent-screen">
      <button type="button" class="mx-link agent-back" onClick={props.onBack}>
        <svg class="agents-ic" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3 5 8l5 5" />
        </svg>
        {language.t("orchestra.agents.back")}
      </button>
      <header class="agent-hero">
        <AgentPortrait agent={props.agent} avatar={draft.avatar || undefined} class="agent-hero-avatar" working={props.working} />
        <div class="agent-hero-text">
          <h1 id="agents-title">
            <bdi>{props.agent.name}</bdi>
          </h1>
          <p class="agent-hero-desc">{props.agent.description ?? language.t("orchestra.agents.noDescription")}</p>
          <div class="mx-meta">
            <Show when={props.status}>
              {(status) => (
                <span class={status().ok ? "mx-badge good" : "mx-badge bad"} title={status().title}>
                  {status().modelIssue
                    ? language.t("orchestra.agents.modelIssue")
                    : language.t(status().ok ? "orchestra.agents.available" : "orchestra.agents.providerMissing")}
                </span>
              )}
            </Show>
            <span class="mx-badge">
              {language.t(
                props.agent.mode === "subagent" ? "orchestra.agents.kind.subagent" : "orchestra.agents.kind.primary",
              )}
            </span>
            <span
              class="mx-badge"
              title={props.agent.model ? `${props.agent.model.providerID}/${props.agent.model.modelID}` : undefined}
            >
              <bdi>{props.modelName ?? props.agent.model?.modelID ?? language.t("orchestra.agents.defaultModel")}</bdi>
            </span>
            <span class="mx-badge">{steps()}</span>
          </div>
        </div>
        <Show when={maestro}>
          <button
            type="button"
            class="mx-btn"
            disabled={props.opening || props.chatReady === false}
            onClick={props.onChat}
          >
            {language.t("orchestra.agents.openChat")}
          </button>
        </Show>
      </header>

      <div
        class="agent-tabs"
        role="tablist"
        aria-label={language.t("orchestra.agents.sections")}
        onKeyDown={(event) => {
          const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0
          if (!step) return
          event.preventDefault()
          select(TABS[(TABS.indexOf(state.tab) + step + TABS.length) % TABS.length], true)
        }}
      >
        <For each={TABS}>
          {(tab) => (
            <button
              type="button"
              role="tab"
              id={`agent-tab-${tab}`}
              aria-selected={state.tab === tab}
              aria-controls="agent-panel"
              tabIndex={state.tab === tab ? 0 : -1}
              onClick={() => select(tab)}
            >
              {language.t(`orchestra.agents.tab.${tab}`)}
              <Show when={count(tab) !== undefined}>
                <span class="agent-tab-count">{count(tab)}</span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <p class="mx-error" role="alert" hidden={!notice()}>
        {notice()}
      </p>
      <Show when={state.loadError === "failed"}>
        <p>
          <button type="button" class="mx-btn" onClick={load}>
            {language.t("orchestra.agents.retry")}
          </button>
        </p>
      </Show>

      <form
        id="agent-panel"
        class="agent-panel"
        role="tabpanel"
        aria-labelledby={`agent-tab-${state.tab}`}
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Show
          when={state.phase !== "loading"}
          fallback={<p class="mx-note">{language.t("orchestra.agents.loadingFile")}</p>}
        >
          <fieldset class="agents-fieldset" disabled={readOnly() || state.saving}>
            <Switch>
              <Match when={state.tab === "overview"}>
                <section class="agent-group">
                  <label class="mx-field">
                    <span>{language.t("orchestra.agents.field.description")}</span>
                    <textarea
                      name="description"
                      required
                      rows={2}
                      value={draft.description}
                      dir="auto"
                      onInput={(event) => setDraft("description", event.currentTarget.value)}
                    />
                  </label>
                  <div class="mx-fields agent-fields-3">
                    <label class="mx-field">
                      <span id="agents-field-mode">{language.t("orchestra.agents.mode")}</span>
                      <select
                        name="mode"
                        aria-labelledby="agents-field-mode"
                        disabled={maestro}
                        aria-describedby={maestro ? "agents-maestro-note" : undefined}
                        onChange={(event) => setDraft("mode", AGENT_MODES[event.currentTarget.selectedIndex])}
                      >
                        <For each={AGENT_MODES}>
                          {(mode) => (
                            <option value={mode} selected={draft.mode === mode}>
                              {language.t(`orchestra.agents.mode.${mode}`)}
                            </option>
                          )}
                        </For>
                      </select>
                    </label>
                    <label class="mx-field">
                      <span id="agents-field-model">{language.t("orchestra.agents.model")}</span>
                      <select
                        name="model"
                        aria-labelledby="agents-field-model"
                        aria-describedby={modelIssue() ? "agents-model-issue" : undefined}
                        onChange={(event) => setDraft("model", event.currentTarget.value)}
                      >
                        <option value="" selected={draft.model === ""}>
                          {language.t("orchestra.agents.choice.inherit")}
                        </option>
                        <Show when={draft.model && !knownModel()}>
                          <option value={draft.model} selected disabled>
                            {modelsReady()
                              ? language.t("orchestra.agents.model.unavailable", { model: draft.model })
                              : draft.model}
                          </option>
                        </Show>
                        <For each={props.models}>
                          {(group) => (
                            <optgroup label={group.name}>
                              <For each={group.models}>
                                {(model) => (
                                  <option
                                    value={model.value}
                                    selected={draft.model === model.value}
                                    disabled={!modelsReady() || !!model.unavailable}
                                  >
                                    {model.unavailable
                                      ? language.t(`orchestra.agents.model.${model.unavailable}`, {
                                          model: model.label,
                                        })
                                      : model.label}
                                  </option>
                                )}
                              </For>
                            </optgroup>
                          )}
                        </For>
                      </select>
                    </label>
                    <label class="mx-field">
                      <span>{language.t("orchestra.agents.steps")}</span>
                      <input
                        name="steps"
                        type="number"
                        min="1"
                        placeholder={language.t("orchestra.agents.field.stepsPlaceholder")}
                        value={draft.steps}
                        onInput={(event) => setDraft("steps", event.currentTarget.value)}
                      />
                    </label>
                  </div>
                  <Show when={maestro}>
                    <p id="agents-maestro-note" class="mx-note">
                      {language.t("orchestra.agents.maestroLocked")}
                    </p>
                  </Show>
                  <Show when={!modelsReady() || props.models.every((group) => group.models.length === 0)}>
                    <p class="mx-note" role={props.modelsStatus === "error" ? "alert" : "status"}>
                      {language.t(
                        props.modelsStatus === "pending"
                          ? "orchestra.agents.models.loading"
                          : props.modelsStatus === "error"
                            ? "orchestra.agents.models.error"
                            : "orchestra.agents.models.empty",
                      )}{" "}
                      <Show when={props.modelsStatus === "error" && props.onRetryModels}>
                        <button type="button" class="mx-link" onClick={() => props.onRetryModels?.()}>
                          {language.t("orchestra.agents.retry")}
                        </button>
                      </Show>
                    </p>
                  </Show>
                  <Show when={modelIssue()}>
                    {(issue) => (
                      <p id="agents-model-issue" class="mx-note" role="status">
                        {language.t(`orchestra.agents.model.${issue()}`, { model: draft.model })}
                      </p>
                    )}
                  </Show>
                </section>
                <section class="agent-group" aria-labelledby="agent-avatar-title">
                  <div class="agent-group-head">
                    <h2 id="agent-avatar-title" class="mx-section">
                      {language.t("orchestra.agents.field.avatar")}
                    </h2>
                    <div class="agent-group-actions">
                      <label class="mx-btn agents-avatar-upload">
                        {language.t("orchestra.agents.avatar.upload")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => {
                            upload(event.currentTarget.files?.[0])
                            event.currentTarget.value = ""
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        class="mx-btn"
                        disabled={draft.avatar === ""}
                        onClick={() => setDraft("avatar", "")}
                      >
                        {language.t("orchestra.agents.avatar.none")}
                      </button>
                    </div>
                  </div>
                  <div
                    class="agents-avatars"
                    role="radiogroup"
                    aria-label={language.t("orchestra.agents.avatar.library")}
                  >
                    <For each={AVATAR_LIBRARY}>
                      {(item, index) => (
                        <label class="agents-avatar-pick">
                          <input
                            type="radio"
                            name="avatar"
                            value={item.value}
                            checked={draft.avatar === item.value}
                            onChange={() => setDraft("avatar", item.value)}
                          />
                          <img
                            src={item.url}
                            alt={language.t("orchestra.agents.avatar.option", { index: index() + 1 })}
                            loading="lazy"
                          />
                        </label>
                      )}
                    </For>
                  </div>
                </section>
                <Show when={!maestro && !readOnly()}>
                  <section class="agent-group agent-danger" aria-labelledby="agent-remove-title">
                    <div class="agent-group-head">
                      <div>
                        <h2 id="agent-remove-title" class="mx-section">
                          {language.t("orchestra.agents.remove")}
                        </h2>
                        <p class="mx-note">
                          {state.phase === "confirm"
                            ? language.t("orchestra.agents.removeNote", {
                                name: props.agent.name,
                                path: relative(state.file?.path ?? ""),
                              })
                            : language.t("orchestra.agents.removeDetail")}
                        </p>
                      </div>
                      <div class="agent-group-actions">
                        <Show
                          when={state.phase === "confirm"}
                          fallback={
                            <button
                              type="button"
                              class="mx-btn"
                              onClick={() => setState({ phase: "confirm", error: "" })}
                            >
                              {language.t("orchestra.agents.remove")}
                            </button>
                          }
                        >
                          <button type="button" class="mx-btn" onClick={() => setState("phase", "edit")}>
                            {language.t("orchestra.agents.cancel")}
                          </button>
                          <button type="button" class="mx-btn agent-remove" onClick={remove}>
                            {language.t("orchestra.agents.removeConfirm", { name: props.agent.name })}
                          </button>
                        </Show>
                      </div>
                    </div>
                  </section>
                </Show>
              </Match>

              <Match when={state.tab === "prompt"}>
                <section class="agent-group">
                  <div class="agent-group-head">
                    <div>
                      <h2 class="mx-section" id="agent-prompt-title">
                        {language.t("orchestra.agents.field.system")}
                      </h2>
                      <p class="mx-note">{language.t("orchestra.agents.promptNote")}</p>
                    </div>
                    <span class="mx-badge">
                      {language.t(customized() ? "orchestra.agents.prompt.custom" : "orchestra.agents.prompt.builtin")}
                    </span>
                  </div>
                  <textarea
                    name="system"
                    class="agent-prompt"
                    aria-labelledby="agent-prompt-title"
                    dir="auto"
                    spellcheck={false}
                    placeholder={language.t("orchestra.agents.prompt.placeholder")}
                    value={draft.system}
                    onInput={(event) => setDraft("system", event.currentTarget.value)}
                  />
                  <div class="agent-prompt-foot">
                    <span class="mx-note">
                      {language.t("orchestra.agents.prompt.size", {
                        words: words().toLocaleString(language.intl()),
                        chars: draft.system.length.toLocaleString(language.intl()),
                      })}
                    </span>
                    <Show when={state.file?.system !== undefined}>
                      <button
                        type="button"
                        class="mx-btn"
                        disabled={draft.system === ""}
                        onClick={() => setDraft("system", "")}
                      >
                        {language.t("orchestra.agents.prompt.reset")}
                      </button>
                    </Show>
                  </div>
                  <Show when={state.file?.system !== undefined && draft.system === ""}>
                    <p class="mx-note" role="status">
                      {language.t("orchestra.agents.prompt.resetNote")}
                    </p>
                  </Show>
                </section>
              </Match>

              <Match when={state.tab === "tools"}>
                <section class="agent-group">
                  <div>
                    <h2 class="mx-section">{language.t("orchestra.agents.tools.title")}</h2>
                    <p class="mx-note">{language.t("orchestra.agents.tools.note")}</p>
                  </div>
                  <Switch>
                    <Match when={props.detail}>
                      {(detail) => (
                        <Show
                          when={detail().tools.length}
                          fallback={<p class="mx-empty">{language.t("orchestra.agents.tools.empty")}</p>}
                        >
                          <ul class="agent-list">
                            <For each={detail().tools}>
                              {(tool) => (
                                <li>
                                  <code>{tool.name}</code>
                                  <span title={tool.description}>{tool.description.split("\n")[0]}</span>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      )}
                    </Match>
                    <Match when={props.detailFailed}>
                      <p class="mx-empty">{language.t("orchestra.agents.detail.error")}</p>
                    </Match>
                    <Match when={true}>
                      <p class="mx-note">{language.t("orchestra.agents.detail.loading")}</p>
                    </Match>
                  </Switch>
                </section>
                <section class="agent-group">
                  <h2 class="mx-section">{language.t("orchestra.agents.toolPermissions")}</h2>
                  <p class="mx-note">{language.t("orchestra.agents.toolPermissionsNote")}</p>
                  <div class="mx-table">
                    <For each={permissionRows()}>
                      {(row) => (
                        <div class="mx-row">
                          <div class="mx-grow">
                            <strong id={`agents-tool-${row.tool}`}>
                              <bdi>{row.label}</bdi>
                            </strong>
                          </div>
                          <select
                            name={`perm-${row.tool}`}
                            class="mx-search"
                            aria-labelledby={`agents-tool-${row.tool}`}
                            onChange={(event) =>
                              setDraft("permission", row.tool, event.currentTarget.value as PermissionChoice)
                            }
                          >
                            <option value="inherit" selected={draft.permission[row.tool] === "inherit"}>
                              {inheritLabel(row.tool)}
                            </option>
                            <Show when={typeof state.file?.permission?.[row.tool] === "object"}>
                              <option value="custom" selected={draft.permission[row.tool] === "custom"}>
                                {language.t("orchestra.agents.choice.custom")}
                              </option>
                            </Show>
                            <For each={["allow", "ask", "deny"] as const}>
                              {(action) => (
                                <option value={action} selected={draft.permission[row.tool] === action}>
                                  {language.t(`orchestra.agents.action.${action}`)}
                                </option>
                              )}
                            </For>
                          </select>
                        </div>
                      )}
                    </For>
                  </div>
                </section>
              </Match>

              <Match when={state.tab === "toolkit"}>
                <section class="agent-group">
                  <div>
                    <h2 class="mx-section">{language.t("orchestra.agents.toolkit.engines")}</h2>
                    <p class="mx-note">{language.t("orchestra.agents.toolkit.enginesNote")}</p>
                  </div>
                  <Switch>
                    <Match when={props.detail}>
                      {(detail) => (
                        <Show
                          when={detail().engines.length}
                          fallback={<p class="mx-empty">{language.t("orchestra.agents.toolkit.noEngines")}</p>}
                        >
                          <ul class="agent-list agent-engines">
                            <For each={detail().engines}>
                              {(engine) => (
                                <li>
                                  <code title={engine.upstream}>{engine.id}</code>
                                  <span>{engine.input}</span>
                                  <span class="agent-list-tag">
                                    {language.t(`orchestra.agents.toolkit.role.${engine.role}`)}
                                  </span>
                                  <span class="agent-engine-state" data-status={engine.status}>
                                    <code>{engine.version}</code>
                                    {language.t(`orchestra.agents.toolkit.status.${engine.status}`)}
                                  </span>
                                </li>
                              )}
                            </For>
                          </ul>
                        </Show>
                      )}
                    </Match>
                    <Match when={props.detailFailed}>
                      <p class="mx-empty">{language.t("orchestra.agents.detail.error")}</p>
                    </Match>
                    <Match when={true}>
                      <p class="mx-note">{language.t("orchestra.agents.detail.loading")}</p>
                    </Match>
                  </Switch>
                </section>
              </Match>

              <Match when={state.tab === "skills"}>
                <section class="agent-group">
                  <div>
                    <h2 class="mx-section">{language.t("orchestra.agents.skills.title")}</h2>
                    <p class="mx-note">{language.t("orchestra.agents.skills.note")}</p>
                  </div>
                  <Show
                    when={skills().length}
                    fallback={
                      <p class={props.detail || props.detailFailed ? "mx-empty" : "mx-note"}>
                        {language.t(
                          props.detail
                            ? "orchestra.agents.skills.empty"
                            : props.detailFailed
                              ? "orchestra.agents.detail.error"
                              : "orchestra.agents.detail.loading",
                        )}
                      </p>
                    }
                  >
                    <ul class="agent-list agent-tree">
                      <For each={skills()}>{(skill) => <SkillNode skill={skill} root />}</For>
                    </ul>
                  </Show>
                </section>
              </Match>

              <Match when={state.tab === "memory"}>
                <section class="agent-group">
                  <div class="agent-group-head">
                    <div>
                      <h2 class="mx-section">{language.t("orchestra.agents.memory.title")}</h2>
                      <p class="mx-note">{language.t("orchestra.agents.memory.note")}</p>
                    </div>
                    <a
                      class="mx-btn"
                      href={props.memoryHref}
                      onClick={(event) => {
                        event.preventDefault()
                        props.onOpenAtlas()
                      }}
                    >
                      {language.t("orchestra.agents.memory.open")}
                    </a>
                  </div>
                  <Switch>
                    <Match when={memory()}>
                      {(records) => (
                        <>
                          <dl class="agent-stats agent-stats-wide">
                            <For
                              each={
                                [
                                  ["project", "rules"],
                                  ["task", "tasks"],
                                  ["pr", "prs"],
                                ] as const
                              }
                            >
                              {([kind, label]) => (
                                <div>
                                  <dt>{language.t(`orchestra.agents.memory.${label}`)}</dt>
                                  <dd>{memoryCount(kind)}</dd>
                                </div>
                              )}
                            </For>
                          </dl>
                          <Show
                            when={records().length}
                            fallback={<p class="mx-empty">{language.t("orchestra.agents.memory.none")}</p>}
                          >
                            <ul class="agent-list agent-memory">
                              <For each={records()}>
                                {(record) => (
                                  <li>
                                    <span class="agent-list-tag">
                                      {language.t(
                                        record.kind === "project"
                                          ? "orchestra.agents.memory.kind.rule"
                                          : record.kind === "task"
                                            ? "orchestra.agents.memory.kind.task"
                                            : record.kind === "pr"
                                              ? "orchestra.agents.memory.kind.pr"
                                              : "orchestra.agents.memory.kind.other",
                                      )}
                                    </span>
                                    <span dir="auto">{record.text}</span>
                                    <span class="agent-memory-meta">
                                      <Show when={record.scope}>{(scope) => <code>{scope()}</code>}</Show>
                                      <Show when={date(record.at)}>
                                        {(value) => <time datetime={record.at ?? undefined}>{value()}</time>}
                                      </Show>
                                    </span>
                                  </li>
                                )}
                              </For>
                            </ul>
                          </Show>
                        </>
                      )}
                    </Match>
                    <Match when={props.memory && "missing" in props.memory ? props.memory.missing : undefined}>
                      {(missing) => (
                        <p class="mx-empty">{language.t(`orchestra.agents.memory.missing.${missing()}`)}</p>
                      )}
                    </Match>
                    <Match when={true}>
                      <p class="mx-note">{language.t("orchestra.agents.memory.loading")}</p>
                    </Match>
                  </Switch>
                </section>
              </Match>
            </Switch>
          </fieldset>
        </Show>
        <Show when={dirty() || state.saving}>
          <div class="agent-savebar" role="region" aria-label={language.t("orchestra.agents.unsaved")}>
            <span>{language.t("orchestra.agents.unsaved")}</span>
            <button type="button" class="mx-btn" disabled={state.saving} onClick={discard}>
              {language.t("orchestra.agents.discard")}
            </button>
            <button type="submit" class="mx-btn primary" disabled={state.saving}>
              {language.t("orchestra.agents.save")}
            </button>
          </div>
        </Show>
        <Show when={state.saved && !dirty()}>
          <p class="mx-note agent-saved" role="status">
            {language.t("orchestra.agents.savedNote")}
          </p>
        </Show>
      </form>
    </div>
  )
}

// A root or branch opens to the nodes below it, as the agent opens them one level at a time; a leaf says when it is opened.
function SkillNode(props: { skill: AgentSkill; root?: boolean }) {
  const language = useLanguage()
  const row = () => (
    <>
      <code>{props.skill.name}</code>
      <span>
        {props.skill.description ?? ""}
        <Show when={props.skill.when}>
          {(when) => <small>{language.t("orchestra.agents.skills.when", { when: when() })}</small>}
        </Show>
      </span>
      <span class={props.root ? "agent-list-tag" : "agent-tab-count"}>
        {props.root
          ? language.t(props.skill.location ? "orchestra.agents.skills.catalog" : "orchestra.agents.skills.seat")
          : props.skill.children.length || ""}
      </span>
    </>
  )
  return (
    <li>
      <Show when={props.skill.children.length} fallback={row()}>
        <details>
          <summary>{row()}</summary>
          <ul class="agent-list">
            <For each={props.skill.children}>{(child) => <SkillNode skill={child} />}</For>
          </ul>
        </details>
      </Show>
    </li>
  )
}
