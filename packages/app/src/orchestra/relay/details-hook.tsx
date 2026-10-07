import { createEffect, createSignal, For, type JSX, on, Show } from "solid-js"
import { decisionTime, type RelayDecision, type RelayNodeType } from "./client"
import { Empty, NodeDetails, Rows, Switchable } from "./details"
import {
  CONDITION,
  type Flow,
  type FlowNode,
  inEdges,
  nodeOf,
  type Outputs,
  outputsOf,
  TRIGGER,
  updateNode,
} from "./graph"
import { hookKey, isFileOperation, operationTimings } from "./catalog"
import { Ic, useRelayCopy } from "./ui"

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
      input={<Input {...props} />}
      params={<Params {...props} />}
      output={<Output {...props} />}
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
            <Show when={String(props.node.parameters.message ?? "")}>
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

function Params(props: Props) {
  const copy = useRelayCopy()
  const [nameError, setNameError] = createSignal(false)
  // Walking to another node starts its name field clean.
  createEffect(
    on(
      () => props.node.id,
      () => setNameError(false),
      { defer: true },
    ),
  )
  const update = (parameters: Record<string, unknown>) =>
    props.onChange(updateNode(props.flow, props.node.id, { parameters: { ...props.node.parameters, ...parameters } }))
  const rename = (value: string) => {
    const name = value.trim()
    const taken = props.flow.nodes.some((node) => node.id !== props.node.id && node.name === name)
    setNameError(!name || taken)
    if (name && !taken) props.onChange(updateNode(props.flow, props.node.id, { name }))
  }
  const message = () => {
    if (props.node.type === "relay.hookAllow") return copy.t("orchestra.hooks.details.note")
    if (props.node.type === "relay.hookRecord") return copy.t("orchestra.hooks.details.logLine")
    return copy.t("orchestra.hooks.details.message")
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
      <label class="mx-field" classList={{ invalid: nameError() }}>
        <span>{copy.t("orchestra.workflows.details.name")}</span>
        <input value={props.node.name} data-autofocus="" onInput={(event) => rename(event.currentTarget.value)} />
        <Show when={nameError()}>
          <span class="mx-hint" style={{ color: "var(--mx-bad)" }}>
            {copy.t("orchestra.workflows.details.nameTaken")}
          </span>
        </Show>
      </label>
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
          <span class="mx-hint">{copy.t("orchestra.hooks.details.eventHint")}</span>
        </label>
      </Show>
      <Show when={props.node.type === CONDITION}>
        <div class="mx-fields">
          <label class="mx-field">
            <span>{copy.t("orchestra.hooks.details.field")}</span>
            <select
              value={String(props.node.parameters.field ?? "path")}
              onChange={(event) => update({ field: event.currentTarget.value })}
            >
              <For each={["path", "tool", "command", "event"] as const}>
                {(field) => <option value={field}>{copy.t(`orchestra.hooks.field.${field}`)}</option>}
              </For>
            </select>
          </label>
          <label class="mx-field" classList={{ invalid: !String(props.node.parameters.pattern ?? "") }}>
            <span>{copy.t("orchestra.hooks.details.matches")}</span>
            <input
              value={String(props.node.parameters.pattern ?? "")}
              placeholder={props.node.parameters.field === "path" ? "src/generated/**" : "git push *"}
              onInput={(event) => update({ pattern: event.currentTarget.value })}
            />
            <span class="mx-hint">
              {copy.t(
                props.node.parameters.field === "path"
                  ? "orchestra.hooks.details.patternPath"
                  : "orchestra.hooks.details.patternWildcard",
              )}
            </span>
          </label>
        </div>
        <p class="mx-note" style={{ "margin-top": "0" }}>
          {copy.t("orchestra.hooks.details.ports")}
        </p>
        <button type="button" class="mx-btn" onClick={() => props.onAddCondition(props.node.id)}>
          <Ic name="plus" />
          {copy.t("orchestra.hooks.details.addCondition")}
        </button>
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
            value={String(props.node.parameters.message ?? "")}
            onInput={(event) => update({ message: event.currentTarget.value })}
          />
        </label>
      </Show>
    </>
  )
}

// Restrictive outcomes in red, waits for a human in warm ink, passes and records in green.
export function outcomeTone(outcome: RelayDecision["outcome"]) {
  if (outcome === "blocked" || outcome === "rejected" || outcome === "failed" || outcome === "repair-required")
    return "bad"
  if (outcome === "approved" || outcome === "cancelled" || outcome === "unavailable") return "warm"
  return "good"
}
