import { For, onCleanup, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Agent, AgentFileInfo, AgentFileInput } from "@orchestra/sdk/v2/client"
import { useLanguage } from "@/context/language"
import { agentKey } from "@/context/agent-identity"
import {
  AGENT_MODES,
  agentDraft,
  agentFileInput,
  agentUnavailable,
  draftError,
  errorKind,
  errorStatus,
  inheritedAction,
  isMaestro,
  PERMISSION_TOOLS,
  removeInput,
  type PermissionChoice,
} from "./agents-roster"

export type ModelGroup = { id: string; name: string; models: { value: string; label: string }[] }

// Mock `editAgent` dialog: a native modal dialog, like the approved preview, so focus and Escape behave the same.
export function AgentDialog(props: {
  agent?: Agent
  agents: readonly Agent[]
  directory: string
  models: readonly ModelGroup[]
  load: (name: string) => Promise<AgentFileInfo>
  save: (name: string, input: AgentFileInput) => Promise<void>
  onClose: () => void
}) {
  const language = useLanguage()
  const [state, setState] = createStore({
    phase: (props.agent ? "loading" : "edit") as "loading" | "edit" | "confirm",
    file: undefined as AgentFileInfo | undefined,
    loadError: "" as "" | "unsupported" | "failed",
    saving: false,
    error: "",
  })
  const [draft, setDraft] = createStore(agentDraft(props.agent, undefined))
  const maestro = isMaestro(props.agent)
  // Focus goes back to the button that opened the dialog; the roster stays mounted underneath.
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const life = { open: true, element: undefined as HTMLDialogElement | undefined }
  onCleanup(() => {
    life.open = false
  })
  const finish = () => {
    if (!life.open) return
    life.open = false
    life.element?.close()
    props.onClose()
    if (opener?.isConnected) opener.focus()
  }
  const readOnly = () => state.loadError !== "" || state.file?.invalid === true
  const relative = (filepath: string) =>
    filepath.startsWith(`${props.directory}/`) ? filepath.slice(props.directory.length + 1) : filepath
  const saveFailure = (error: unknown) => {
    if (agentUnavailable(error)) return language.t("orchestra.agents.error.unsupported")
    if (errorStatus(error) === 409) return language.t("orchestra.agents.error.conflict")
    const kind = errorKind(error)
    if (kind === "agent_file_case") return language.t("orchestra.agents.error.case")
    if (kind === "agent_file_outside") return language.t("orchestra.agents.error.outside")
    if (kind === "agent_file_unparseable")
      return language.t("orchestra.agents.error.invalid", { path: relative(state.file?.path ?? "") })
    // A fallback: configuration cannot hide Maestro, so the editor never sends a disabled or demoted Maestro file.
    if (kind === "agent_file_protected") return language.t("orchestra.agents.maestroLocked")
    return language.t("orchestra.agents.error.save")
  }
  const notice = () => {
    if (state.loadError === "unsupported") return language.t("orchestra.agents.error.unsupported")
    if (state.loadError === "failed") return language.t("orchestra.agents.error.load")
    if (state.file?.invalid) return language.t("orchestra.agents.error.invalid", { path: relative(state.file.path) })
    return state.error
  }
  const commit = (name: string, input: AgentFileInput) => {
    setState({ saving: true, error: "" })
    props
      .save(name, input)
      .then(finish)
      .catch((error: unknown) => setState({ saving: false, error: saveFailure(error) }))
  }
  const load = () => {
    const agent = props.agent
    if (!agent) return
    setState({ phase: "loading", loadError: "" })
    props
      // Agent files are keyed by the stable id; the display name is configurable.
      .load(agentKey(agent))
      .then((file) => {
        setDraft(agentDraft(agent, file))
        setState({ phase: "edit", file })
      })
      .catch((error: unknown) =>
        setState({ phase: "edit", loadError: agentUnavailable(error) ? "unsupported" : "failed" }),
      )
  }

  onMount(() => {
    life.element?.showModal()
    load()
  })

  const title = () => {
    if (state.phase === "confirm") return language.t("orchestra.agents.removeTitle", { name: draft.name })
    if (!props.agent) return language.t("orchestra.agents.dialog.create")
    return language.t("orchestra.agents.dialog.configure", { name: props.agent.name })
  }
  // A new agent inherits only profile rules this page cannot see, so it names no value.
  const inheritLabel = (tool: (typeof PERMISSION_TOOLS)[number]) => {
    const action = props.agent && inheritedAction(props.agent.permission, tool, state.file?.permission?.[tool])
    if (!action) return language.t("orchestra.agents.choice.inherit")
    return language.t("orchestra.agents.choice.inheritValue", { action })
  }
  const knownModel = () => props.models.some((group) => group.models.some((model) => model.value === draft.model))

  return (
    <dialog
      ref={(element) => (life.element = element)}
      class="mx-dialog agents-dialog"
      aria-labelledby="agents-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        finish()
      }}
      // A Kobalte layer behind this modal (a navigation tooltip still open or animating out) takes Escape on the
      // document and cancels the native close. The modal is the top layer, so it takes Escape first.
      on:keydown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        finish()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        if (!inside) finish()
      }}
    >
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          if (state.saving || readOnly() || state.phase === "loading") return
          if (state.phase === "confirm") return commit(draft.name, removeInput(state.file))
          const problem = draftError(
            draft,
            props.agents.map((agent) => agent.name),
            !props.agent,
          )
          if (problem) return setState("error", language.t(`orchestra.agents.error.${problem}`))
          commit(draft.name.trim(), agentFileInput(draft, state.file, props.agent))
        }}
      >
        <header class="mx-dialog-head">
          <div>
            <h2 id="agents-dialog-title">{title()}</h2>
            <p>
              {state.phase === "confirm"
                ? language.t("orchestra.agents.removeDetail")
                : language.t("orchestra.agents.dialog.subtitle")}
            </p>
          </div>
          <button
            type="button"
            class="mx-link agents-close"
            aria-label={language.t("orchestra.agents.dialog.close")}
            onClick={finish}
          >
            <svg class="agents-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </header>
        <div class="mx-dialog-body">
          <p class="mx-error" role="alert" hidden={!notice()}>
            {notice()}
          </p>
          <Show when={state.loadError === "failed"}>
            <p class="agents-retry">
              <button type="button" class="mx-btn" onClick={load}>
                {language.t("orchestra.agents.retry")}
              </button>
            </p>
          </Show>
          <Show
            when={state.phase !== "loading"}
            fallback={<p class="mx-note">{language.t("orchestra.agents.loadingFile")}</p>}
          >
            <Show
              when={state.phase === "edit"}
              fallback={
                <p class="mx-note">
                  {language.t("orchestra.agents.removeNote", {
                    name: draft.name,
                    path: relative(state.file?.path ?? ""),
                  })}
                </p>
              }
            >
              <fieldset class="agents-fieldset" disabled={readOnly() || state.saving}>
                <div class="mx-fields">
                  <label class="mx-field">
                    <span id="agents-field-name">{language.t("orchestra.agents.field.name")}</span>
                    <input
                      name="name"
                      required
                      aria-labelledby="agents-field-name"
                      readOnly={!!props.agent}
                      value={draft.name}
                      onInput={(event) => setDraft("name", event.currentTarget.value)}
                    />
                  </label>
                  <label class="mx-field">
                    <span id="agents-field-mode">{language.t("orchestra.agents.mode")}</span>
                    <select
                      name="mode"
                      aria-labelledby="agents-field-mode"
                      aria-describedby={maestro ? "agents-maestro-note" : undefined}
                      disabled={maestro}
                      onChange={(event) => setDraft("mode", AGENT_MODES[event.currentTarget.selectedIndex])}
                    >
                      <For each={AGENT_MODES}>
                        {(mode) => (
                          <option value={mode} selected={draft.mode === mode}>
                            {mode}
                          </option>
                        )}
                      </For>
                    </select>
                  </label>
                </div>
                <Show when={maestro}>
                  <p id="agents-maestro-note" class="mx-note">
                    {language.t("orchestra.agents.maestroLocked")}
                  </p>
                </Show>
                <label class="mx-field">
                  <span id="agents-field-description">{language.t("orchestra.agents.field.description")}</span>
                  <input
                    name="description"
                    required
                    aria-labelledby="agents-field-description"
                    value={draft.description}
                    onInput={(event) => setDraft("description", event.currentTarget.value)}
                  />
                </label>
                <div class="mx-fields">
                  <label class="mx-field">
                    <span id="agents-field-model">{language.t("orchestra.agents.model")}</span>
                    <select
                      name="model"
                      aria-labelledby="agents-field-model"
                      onChange={(event) => setDraft("model", event.currentTarget.value)}
                    >
                      <option value="" selected={draft.model === ""}>
                        {language.t("orchestra.agents.defaultModel")}
                      </option>
                      <Show when={draft.model && !knownModel()}>
                        <option value={draft.model} selected>
                          {draft.model}
                        </option>
                      </Show>
                      <For each={props.models}>
                        {(group) => (
                          <optgroup label={group.name}>
                            <For each={group.models}>
                              {(model) => (
                                <option value={model.value} selected={draft.model === model.value}>
                                  {model.label}
                                </option>
                              )}
                            </For>
                          </optgroup>
                        )}
                      </For>
                    </select>
                  </label>
                  <label class="mx-field">
                    <span id="agents-field-steps">{language.t("orchestra.agents.steps")}</span>
                    <input
                      name="steps"
                      type="number"
                      aria-labelledby="agents-field-steps"
                      placeholder={language.t("orchestra.agents.field.stepsPlaceholder")}
                      value={draft.steps}
                      onInput={(event) => setDraft("steps", event.currentTarget.value)}
                    />
                  </label>
                </div>
                <label class="mx-field">
                  <span id="agents-field-system">{language.t("orchestra.agents.field.system")}</span>
                  <textarea
                    name="system"
                    aria-labelledby="agents-field-system"
                    value={draft.system}
                    onInput={(event) => setDraft("system", event.currentTarget.value)}
                  />
                </label>
                <h3 class="mx-section">{language.t("orchestra.agents.toolPermissions")}</h3>
                <p class="mx-note">{language.t("orchestra.agents.toolPermissionsNote")}</p>
                <div class="mx-table">
                  <For each={PERMISSION_TOOLS}>
                    {(tool) => (
                      <div class="mx-row">
                        <div class="mx-grow">
                          <strong id={`agents-tool-${tool}`}>{language.t(`orchestra.agents.tool.${tool}`)}</strong>
                        </div>
                        <select
                          name={`perm-${tool}`}
                          class="mx-search"
                          aria-labelledby={`agents-tool-${tool}`}
                          onChange={(event) =>
                            setDraft("permission", tool, event.currentTarget.value as PermissionChoice)
                          }
                        >
                          <option value="inherit" selected={draft.permission[tool] === "inherit"}>
                            {inheritLabel(tool)}
                          </option>
                          <Show when={typeof state.file?.permission?.[tool] === "object"}>
                            <option value="custom" selected={draft.permission[tool] === "custom"}>
                              {language.t("orchestra.agents.choice.custom")}
                            </option>
                          </Show>
                          <For each={["allow", "ask", "deny"] as const}>
                            {(action) => (
                              <option value={action} selected={draft.permission[tool] === action}>
                                {language.t(`orchestra.agents.action.${action}`)}
                              </option>
                            )}
                          </For>
                        </select>
                      </div>
                    )}
                  </For>
                </div>
              </fieldset>
              <Show when={props.agent && !readOnly() && !maestro}>
                <p class="mx-note">
                  <button
                    type="button"
                    class="mx-btn"
                    disabled={state.saving}
                    onClick={() => setState({ phase: "confirm", error: "" })}
                  >
                    {language.t("orchestra.agents.remove")}
                  </button>
                </p>
              </Show>
            </Show>
          </Show>
        </div>
        <footer class="mx-dialog-foot">
          <button type="button" class="mx-btn" onClick={finish}>
            {language.t("orchestra.agents.cancel")}
          </button>
          <button
            class="mx-btn primary"
            type="submit"
            disabled={state.saving || readOnly() || state.phase === "loading"}
          >
            {language.t(state.phase === "confirm" ? "orchestra.agents.confirm" : "orchestra.agents.save")}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
