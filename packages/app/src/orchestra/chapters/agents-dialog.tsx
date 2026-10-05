import { For, onMount, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { Agent, AgentFileInfo, AgentFileInput } from "@opencode-ai/sdk/v2/client"
import { useLanguage } from "@/context/language"
import {
  AGENT_MODES,
  agentDraft,
  agentFileInput,
  agentUnavailable,
  draftError,
  inheritedAction,
  PERMISSION_TOOLS,
  type PermissionChoice,
} from "./agents-roster"

export type ModelGroup = { id: string; name: string; models: { value: string; label: string }[] }

// Mock `editAgent` dialog: a native modal dialog, like the approved preview, so focus and Escape behave the same.
export function AgentDialog(props: {
  agent?: Agent
  agents: readonly Agent[]
  models: readonly ModelGroup[]
  load: (name: string) => Promise<AgentFileInfo>
  save: (name: string, input: AgentFileInput) => Promise<void>
  onClose: () => void
}) {
  const language = useLanguage()
  const [state, setState] = createStore({
    phase: (props.agent ? "loading" : "edit") as "loading" | "edit" | "confirm",
    file: undefined as AgentFileInfo | undefined,
    readOnly: false,
    saving: false,
    error: "",
  })
  const [draft, setDraft] = createStore(agentDraft(props.agent, undefined))
  // A new agent starts from the same profile rules as the default agent.
  const rules = () => props.agent?.permission ?? props.agents.find((agent) => agent.name === "build")?.permission ?? []
  const failure = (error: unknown) =>
    language.t(agentUnavailable(error) ? "orchestra.agents.error.unsupported" : "orchestra.agents.error.save")
  const commit = (name: string, input: AgentFileInput) => {
    setState({ saving: true, error: "" })
    props
      .save(name, input)
      .then(() => props.onClose())
      .catch((error: unknown) => setState({ saving: false, error: failure(error) }))
  }
  const dialog = { element: undefined as HTMLDialogElement | undefined }

  onMount(() => {
    dialog.element?.showModal()
    const agent = props.agent
    if (!agent) return
    props
      .load(agent.name)
      .then((file) => {
        setDraft(agentDraft(agent, file))
        setState({ phase: "edit", file })
      })
      .catch((error: unknown) => setState({ phase: "edit", readOnly: true, error: failure(error) }))
  })

  const title = () => {
    if (state.phase === "confirm") return language.t("orchestra.agents.removeTitle", { name: draft.name })
    if (!props.agent) return language.t("orchestra.agents.dialog.create")
    return language.t("orchestra.agents.dialog.configure", { name: props.agent.name })
  }
  const inheritLabel = (tool: (typeof PERMISSION_TOOLS)[number]) => {
    const action = inheritedAction(rules(), tool, state.file?.permission?.[tool])
    if (!action) return language.t("orchestra.agents.choice.inherit")
    return language.t("orchestra.agents.choice.inheritValue", { action })
  }
  const knownModel = () => props.models.some((group) => group.models.some((model) => model.value === draft.model))

  return (
    <dialog
      ref={(element) => (dialog.element = element)}
      class="mx-dialog agents-dialog"
      aria-labelledby="agents-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        props.onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        const inside =
          event.clientX >= rect.left &&
          event.clientX <= rect.right &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom
        if (!inside) props.onClose()
      }}
    >
      <form
        autocomplete="off"
        onSubmit={(event) => {
          event.preventDefault()
          if (state.saving || state.readOnly || state.phase === "loading") return
          if (state.phase === "confirm") return commit(draft.name, { disable: true })
          const problem = draftError(
            draft,
            props.agents.map((agent) => agent.name),
            !props.agent,
          )
          if (problem) return setState("error", language.t(`orchestra.agents.error.${problem}`))
          commit(draft.name.trim(), agentFileInput(draft, state.file))
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
            onClick={() => props.onClose()}
          >
            <svg class="agents-ic" viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
          </button>
        </header>
        <div class="mx-dialog-body">
          <p class="mx-error" role="alert" hidden={!state.error}>
            {state.error}
          </p>
          <Show when={state.phase !== "loading"} fallback={<p class="mx-note">{language.t("orchestra.agents.loadingFile")}</p>}>
            <Show
              when={state.phase === "edit"}
              fallback={<p class="mx-note">{language.t("orchestra.agents.removeNote", { name: draft.name })}</p>}
            >
              <fieldset class="agents-fieldset" disabled={state.readOnly || state.saving}>
                <div class="mx-fields">
                  <label class="mx-field">
                    <span>{language.t("orchestra.agents.field.name")}</span>
                    <input
                      name="name"
                      required
                      readOnly={!!props.agent}
                      value={draft.name}
                      onInput={(event) => setDraft("name", event.currentTarget.value)}
                    />
                  </label>
                  <label class="mx-field">
                    <span>{language.t("orchestra.agents.mode")}</span>
                    <select
                      name="mode"
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
                <label class="mx-field">
                  <span>{language.t("orchestra.agents.field.description")}</span>
                  <input
                    name="description"
                    required
                    value={draft.description}
                    onInput={(event) => setDraft("description", event.currentTarget.value)}
                  />
                </label>
                <div class="mx-fields">
                  <label class="mx-field">
                    <span>{language.t("orchestra.agents.model")}</span>
                    <select name="model" onChange={(event) => setDraft("model", event.currentTarget.value)}>
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
                    <span>{language.t("orchestra.agents.steps")}</span>
                    <input
                      name="steps"
                      type="number"
                      placeholder={language.t("orchestra.agents.field.stepsPlaceholder")}
                      value={draft.steps}
                      onInput={(event) => setDraft("steps", event.currentTarget.value)}
                    />
                  </label>
                </div>
                <label class="mx-field">
                  <span>{language.t("orchestra.agents.field.system")}</span>
                  <textarea name="system" value={draft.system} onInput={(event) => setDraft("system", event.currentTarget.value)} />
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
                          <Show when={draft.permission[tool] === "custom" || typeof state.file?.permission?.[tool] === "object"}>
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
              <Show when={props.agent && !state.readOnly}>
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
          <button type="button" class="mx-btn" onClick={() => props.onClose()}>
            {language.t("orchestra.agents.cancel")}
          </button>
          <button
            class="mx-btn primary"
            type="submit"
            disabled={state.saving || state.readOnly || state.phase === "loading"}
          >
            {language.t(state.phase === "confirm" ? "orchestra.agents.confirm" : "orchestra.agents.save")}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
