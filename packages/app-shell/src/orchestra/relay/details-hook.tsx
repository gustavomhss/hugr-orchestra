import { For, type JSX, Show } from "solid-js"
import { decisionTime, type RelayDecision, type RelayNodeType } from "./client"
import { Empty, NodeDetails, NodeNameField, Rows, Switchable } from "./details"
import {
  addRequirement,
  CONDITION,
  conditionFields,
  type Flow,
  type FlowNode,
  inEdges,
  isConditionField,
  nodeOf,
  type Outputs,
  outputsOf,
  RECORDED,
  recordOnly,
  TRIGGER,
  updateNode,
} from "./graph"
import { eventSuggestions, hookKey, isFileOperation, operationTimings, toolSuggestions } from "./catalog"
import { Ic, useRelayCopy } from "./ui"
import { HookQueryStatus, type HookQueryState } from "./hook-status"

type Copy = ReturnType<typeof useRelayCopy>

// "Before edit file", "After any tool", "On session stop"; an operation this app does not know uses the server's label.
export function triggerName(copy: Copy, operation: string, timing: string, types?: RelayNodeType[]) {
  const when = timing === "after" ? "after" : "before"
  if (isFileOperation(operation) || operation === "tool") return copy.t(`orchestra.hooks.trigger.${when}.${operation}`)
  if (operation === "session-start") return copy.t("orchestra.hooks.trigger.sessionStart")
  if (operation === "prompt") return copy.t("orchestra.hooks.trigger.prompt")
  if (operation === "session-idle") return copy.t("orchestra.hooks.trigger.sessionIdle")
  const label = types
    ?.find((item) => item.type === TRIGGER)
    ?.parameters.find((parameter) => parameter.name === "operation")
    ?.options?.find((option) => option.value === operation)?.label
  return copy.t(when === "after" ? "orchestra.hooks.trigger.afterOther" : "orchestra.hooks.trigger.beforeOther", {
    event: (label ?? operation).toLowerCase(),
  })
}

// Every operation and timing the server lists that the contract allows together.
export function hookOperations(types: RelayNodeType[] | undefined) {
  const trigger = types?.find((item) => item.type === TRIGGER)
  const option = (name: string) =>
    trigger?.parameters.find((parameter) => parameter.name === name)?.options?.map((item) => item.value)
  const operations = option("operation") ?? [
    "read",
    "edit",
    "write",
    "command",
    "tool",
    "session-start",
    "prompt",
    "session-idle",
  ]
  const timings = option("timing") ?? ["before", "after"]
  return operations.flatMap((operation) =>
    operationTimings(operation)
      .filter((timing) => timings.includes(timing))
      .map((timing) => ({ operation, timing })),
  )
}

type Props = {
  flow: Flow
  node: FlowNode
  outputs: Outputs
  types: RelayNodeType[] | undefined
  decision: RelayDecision | undefined
  decisionStatus?: HookQueryState
  installed?: boolean
  testResult?: string
  issues: string[]
  save: JSX.Element
  onChange: (flow: Flow) => void
  onNav: (id: string) => void
  onClose: () => void
  onTest: () => void
  onAddCondition: (id: string) => void
}

export function HookDetails(props: Props) {
  const copy = useRelayCopy()
  const index = () => props.flow.nodes.findIndex((node) => node.id === props.node.id)
  const kind = () => {
    const key = hookKey(props.node.type)
    if (props.node.type === TRIGGER) return copy.t("orchestra.hooks.type.trigger")
    return key ? copy.t(`orchestra.hooks.type.${key}`) : props.node.type
  }
  return (
    <NodeDetails
      node={props.node}
      kind={kind()}
      previous={props.flow.nodes[index() - 1]}
      next={props.flow.nodes[index() + 1]}
      input={<Show when={!props.decisionStatus && props.installed !== false} fallback={<DecisionStatus {...props} />}><Input {...props} /></Show>}
      params={<>
        <Show when={props.testResult}>{(result) => <p class="mx-note" role="status">{result()}</p>}</Show>
        <Params {...props} />
      </>}
      output={<Show when={!props.decisionStatus && props.installed !== false} fallback={<DecisionStatus {...props} />}><Output {...props} /></Show>}
      save={props.save}
      actions={
        <button type="button" class="mx-btn" onClick={props.onTest}>
          <Ic name="test" />
          {copy.t("orchestra.hooks.test")}
        </button>
      }
      onNav={props.onNav}
      onClose={props.onClose}
    />
  )
}

function DecisionStatus(props: Props) {
  const copy = useRelayCopy()
  return (
    <Show when={props.decisionStatus} fallback={<Empty>{copy.t("orchestra.workflows.hookState.uninstalled")}</Empty>}>
      {(status) => <HookQueryStatus {...status()} />}
    </Show>
  )
}

function Input(props: Props) {
  const copy = useRelayCopy()
  return (
    <Show
      when={props.decision}
      fallback={
        <>
          <div class="wf-col-head">
            <h3>{copy.t("orchestra.workflows.details.input")}</h3>
          </div>
          <Empty>
            {copy.t("orchestra.hooks.details.notFired")}
            <br />
            <button type="button" class="mx-btn" onClick={props.onTest}>
              <Ic name="test" />
              {copy.t("orchestra.hooks.test")}
            </button>
          </Empty>
        </>
      }
    >
      {(decision) => (
        <Switchable title={copy.t("orchestra.hooks.details.lastFire")} json={decision()}>
          <Rows
            rows={[
              [copy.t("orchestra.hooks.details.event"), decision().trigger],
              [copy.t("orchestra.hooks.details.tool"), decision().tool ?? undefined],
              [
                copy.t(
                  decision().trigger.startsWith("command.")
                    ? "orchestra.hooks.details.commandHash"
                    : "orchestra.hooks.details.target",
                ),
                decision().subject,
              ],
              [copy.t("orchestra.hooks.details.session"), decision().session],
              [
                copy.t("orchestra.hooks.details.when"),
                `${copy.clock(decisionTime(decision()))} · ${copy.when(decisionTime(decision()))}`,
              ],
            ]}
          />
        </Switchable>
      )}
    </Show>
  )
}

function Output(props: Props) {
  const copy = useRelayCopy()
  const decider = () => (props.decision ? nodeOf(props.flow, props.decision.node) : undefined)
  const reached = () => {
    const target = decider()
    if (!target) return false
    if (target.id === props.node.id || props.node.type === TRIGGER) return true
    const seen = new Set<string>()
    const up = (id: string): boolean => {
      if (id === props.node.id) return true
      if (seen.has(id)) return false
      seen.add(id)
      return inEdges(props.flow, id).some((edge) => up(edge.from))
    }
    return up(target.id)
  }
  return (
    <Show
      when={props.decision && reached() ? props.decision : undefined}
      fallback={
        <>
          <div class="wf-col-head">
            <h3>{copy.t("orchestra.workflows.details.output")}</h3>
          </div>
          <Empty>
            {copy.t(props.decision ? "orchestra.hooks.details.notReached" : "orchestra.hooks.details.nothing")}
          </Empty>
        </>
      }
    >
      {(decision) => (
        <Switchable
          title={copy.t("orchestra.hooks.details.lastFire")}
          json={{ node: decision().node, action: decision().action, outcome: decision().outcome }}
        >
          <div class="wf-out-head">
            <span class={`mx-badge ${outcomeTone(decision().outcome)}`}>
              {copy.t(`orchestra.hooks.outcome.${decision().outcome}`)}
            </span>
          </div>
          <Show
            when={decider()?.id === props.node.id}
            fallback={<Rows rows={[[copy.t("orchestra.hooks.details.continued"), decider()?.name]]} />}
          >
            <Show when={reachedAgent(decision().outcome) && String(props.node.parameters.message ?? "")}>
              <div class="wf-check">
                <div class="wf-check-top">{copy.t("orchestra.hooks.details.agentSees")}</div>
                <pre>{String(props.node.parameters.message ?? "")}</pre>
              </div>
            </Show>
          </Show>
        </Switchable>
      )}
    </Show>
  )
}

const PATTERN_HINTS = {
  path: "orchestra.hooks.details.patternPath",
  tool: "orchestra.hooks.details.patternTool",
  command: "orchestra.hooks.details.patternCommand",
  event: "orchestra.hooks.details.patternEvent",
} as const

function Params(props: Props) {
  const copy = useRelayCopy()
  const update = (parameters: Record<string, unknown>) =>
    props.onChange(updateNode(props.flow, props.node.id, { parameters: { ...props.node.parameters, ...parameters } }))
  // Allow and Record keep their note with the hook; every other action hands its message to the agent.
  const note = () => props.node.type === "relay.hookAllow" || props.node.type === "relay.hookRecord"
  const message = () => copy.t(note() ? "orchestra.hooks.details.note" : "orchestra.hooks.details.message")
  const trigger = () => props.flow.nodes.find((node) => node.type === TRIGGER)
  // An empty Record note is saved as RECORDED (the export needs text), which the field shows as empty.
  const noteValue = () => {
    const value = String(props.node.parameters.message ?? "")
    return props.node.type === "relay.hookRecord" && value === RECORDED ? "" : value
  }
  const field = () => {
    const value = props.node.parameters.field
    return isConditionField(value) ? value : "path"
  }
  // Only the fields this trigger's event carries; one the hook already holds stays listed so it is not swapped silently.
  const fields = () => {
    const offered = conditionFields(trigger()?.parameters.operation)
    return offered.includes(field()) ? offered : [field(), ...offered]
  }
  const suggestions = () => {
    if (field() === "tool") return toolSuggestions(trigger()?.parameters.operation)
    if (field() === "event") return eventSuggestions(trigger()?.parameters.operation, trigger()?.parameters.timing)
    return []
  }
  return (
    <>
      <div class="wf-col-head">
        <h3>{copy.t("orchestra.workflows.details.params")}</h3>
      </div>
      <For each={props.issues}>
        {(issue) => (
          <div class="wf-alert">
            <Ic name="warn" />
            <span>{issue}</span>
          </div>
        )}
      </For>
      <NodeNameField flow={props.flow} node={props.node} onChange={props.onChange} />
      <Show when={props.node.type === TRIGGER}>
        <label class="mx-field">
          <span>{copy.t("orchestra.hooks.details.event")}</span>
          <select
            value={`${String(props.node.parameters.operation ?? "edit")}:${String(props.node.parameters.timing ?? "before")}`}
            onChange={(event) => {
              const [operation, timing] = event.currentTarget.value.split(":")
              props.onChange(
                updateNode(props.flow, props.node.id, {
                  name: triggerName(copy, operation, timing, props.types),
                  parameters: { ...props.node.parameters, operation, timing },
                }),
              )
            }}
          >
            <For each={hookOperations(props.types)}>
              {(item) => (
                <option value={`${item.operation}:${item.timing}`}>
                  {triggerName(copy, item.operation, item.timing, props.types)}
                </option>
              )}
            </For>
          </select>
          <span class="mx-hint">
            {copy.t(
              recordOnly(props.node.parameters.operation)
                ? "orchestra.hooks.details.eventHintRecordOnly"
                : "orchestra.hooks.details.eventHint",
            )}
          </span>
        </label>
      </Show>
      <Show when={props.node.type === CONDITION}>
        <div class="mx-fields">
          <label class="mx-field">
            <span>{copy.t("orchestra.hooks.details.field")}</span>
            <select value={field()} onChange={(event) => update({ field: event.currentTarget.value })}>
              <For each={fields()}>
                {(item) => <option value={item}>{copy.t(`orchestra.hooks.field.${item}`)}</option>}
              </For>
            </select>
          </label>
          <label class="mx-field" classList={{ invalid: !String(props.node.parameters.pattern ?? "") }}>
            <span>{copy.t("orchestra.hooks.details.matches")}</span>
            <input
              value={String(props.node.parameters.pattern ?? "")}
              placeholder={copy.t(`orchestra.hooks.details.placeholder.${field()}`)}
              list={suggestions().length ? "wf-hook-suggestions" : undefined}
              onInput={(event) => update({ pattern: event.currentTarget.value })}
            />
            <datalist id="wf-hook-suggestions">
              <For each={suggestions()}>{(item) => <option value={item} />}</For>
            </datalist>
            <span class="mx-hint">{copy.t(PATTERN_HINTS[field()])}</span>
          </label>
        </div>
        <p class="mx-note" style={{ "margin-top": "0" }}>
          {copy.t("orchestra.hooks.details.ports")}
        </p>
        <div style={{ display: "flex", "flex-wrap": "wrap", gap: "8px" }}>
          <button type="button" class="mx-btn" onClick={() => props.onAddCondition(props.node.id)}>
            <Ic name="plus" />
            {copy.t("orchestra.hooks.details.addCondition")}
          </button>
          <button
            type="button"
            class="mx-btn"
            onClick={() => {
              const added = addRequirement(props.flow, props.node.id, copy.t("orchestra.hooks.type.condition"))
              if (!added) return
              props.onChange(added.flow)
              props.onNav(added.id)
            }}
          >
            <Ic name="plus" />
            {copy.t("orchestra.hooks.details.addRequirement")}
          </button>
        </div>
        <p class="mx-note">{copy.t("orchestra.hooks.details.combine")}</p>
      </Show>
      <Show when={props.node.type !== TRIGGER && props.node.type !== CONDITION}>
        <Show when={props.node.type === "relay.hookVerify"}>
          <label class="mx-field">
            <span>{copy.t("orchestra.hooks.details.command")}</span>
            <input
              value={String(props.node.parameters.check ?? "")}
              placeholder="bun typecheck"
              style={{ "font-family": "var(--mx-mono)" }}
              onInput={(event) => update({ check: event.currentTarget.value })}
            />
          </label>
          <Show when={outputsOf(props.flow, props.node, props.outputs).length === 2}>
            <p class="mx-note" style={{ "margin-top": "-6px" }}>
              {copy.t("orchestra.hooks.details.passFail")}
            </p>
          </Show>
        </Show>
        <label class="mx-field">
          <span>{message()}</span>
          <textarea
            class="prose"
            style={{ "min-height": "110px" }}
            value={noteValue()}
            onInput={(event) => update({ message: event.currentTarget.value })}
          />
          <Show when={note()}>
            <span class="mx-hint">{copy.t("orchestra.hooks.details.noteHint")}</span>
          </Show>
          <Show when={props.node.type === "relay.hookRemind" && trigger()?.parameters.operation !== "prompt"}>
            <span class="mx-hint">{copy.t("orchestra.hooks.details.remindHint")}</span>
          </Show>
        </label>
      </Show>
    </>
  )
}

// The agent reads the message only when it comes back as a reminder or as the text of a refusal, a failed check or a
// repair. A pass, an approval, a record and an allow say nothing to it.
function reachedAgent(outcome: RelayDecision["outcome"]) {
  return ["reminded", "blocked", "rejected", "failed", "repair-required"].includes(outcome)
}

// Restrictive outcomes in red, waits for a human in warm ink, passes and records in green.
export function outcomeTone(outcome: RelayDecision["outcome"]) {
  if (outcome === "blocked" || outcome === "rejected" || outcome === "failed" || outcome === "repair-required")
    return "bad"
  if (outcome === "approved" || outcome === "cancelled" || outcome === "unavailable") return "warm"
  return "good"
}
