import { createEffect, createSignal, For, type JSX, on, Show } from "solid-js"
import type { RelayDecision, RelayNodeType } from "./client"
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
import { hookKey, isOperation } from "./catalog"
import { Ic, useRelayCopy } from "./ui"

type Copy = ReturnType<typeof useRelayCopy>

export const TIMINGS = ["before", "after"]

// "Before edit file", "After shell command", "On session stop"; unknown operations use the server's label.
export function triggerName(copy: Copy, operation: string, timing: string, types?: RelayNodeType[]) {
  if (isOperation(operation))
    return copy.t(`orchestra.hooks.trigger.${timing === "after" ? "after" : "before"}.${operation}`)
  if (operation === "stop") return copy.t("orchestra.hooks.trigger.stop")
  const label = types
    ?.find((item) => item.type === TRIGGER)
    ?.parameters.find((parameter) => parameter.name === "operation")
    ?.options.find((option) => option.value === operation)?.label
  return copy.t(timing === "after" ? "orchestra.hooks.trigger.afterOther" : "orchestra.hooks.trigger.beforeOther", {
    event: (label ?? operation).toLowerCase(),
  })
}

export function hookOperations(types: RelayNodeType[] | undefined) {
  const trigger = types?.find((item) => item.type === TRIGGER)
  const operations = trigger?.parameters
    .find((parameter) => parameter.name === "operation")
    ?.options.map((option) => option.value) ?? ["read", "edit", "write", "command"]
  const timings =
    trigger?.parameters.find((parameter) => parameter.name === "timing")?.options.map((option) => option.value) ??
    TIMINGS
  return operations.flatMap((operation) =>
    operation === "stop" ? [{ operation, timing: "after" }] : timings.map((timing) => ({ operation, timing })),
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
              [copy.t("orchestra.hooks.details.tool"), decision().tool],
              [copy.t("orchestra.hooks.details.target"), decision().subject],
              [copy.t("orchestra.hooks.details.session"), decision().sessionID],
              [
                copy.t("orchestra.hooks.details.when"),
                decision().at !== undefined ? `${copy.clock(decision().at)} · ${copy.when(decision().at)}` : undefined,
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
  const decider = () => (props.decision ? nodeOf(props.flow, props.decision.nodeID) : undefined)
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
          json={{ node: decision().nodeID, action: decision().action, outcome: decision().outcome }}
        >
          <div class="wf-out-head">
            <span class="mx-badge blue">{decision().outcome}</span>
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
          <label class="mx-field" classList={{ invalid: !String(props.node.parameters.pattern ?? "").trim() }}>
            <span>{copy.t("orchestra.hooks.details.matches")}</span>
            <input
              value={String(props.node.parameters.pattern ?? "")}
              placeholder="src/generated/**"
              onInput={(event) => update({ pattern: event.currentTarget.value })}
            />
          </label>
        </div>
        <p class="mx-note" style={{ "margin-top": "0" }}>
          {copy.t("orchestra.hooks.details.ports")}
        </p>
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
