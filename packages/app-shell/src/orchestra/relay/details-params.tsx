import { createEffect, createSignal, createUniqueId, For, Index, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { usePlatform } from "@/context/platform"
import { showToast } from "@/utils/toast"
import { CheckList } from "./checks"
import { Empty, NodeNameField, pasteOneLine, Switchable } from "./details"
import type { Props } from "./details-workflow"
import { span } from "./format"
import {
  chain,
  checkID,
  contextOf,
  type Flow,
  type FlowNode,
  type FlowPhase,
  INJECT,
  issueNode,
  issues,
  nodeOf,
  phaseChoices,
  phaseOf,
  readChecklist,
  readTools,
  removeNodes,
  retryBudget,
  setPhase,
  START,
  updateNode,
  updatePhase,
  writeChecklist,
} from "./graph"
import { addNode } from "./insert"
import { issueText } from "./parts"
import { Ic, useRelayCopy } from "./ui"
    </Switchable>
  )
}

export function Params(props: Props) {
  const copy = useRelayCopy()
  const update = (parameters: Record<string, unknown>) =>
    props.onChange(updateNode(props.flow, props.node.id, { parameters: { ...props.node.parameters, ...parameters } }))
  const checklist = () => readChecklist(props.node)
  // Only the phases this step can join without splitting one.
  const choices = () => phaseChoices(props.flow, props.node.id)
  // What is wrong with this step, so the dialog says it too; empty and unreadable checks explain themselves below.
  const problems = () =>
    issues(props.flow).flatMap((issue) =>
      issueNode(issue) === props.node.id && issue.code !== "check-empty" && issue.code !== "checklist-invalid"
        ? [issueText(copy, props.flow, issue)]
        : [],
    )
  const skill = () => String(props.node.parameters.skill ?? "")
  // Only a loaded catalog can say a skill is gone; until then the name is taken at its word.
  const skillGone = () => !!skill() && !!props.skills.names && !props.skills.names.includes(skill())
  const chosen = () => props.skills.choices?.find((item) => item.name === skill())
  // A step may name a skill the picker does not offer (agent-only, or gone); it stays selectable so the value shows.
  const unlisted = () => (skill() && !chosen() ? skill() : undefined)
  const skillGroups = () =>
    (["project", "global", "builtin"] as const).flatMap((source) => {
      const items = (props.skills.choices ?? []).filter((item) => item.source === source)
      return items.length ? [{ source, items }] : []
    })
  const unchecked = () => ["relay.execute", "relay.review"].includes(props.node.type) && !checklist().controls.length
  const tools = () => readTools(props.node)
  // A server the step lists stays shown even when the project no longer configures it, so it can be cleared.
  const serverChoices = () => [...new Set([...(props.servers ?? []), ...(tools().mcp ?? [])])].toSorted()
  const setTools = (next: { mcp?: string[]; bash?: string[] }) =>
    update({ tools: JSON.stringify(Object.fromEntries(Object.entries(next).filter((entry) => entry[1]))) })
  const picker = useProjectFile(() => props.directory)
  const previous = () => {
    const order = chain(props.flow)
    return order[order.findIndex((node) => node.id === props.node.id) - 1]
  }
  // New context goes right before this step, in its phase, the way the run delivers it.
  const attach = (parameters: Record<string, unknown>) => {
    const before = previous()
    if (!before) return
    const added = addNode(
      props.flow,
      {
        key: "inject",
        type: INJECT,
        name: copy.t("orchestra.workflows.newName.inject"),
        anchor: { id: before.id, port: 0 },
      },
      undefined,
    )
    const filled = updateNode(added.flow, added.id, {
      parameters: { ...nodeOf(added.flow, added.id)?.parameters, ...parameters },
    })
    const phase = phaseOf(props.flow, props.node.id)?.id
    props.onChange(phase && phaseOf(filled, added.id)?.id !== phase ? setPhase(filled, added.id, phase) : filled)
    return added.id
  }
  return (
    <>
      <Show when={!props.inline}>
        <div class="wf-col-head">
          <h3>{copy.t("orchestra.workflows.details.params")}</h3>
        </div>
      </Show>
      <Show when={props.node.type !== START} fallback={<StartParams {...props} />}>
        <For each={problems()}>
          {(text) => (
            <div class="wf-alert" role="status">
              <Ic name="warn" />
              <span>{text}</span>
            </div>
          )}
        </For>
        <div class="mx-fields">
          <NodeNameField flow={props.flow} node={props.node} onChange={props.onChange} />
          <label class="mx-field">
            <span>{copy.t("orchestra.workflows.details.phaseField")}</span>
            <select
              value={phaseOf(props.flow, props.node.id)?.id ?? ""}
              onChange={(event) => {
                props.onChange(setPhase(props.flow, props.node.id, event.currentTarget.value))
                // A change that waits for an answer leaves the step in its phase, so the list shows it there.
                event.currentTarget.value = phaseOf(props.flow, props.node.id)?.id ?? ""
              }}
            >
              <Show when={choices().none}>
                <option value="">{copy.t("orchestra.workflows.details.noPhase")}</option>
              </Show>
              <For each={choices().phases}>{(phase) => <option value={phase.id}>{phase.name}</option>}</For>
            </select>
            <Show when={!choices().none && phaseOf(props.flow, props.node.id)}>
              {(phase) => (
                <span class="mx-hint">
                  {copy.t("orchestra.workflows.details.phaseMiddle", { phase: phase().name })}
                </span>
              )}
            </Show>
          </label>
        </div>
        <Show when={props.node.type === INJECT}>
          <ContextFields
            flow={props.flow}
            node={props.node}
            readOnly={props.readOnly}
            directory={props.directory}
            onChange={props.onChange}
          />
        </Show>
        <Show
          when={
            ["relay.execute", "relay.review"].includes(props.node.type) || contextOf(props.flow, props.node.id).length
          }
        >
          <div class="mx-field">
            <span>{copy.t("orchestra.workflows.details.attached")}</span>
            <For each={contextOf(props.flow, props.node.id).map((node) => node.id)}>
              {(id) => (
                <Show when={nodeOf(props.flow, id)}>
                  {(node) => (
                    <ContextFields
                      flow={props.flow}
                      node={node()}
                      readOnly={props.readOnly}
                      directory={props.directory}
                      onChange={props.onChange}
                      onRemove={() => props.onChange(removeNodes(props.flow, [id]))}
                    />
                  )}
                </Show>
              )}
            </For>
            <Show when={!props.readOnly && ["relay.execute", "relay.review"].includes(props.node.type)}>
              <div class="wf-attach">
                <button type="button" class="mx-btn" onClick={() => attach({})}>
                  <Ic name="plus" />
                  {copy.t("orchestra.workflows.details.attachText")}
                </button>
                <Show when={picker.can()}>
                  <button type="button" class="mx-btn" onClick={() => picker.pick((path) => attach({ file: path }))}>
                    <Ic name="plus" />
                    {copy.t("orchestra.workflows.details.attachFile")}
                  </button>
                </Show>
              </div>
            </Show>
            <span class="mx-hint">
              {copy.t(
                contextOf(props.flow, props.node.id).length
                  ? "orchestra.workflows.details.attachedHint"
                  : "orchestra.workflows.details.attachEmpty",
              )}
            </span>
          </div>
        </Show>
        <Show when={props.node.type !== "relay.gate"}>
          <label class="mx-field">
            <span>{copy.t("orchestra.workflows.details.instructions")}</span>
            <textarea
              style={{ "min-height": "230px" }}
              placeholder={copy.t("orchestra.workflows.details.instructionsHint")}
              value={String(props.node.parameters.instructions ?? "")}
              onInput={(event) => update({ instructions: event.currentTarget.value })}
            />
            <Show
              when={props.node.type === "relay.execute" && !String(props.node.parameters.instructions ?? "").trim()}
            >
              <span class="mx-hint" role="status">
                {copy.t("orchestra.workflows.details.instructionsEmpty")}
              </span>
            </Show>
          </label>
          <div class="mx-fields">
            <label class="mx-field">
              <span>{copy.t("orchestra.workflows.details.skill")}</span>
              <select value={skill()} onChange={(event) => update({ skill: event.currentTarget.value })}>
                <option value="">{copy.t("orchestra.workflows.details.noSkill")}</option>
                <Show when={unlisted()}>
                  {(name) => (
                    <option value={name()}>
                      {skillGone() ? copy.t("orchestra.workflows.details.skillMissing", { skill: name() }) : name()}
                    </option>
                  )}
                </Show>
                <For each={skillGroups()}>
                  {(group) => (
                    <optgroup label={copy.t(`orchestra.skills.source.${group.source}`)}>
                      <For each={group.items}>{(item) => <option value={item.name}>{item.name}</option>}</For>
                    </optgroup>
                  )}
                </For>
              </select>
              <Show when={props.skills.error}>
                <span class="mx-hint" role="alert" style={{ color: "var(--mx-bad)" }}>
                  {copy.t("orchestra.workflows.details.skillsError")}{" "}
                  <button type="button" class="mx-link" onClick={props.skills.retry}>
                    {copy.t("orchestra.workflows.details.skillsRetry")}
                  </button>
                </span>
              </Show>
              <Show when={!props.skills.names && !props.skills.error}>
                <span class="mx-hint" role="status">
                  {copy.t("orchestra.workflows.details.skillsLoading")}
                </span>
              </Show>
              <Show when={skillGone()}>
                <span class="mx-hint" role="alert" style={{ color: "var(--mx-bad)" }}>
                  {copy.t("orchestra.workflows.details.skillMissingHint", { skill: skill() })}
                </span>
              </Show>
              <Show when={chosen()?.description}>
                {(description) => <span class="mx-hint">{description()}</span>}
              </Show>
              <Show when={skill() && !skillGone()}>
                <span class="mx-hint">{copy.t("orchestra.workflows.details.skillLive")}</span>
              </Show>
            </label>
            <Show when={skill()}>
              <div class="mx-field">
                <span>{copy.t("orchestra.workflows.details.skillMode")}</span>
                <div class="wf-seg" role="group" aria-label={copy.t("orchestra.workflows.details.skillMode")}>
                  <button
                    type="button"
                    aria-pressed={props.node.parameters.skillMode !== "replace"}
                    onClick={() => update({ skillMode: "combine" })}
                  >
                    {copy.t("orchestra.workflows.details.skillAdd")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={props.node.parameters.skillMode === "replace"}
                    onClick={() => update({ skillMode: "replace" })}
                  >
                    {copy.t("orchestra.workflows.details.skillReplace")}
                  </button>
                </div>
              </div>
            </Show>
          </div>
        </Show>
        <Show when={["relay.execute", "relay.review"].includes(props.node.type)}>
          <div class="mx-fields">
            <div class="mx-field">
              <span>{copy.t("orchestra.workflows.details.mcp")}</span>
              <div class="wf-seg" role="group" aria-label={copy.t("orchestra.workflows.details.mcp")}>
                <button
                  type="button"
                  aria-pressed={!tools().mcp}
                  onClick={() => setTools({ ...tools(), mcp: undefined })}
                >
                  {copy.t("orchestra.workflows.details.mcpAgent")}
                </button>
                <button
                  type="button"
                  aria-pressed={!!tools().mcp}
                  onClick={() => setTools({ ...tools(), mcp: tools().mcp ?? [] })}
                >
                  {copy.t("orchestra.workflows.details.toolsOnly")}
                </button>
              </div>
              <Show
                when={tools().mcp}
                fallback={<span class="mx-hint">{copy.t("orchestra.workflows.details.mcpAgentHint")}</span>}
              >
                {(listed) => (
                  <>
                    <div class="wf-tools">
                      <For each={serverChoices()}>
                        {(server) => (
                          <label>
                            <button
                              type="button"
                              class="mx-toggle"
                              role="switch"
                              aria-checked={listed().includes(server)}
                              aria-label={server}
                              onClick={() =>
                                setTools({
                                  ...tools(),
                                  mcp: listed().includes(server)
                                    ? listed().filter((item) => item !== server)
                                    : [...listed(), server].toSorted(),
                                })
                              }
                            />
                            <code>{server}</code>
                            <Show when={props.servers && !props.servers.includes(server)}>
                              <span class="mx-meta" style={{ color: "var(--mx-bad)" }}>
                                {copy.t("orchestra.workflows.details.mcpMissing")}
                              </span>
                            </Show>
                          </label>
                        )}
                      </For>
                    </div>
                    <Show when={!props.servers}>
                      <span class="mx-hint" role="status">
                        {copy.t("orchestra.workflows.details.mcpLoading")}
                      </span>
                    </Show>
                    <span class="mx-hint">
                      {copy.t(
                        props.servers && !serverChoices().length
                          ? "orchestra.workflows.details.mcpNone"
                          : listed().length
                            ? "orchestra.workflows.details.mcpOnlyHint"
                            : "orchestra.workflows.details.mcpEmptyHint",
                      )}
                    </span>
                  </>
                )}
              </Show>
            </div>
            <div class="mx-field">
              <span>{copy.t("orchestra.workflows.details.bash")}</span>
              <div class="wf-seg" role="group" aria-label={copy.t("orchestra.workflows.details.bash")}>
                <button
                  type="button"
                  aria-pressed={!tools().bash}
                  onClick={() => setTools({ ...tools(), bash: undefined })}
                >
                  {copy.t("orchestra.workflows.details.bashAgent")}
                </button>
                <button
                  type="button"
                  aria-pressed={!!tools().bash}
                  onClick={() => setTools({ ...tools(), bash: tools().bash ?? [] })}
                >
                  {copy.t("orchestra.workflows.details.toolsOnly")}
                </button>
              </div>
              <Show
                when={tools().bash}
                fallback={<span class="mx-hint">{copy.t("orchestra.workflows.details.bashAgentHint")}</span>}
              >
                {(listed) => (
                  <>
                    <textarea
                      spellcheck={false}
                      style={{ "min-block-size": "84px" }}
                      aria-label={copy.t("orchestra.workflows.details.bash")}
                      placeholder={copy.t("orchestra.workflows.details.bashPlaceholder")}
                      value={listed().join("\n")}
                      onChange={(event) =>
                        setTools({
                          ...tools(),
                          bash: event.currentTarget.value
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                    <span class="mx-hint">
                      {copy.t(
                        listed().length
                          ? "orchestra.workflows.details.bashOnlyHint"
                          : "orchestra.workflows.details.bashEmptyHint",
                      )}
                    </span>
                  </>
                )}
              </Show>
            </div>
          </div>
        </Show>
        <div class="wf-field-row">
          <span>
            {copy.t(
              props.node.type === "relay.gate"
                ? "orchestra.workflows.details.gateChecks"
                : "orchestra.workflows.details.stepChecks",
            )}
          </span>
          <span class="mx-meta">
            {copy.count(
              checklist().controls.length,
              "orchestra.workflows.count.check.one",
              "orchestra.workflows.count.check.other",
            )}
          </span>
        </div>
        <Show when={checklist().invalid}>
          <p class="mx-error">{copy.t("orchestra.workflows.issue.checklist-invalid", { name: props.node.name })}</p>
        </Show>
        <Show when={unchecked()}>
          <p class="wf-note">{copy.t("orchestra.workflows.details.noChecksHint")}</p>
        </Show>
        <CheckList
          controls={checklist().controls}
          newID={(name) => checkID(props.flow, props.node.id, name)}
          onChange={(controls) => update({ checklist: writeChecklist(controls) })}
        />
        <Show when={props.node.type === "relay.gate"}>
          <label class="mx-field" style={{ "margin-top": "18px" }}>
            <span>{copy.t("orchestra.workflows.details.instructions")}</span>
            <textarea
              style={{ "min-height": "96px" }}
              placeholder={copy.t("orchestra.workflows.details.gateHint")}
              value={String(props.node.parameters.instructions ?? "")}
              onInput={(event) => update({ instructions: event.currentTarget.value })}
            />
          </label>
        </Show>
      </Show>
    </>
  )
}

// One piece of context the agent receives with its step: a note, or a file in the project.
function ContextFields(props: {
  flow: Flow
  node: FlowNode
  readOnly?: boolean
  directory?: string
  onChange: (flow: Flow) => void
  onRemove?: () => void
}) {
  const copy = useRelayCopy()
  const picker = useProjectFile(() => props.directory)
  const update = (parameters: Record<string, unknown>) =>
    props.onChange(updateNode(props.flow, props.node.id, { parameters: { ...props.node.parameters, ...parameters } }))
  const file = () => String(props.node.parameters.file ?? "")
  // File is the source once a path is set; an empty path stays in file mode only while it was just chosen.
  const [chosen, setChosen] = createSignal(false)
  const fileMode = () => !!file() || chosen()
  return (
    <div class="wf-context">
      <div class="wf-context-head">
        <div class="wf-seg" role="group" aria-label={copy.t("orchestra.workflows.details.context")}>
          <button
            type="button"
            aria-pressed={!fileMode()}
            disabled={props.readOnly}
            onClick={() => {
              setChosen(false)
              if (file()) update({ file: "" })
            }}
          >
            {copy.t("orchestra.workflows.details.contextText")}
          </button>
          <button type="button" aria-pressed={fileMode()} disabled={props.readOnly} onClick={() => setChosen(true)}>
            {copy.t("orchestra.workflows.details.contextFileOption")}
          </button>
        </div>
        <Show when={props.onRemove && !props.readOnly}>
          <button
            type="button"
            class="mx-btn icon"
            aria-label={copy.t("orchestra.workflows.details.removeContext")}
            title={copy.t("orchestra.workflows.details.removeContext")}
            onClick={() => props.onRemove?.()}
          >
            <Ic name="trash" />
          </button>
        </Show>
      </div>
      <Show
        when={fileMode()}
        fallback={
          <label class="mx-field">
            <span class="sr-only">{copy.t("orchestra.workflows.details.contextText")}</span>
            <textarea
              style={{ "min-height": "96px" }}
              placeholder={copy.t("orchestra.workflows.details.contextHint")}
              value={String(props.node.parameters.text ?? "")}
              readOnly={props.readOnly}
              onInput={(event) => update({ text: event.currentTarget.value })}
            />
          </label>
        }
      >
        <label class="mx-field">
          <span class="sr-only">{copy.t("orchestra.workflows.details.contextFile")}</span>
          <div class="wf-file-row">
            <input
              placeholder={copy.t("orchestra.workflows.details.contextFilePlaceholder")}
              value={file()}
              readOnly={props.readOnly}
              onInput={(event) => update({ file: event.currentTarget.value, text: "" })}
            />
            <Show when={picker.can() && !props.readOnly}>
              <button type="button" class="mx-btn" onClick={() => picker.pick((path) => update({ file: path, text: "" }))}>
                <Ic name="open" />
                {copy.t("orchestra.workflows.details.chooseFile")}
              </button>
            </Show>
          </div>
          <span class="mx-hint">{copy.t("orchestra.workflows.details.contextFileHint")}</span>
        </label>
      </Show>
    </div>
  )
}

// The run reads a context file relative to the project, so a file picked outside it cannot be used.
function useProjectFile(directory: () => string | undefined) {
  const copy = useRelayCopy()
  const platform = usePlatform()
  return {
    can: () => !!platform.openAttachmentPickerDialog && !!platform.getPathForFile && !!directory(),
    pick: (done: (path: string) => void) =>
      platform.openAttachmentPickerDialog?.(
        { title: copy.t("orchestra.workflows.details.chooseFile"), extensions: [], defaultPath: directory() },
        async (picked) => {
          const root = (directory() ?? "").replace(/\\/g, "/").replace(/\/$/, "")
          const path = (platform.getPathForFile?.(picked) ?? "").replace(/\\/g, "/")
          if (!root || !path.startsWith(`${root}/`))
            return showToast({ variant: "error", title: copy.t("orchestra.workflows.details.fileOutside") })
          done(path.slice(root.length + 1))
        },
      ),
  }
}

function StartParams(props: Props) {
  const copy = useRelayCopy()
  const [open, setOpen] = createSignal(
    new Set(props.focusPhase ? [props.focusPhase] : props.flow.phases.slice(0, 1).map((phase) => phase.id)),
  )
  const update = (parameters: Record<string, unknown>) =>
    props.onChange(updateNode(props.flow, props.node.id, { parameters: { ...props.node.parameters, ...parameters } }))
  return (
    <>
      <label class="mx-field">
        <span>{copy.t("orchestra.workflows.details.objective")}</span>
        <textarea
          class="prose"
          style={{ "min-height": "84px" }}
          data-autofocus={props.inline ? undefined : ""}
          value={String(props.node.parameters.relayBrief ?? "")}
          onInput={(event) => update({ relayBrief: event.currentTarget.value })}
        />
        <span class="mx-hint">{copy.t("orchestra.workflows.details.objectiveHint")}</span>
      </label>
      <label class="mx-field">
        <span>{copy.t("orchestra.workflows.details.purpose")}</span>
        <input
          name="description"
          value={props.description}
          onInput={(event) => props.onDescribe(event.currentTarget.value)}
        />
        <span class="mx-hint">{copy.t("orchestra.workflows.details.purposeHint")}</span>
      </label>
      <label class="mx-field" style={{ "max-width": "260px" }}>
        <span>{copy.t("orchestra.workflows.details.budgetField")}</span>
        <input
          type="number"
          min="0"
          max="99"
          value={retryBudget(props.flow)}
          onInput={(event) => {
            // An empty field is a number being retyped: the budget keeps its value until there is a new one.
            if (!event.currentTarget.value.trim()) return
            const value = Math.round(Number(event.currentTarget.value))
            if (Number.isFinite(value)) update({ relayRetryBudget: Math.max(0, Math.min(99, value)) })
          }}
          onBlur={(event) => (event.currentTarget.value = String(retryBudget(props.flow)))}
        />
        <span class="mx-hint">
          {copy.t("orchestra.workflows.details.budgetHint", { count: retryBudget(props.flow) })}
        </span>
      </label>
      {/* The list view edits each phase's instructions in the phase itself. */}
      <Show when={!props.inline}>
        <div class="wf-field-row">
          <span>{copy.t("orchestra.workflows.details.protocols")}</span>
        </div>
        <Show
          when={props.flow.phases.length}
          fallback={<Empty>{copy.t("orchestra.workflows.details.noPhases")}</Empty>}
        >
          <Index each={props.flow.phases}>
            {(phase) => {
              const expanded = () => open().has(phase().id)
              return (
                <div class="wf-proto" classList={{ flash: props.focusPhase === phase().id }} data-proto={phase().id}>
                  <button
                    type="button"
                    aria-expanded={expanded()}
                    onClick={() => {
                      const next = new Set(open())
                      if (expanded()) next.delete(phase().id)
                      if (!expanded()) next.add(phase().id)
                      setOpen(next)
                    }}
                  >
                    <Ic name="chevron" />
                    <b>{phase().name}</b>
                    <small>
                      {phase().description
                        ? copy.count(
                            phase().description.split("\n").length,
                            "orchestra.workflows.count.line.one",
                            "orchestra.workflows.count.line.other",
                          )
                        : copy.t("orchestra.workflows.details.protocolEmpty")}
                    </small>
                  </button>
                  <Show when={expanded()}>
                    <PhaseNameField flow={props.flow} phase={phase()} onChange={props.onChange} />
                    <textarea
                      aria-label={copy.t("orchestra.workflows.details.protocolLabel", { phase: phase().name })}
                      value={phase().description}
                      onInput={(event) =>
                        props.onChange(updatePhase(props.flow, phase().id, { description: event.currentTarget.value }))
                      }
                    />
                  </Show>
                </div>
              )
            }}
          </Index>
        </Show>
      </Show>
    </>
  )
}

// Renames a phase as the user types; an empty or repeated name is shown as an error and never reaches the flow.
export function PhaseNameField(props: { flow: Flow; phase: FlowPhase; onChange: (flow: Flow) => void }) {
  const copy = useRelayCopy()
  const id = createUniqueId()
  const [draft, setDraft] = createStore({ name: props.phase.name, error: "" as "" | "required" | "taken" | "lines" })
  createEffect(
    on(
      () => [props.phase.id, props.phase.name],
      (next, previous) => {
        if (next[0] === previous?.[0] && next[1] === draft.name.trim()) return
        setDraft({ name: props.phase.name, error: "" })
      },
      { defer: true },
    ),
  )
  return (
    <label class="mx-field" classList={{ invalid: !!draft.error }}>
      <span>{copy.t("orchestra.workflows.details.phaseName")}</span>
      <input
        value={draft.name}
        aria-invalid={!!draft.error}
        aria-describedby={draft.error ? id : undefined}
        onInput={(event) => {
          const value = event.currentTarget.value
          const name = value.trim()
          const taken = props.flow.phases.some((phase) => phase.id !== props.phase.id && phase.name === name)
          setDraft({ name: value, error: !name ? "required" : taken ? "taken" : "" })
          if (!name || taken || name === props.phase.name) return
          props.onChange(updatePhase(props.flow, props.phase.id, { name }))
        }}
        onPaste={(event) => pasteOneLine(event, () => setDraft("error", "lines"))}
        onBlur={() => setDraft({ name: props.phase.name, error: "" })}
      />
      <Show when={draft.error}>
        <span id={id} class="mx-hint" role="alert" style={{ color: "var(--mx-bad)" }}>
          {copy.t(
            draft.error === "required"
              ? "orchestra.workflows.details.nameRequired"
              : draft.error === "lines"
                ? "orchestra.workflows.details.nameOneLine"
                : "orchestra.workflows.details.phaseNameTaken",
          )}
        </span>
      </Show>
    </label>
  )
}
