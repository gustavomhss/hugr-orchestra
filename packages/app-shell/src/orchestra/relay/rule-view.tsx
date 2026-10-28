import { createEffect, createMemo, For, type JSX, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { RelayNodeType } from "./client"
import { eventSuggestions, hookEntries, hookKey, nodeGlyph, nodeTone, operationGlyph, toolSuggestions } from "./catalog"
import { HookParams, hookOperations, triggerName } from "./details-hook"
import {
  CONDITION,
  conditionFields,
  type Flow,
  type FlowNode,
  type Issue,
  isConditionField,
  issueNode,
  nodeOf,
  type Outputs,
  TRIGGER,
  updateNode,
} from "./graph"
import { addNode } from "./insert"
import { issueText } from "./parts"
import { FINAL, readRule, type Rule, writeRule } from "./rule"
import { Ic, NodeGlyph, useRelayCopy } from "./ui"

type Props = {
  flow: Flow
  outputs: Outputs
  types: RelayNodeType[] | undefined
  issues: Issue[]
  readOnly?: boolean
  // The node named in the URL opens its card; the add flag opens the action picker.
  open: string | undefined
  adding: boolean
  banner: JSX.Element
  save: JSX.Element
  edit: (flow: Flow) => void
  onCanvas: () => void
  onTest: () => void
  onAdded: () => void
}

// The hook as a sentence: When <event>, if any case matches, then <actions>. Every change is written back as the graph
// the canvas draws, laid out in rows, so both views always show the same hook.
export function RuleView(props: Props) {
  const copy = useRelayCopy()
  const [state, setState] = createStore({ picker: false, open: undefined as string | undefined })
  const rule = createMemo(() => readRule(props.flow))
  const trigger = () => nodeOf(props.flow, rule()?.trigger)
  const operation = () => trigger()?.parameters.operation
  // A missing action belongs to Then, which already says so, not to the event it is attached to.
  const issuesOf = (id: string) =>
    props.issues
      .filter((issue) => issueNode(issue) === id && issue.code !== "no-action")
      .map((issue) => issueText(copy, props.flow, issue))
  const change = (flow: Flow, next: (rule: Rule) => Rule) => {
    const current = readRule(flow) ?? rule()
    if (current) props.edit(writeRule(flow, next(current)))
  }
  createEffect(
    on(
      () => props.open,
      (id) => id && setState("open", id),
    ),
  )
  createEffect(
    on(
      () => props.adding,
      (adding) => {
        if (!adding) return
        if (!props.readOnly && trigger()) setState("picker", true)
        props.onAdded()
      },
    ),
  )
  const create = (request: Parameters<typeof addNode>[1]) => addNode(props.flow, request, props.types)

  const setTrigger = (op: string, timing: string) => {
    const added = create({
      key: `trigger:${op}`,
      type: TRIGGER,
      name: triggerName(copy, op, timing, props.types),
      operation: op,
      timing,
    })
    change(added.flow, (current) => ({ ...current, trigger: added.id }))
  }
  // A new condition reads the first field this event carries.
  const condition = (place: (current: Rule, id: string) => Rule) => {
    const added = create({ key: "condition", type: CONDITION, name: copy.t("orchestra.hooks.type.condition") })
    const field = conditionFields(operation())[0]
    change(
      updateNode(added.flow, added.id, { parameters: { ...nodeOf(added.flow, added.id)!.parameters, field } }),
      (current) => place(current, added.id),
    )
  }
  const removeCondition = (id: string) =>
    change(props.flow, (current) => ({
      ...current,
      cases: current.cases.map((conditions) => conditions.filter((item) => item !== id)).filter((item) => item.length),
    }))
  // A new action goes before a Block or Require repair at the end, which stop the rule.
  const action = (key: string, type: string) => {
    const added = create({ key, type, name: copy.t(`orchestra.hooks.type.${key}`) })
    setState({ picker: false, open: added.id })
    change(added.flow, (current) => {
      const last = current.actions.at(-1)
      const ends = FINAL.includes(nodeOf(props.flow, last)?.type ?? "")
      return {
        ...current,
        actions: ends ? [...current.actions.slice(0, -1), added.id, last!] : [...current.actions, added.id],
      }
    })
  }
  const moveAction = (id: string, direction: -1 | 1) =>
    change(props.flow, (current) => {
      const at = current.actions.indexOf(id)
      const other = current.actions[at + direction]
      if (!other) return current
      return { ...current, actions: current.actions.with(at, other).with(at + direction, id) }
    })
  const removeAction = (id: string) =>
    change(props.flow, (current) => ({ ...current, actions: current.actions.filter((item) => item !== id) }))
  const isFinal = (id: string | undefined) => FINAL.includes(nodeOf(props.flow, id)?.type ?? "")
  const offered = () =>
    hookEntries(props.types, props.flow).filter(
      (entry) =>
        entry.group === "actions" && !(FINAL.includes(entry.type) && rule()?.actions.some((id) => isFinal(id))),
    )

  const conditionRow = (node: FlowNode) => {
    const field = () => (isConditionField(node.parameters.field) ? node.parameters.field : "path")
    const fields = () => {
      const listed = conditionFields(operation())
      return listed.includes(field()) ? listed : [field(), ...listed]
    }
    const suggestions = () => {
      if (field() === "tool") return toolSuggestions(operation())
      if (field() === "event") return eventSuggestions(operation(), trigger()?.parameters.timing)
      return []
    }
    const update = (parameters: Record<string, unknown>) =>
      props.edit(updateNode(props.flow, node.id, { parameters: { ...node.parameters, ...parameters } }))
    return (
      <div class="wf-rule-cond" classList={{ issue: issuesOf(node.id).length > 0 }} data-node={node.id}>
        <select
          aria-label={copy.t("orchestra.hooks.details.field")}
          value={field()}
          disabled={props.readOnly}
          onChange={(event) => update({ field: event.currentTarget.value })}
        >
          <For each={fields()}>{(item) => <option value={item}>{copy.t(`orchestra.hooks.field.${item}`)}</option>}</For>
        </select>
        <span class="wf-rule-word">{copy.t("orchestra.hooks.rule.matches")}</span>
        <input
          aria-label={copy.t("orchestra.hooks.details.matches")}
          value={String(node.parameters.pattern ?? "")}
          placeholder={copy.t(`orchestra.hooks.details.placeholder.${field()}`)}
          list={suggestions().length ? `wf-rule-${node.id}` : undefined}
          readOnly={props.readOnly}
          onInput={(event) => update({ pattern: event.currentTarget.value })}
        />
        <datalist id={`wf-rule-${node.id}`}>
          <For each={suggestions()}>{(item) => <option value={item} />}</For>
        </datalist>
        <Show when={!props.readOnly}>
          <button
            type="button"
            class="mx-btn icon"
            aria-label={copy.t("orchestra.workflows.canvas.remove", { name: node.name })}
            title={copy.t("orchestra.workflows.canvas.remove", { name: node.name })}
            onClick={() => removeCondition(node.id)}
          >
            <Ic name="close" />
          </button>
        </Show>
        <For each={issuesOf(node.id)}>
          {(issue) => (
            <span class="wf-rule-issue">
              <Ic name="warn" />
              {issue}
            </span>
          )}
        </For>
      </div>
    )
  }

  const params = (node: FlowNode) => (
    <HookParams
      inline
      flow={props.flow}
      node={node}
      outputs={props.outputs}
      types={props.types}
      decision={undefined}
      issues={issuesOf(node.id)}
      save={props.save}
      readOnly={props.readOnly}
      onChange={props.edit}
      onNav={() => undefined}
      onClose={() => undefined}
      onTest={props.onTest}
      onAddCondition={() => undefined}
    />
  )

  const actionCard = (node: FlowNode, index: number, count: number) => {
    const opened = () => state.open === node.id
    const key = hookKey(node.type)
    const message = () => String(node.parameters.check || node.parameters.message || "").split("\n")[0]
    return (
      <article class="wf-step" classList={{ open: opened(), issue: issuesOf(node.id).length > 0 }} data-node={node.id}>
        <div class="wf-step-head">
          <button
            type="button"
            class="wf-step-main"
            aria-expanded={opened()}
            onClick={() => setState("open", opened() ? undefined : node.id)}
          >
            <span class="wf-step-n">{index + 1}</span>
            <span class={`wf-pick-tile k-${nodeTone(node)}`}>
              <NodeGlyph name={nodeGlyph(node)} />
            </span>
            <span class="wf-step-text">
              <strong>{key ? copy.t(`orchestra.hooks.type.${key}`) : node.name}</strong>
              <Show when={!opened()}>
                <em classList={{ empty: !message() }}>{message() || copy.t(`orchestra.hooks.typeDesc.${key}`)}</em>
              </Show>
            </span>
            <Show when={issuesOf(node.id).length}>
              <span class="wf-step-warn">
                <Ic name="warn" />
              </span>
            </Show>
            <Ic name="chevron" class="wf-ic wf-step-chev" />
          </button>
          <Show when={!props.readOnly}>
            <div class="wf-step-tools">
              <button
                type="button"
                class="mx-btn icon"
                aria-label={copy.t("orchestra.workflows.plan.moveUp", { name: node.name })}
                title={copy.t("orchestra.workflows.plan.moveUp", { name: node.name })}
                disabled={index === 0 || isFinal(node.id)}
                onClick={() => moveAction(node.id, -1)}
              >
                <Ic name="up" />
              </button>
              <button
                type="button"
                class="mx-btn icon"
                aria-label={copy.t("orchestra.workflows.plan.moveDown", { name: node.name })}
                title={copy.t("orchestra.workflows.plan.moveDown", { name: node.name })}
                disabled={index === count - 1 || isFinal(rule()?.actions[index + 1])}
                onClick={() => moveAction(node.id, 1)}
              >
                <Ic name="down" />
              </button>
              <button
                type="button"
                class="mx-btn icon"
                aria-label={copy.t("orchestra.workflows.canvas.remove", { name: node.name })}
                title={copy.t("orchestra.workflows.canvas.remove", { name: node.name })}
                onClick={() => removeAction(node.id)}
              >
                <Ic name="trash" />
              </button>
            </div>
          </Show>
        </div>
        <Show when={opened()}>
          <div class="wf-step-body">{params(node)}</div>
        </Show>
      </article>
    )
  }

  return (
    <div class="wf-plan wf-rule" data-component="relay-rule">
      <Show when={props.banner}>
        <div class="wf-plan-banner">{props.banner}</div>
      </Show>
      <div class="wf-plan-list">
        <Show
          when={rule()}
          fallback={
            <div class="wf-plan-empty">
              <strong>{copy.t("orchestra.hooks.rule.noFitTitle")}</strong>
              <span>{copy.t("orchestra.hooks.rule.noFitBody")}</span>
              <button type="button" class="mx-btn primary" onClick={props.onCanvas}>
                <Ic name="workflows" />
                {copy.t("orchestra.hooks.rule.openCanvas")}
              </button>
            </div>
          }
        >
          {(current) => (
            <>
              <section class="wf-rule-part">
                <h3 class="wf-rule-label">{copy.t("orchestra.hooks.rule.when")}</h3>
                <Show
                  when={trigger()}
                  fallback={
                    <div class="wf-plan-picker">
                      <div class="wf-plan-picker-head">
                        <span>{copy.t("orchestra.hooks.rule.pickEvent")}</span>
                      </div>
                      <div class="wf-plan-kinds">
                        <For each={hookOperations(props.types)}>
                          {(item) => (
                            <button
                              type="button"
                              class="wf-pick"
                              disabled={props.readOnly}
                              onClick={() => setTrigger(item.operation, item.timing)}
                            >
                              <span class="wf-pick-tile k-start">
                                <NodeGlyph name={operationGlyph(item.operation)} />
                              </span>
                              <span>
                                <strong>{triggerName(copy, item.operation, item.timing, props.types)}</strong>
                                <small>
                                  {copy.t(
                                    item.timing === "after"
                                      ? "orchestra.hooks.typeDesc.after"
                                      : "orchestra.hooks.typeDesc.before",
                                  )}
                                </small>
                              </span>
                            </button>
                          )}
                        </For>
                      </div>
                    </div>
                  }
                >
                  {(node) => <div class="wf-rule-box">{params(node())}</div>}
                </Show>
              </section>
              <Show when={trigger()}>
                <section class="wf-rule-part">
                  <h3 class="wf-rule-label">
                    {copy.t("orchestra.hooks.rule.if")}
                    <small>
                      {copy.t(current().cases.length ? "orchestra.hooks.rule.ifAny" : "orchestra.hooks.rule.always")}
                    </small>
                  </h3>
                  <For each={current().cases}>
                    {(conditions, row) => (
                      <>
                        <Show when={row() > 0}>
                          <div class="wf-rule-or">{copy.t("orchestra.hooks.rule.or")}</div>
                        </Show>
                        <div class="wf-rule-case">
                          <For each={conditions}>
                            {(id, column) => (
                              <Show when={nodeOf(props.flow, id)}>
                                {(node) => (
                                  <>
                                    <Show when={column() > 0}>
                                      <div class="wf-rule-and">{copy.t("orchestra.hooks.rule.and")}</div>
                                    </Show>
                                    {conditionRow(node())}
                                  </>
                                )}
                              </Show>
                            )}
                          </For>
                          <Show when={!props.readOnly}>
                            <button
                              type="button"
                              class="wf-rule-more"
                              onClick={() =>
                                condition((rule, id) => ({
                                  ...rule,
                                  cases: rule.cases.map((item, index) => (index === row() ? [...item, id] : item)),
                                }))
                              }
                            >
                              <Ic name="plus" />
                              {copy.t("orchestra.hooks.rule.addAnd")}
                            </button>
                          </Show>
                        </div>
                      </>
                    )}
                  </For>
                  <Show when={!props.readOnly}>
                    <button
                      type="button"
                      class="wf-rule-more"
                      onClick={() => condition((rule, id) => ({ ...rule, cases: [...rule.cases, [id]] }))}
                    >
                      <Ic name="plus" />
                      {copy.t(
                        current().cases.length ? "orchestra.hooks.rule.addCase" : "orchestra.hooks.rule.addCondition",
                      )}
                    </button>
                  </Show>
                </section>
                <section class="wf-rule-part">
                  <h3 class="wf-rule-label">{copy.t("orchestra.hooks.rule.then")}</h3>
                  <Show when={!current().actions.length}>
                    <p class="wf-rule-hint">{copy.t("orchestra.hooks.rule.noActions")}</p>
                  </Show>
                  <For each={current().actions}>
                    {(id, index) => (
                      <Show when={nodeOf(props.flow, id)}>
                        {(node) => actionCard(node(), index(), current().actions.length)}
                      </Show>
                    )}
                  </For>
                  <Show when={!props.readOnly}>
                    <Show
                      when={state.picker}
                      fallback={
                        <div class="wf-plan-gap last">
                          <button type="button" class="wf-plan-plus" onClick={() => setState("picker", true)}>
                            <Ic name="plus" />
                            <span>{copy.t("orchestra.hooks.rule.addAction")}</span>
                          </button>
                        </div>
                      }
                    >
                      <div class="wf-plan-picker" role="group" aria-label={copy.t("orchestra.hooks.rule.pickAction")}>
                        <div class="wf-plan-picker-head">
                          <span>{copy.t("orchestra.hooks.rule.pickAction")}</span>
                          <button type="button" class="mx-btn" onClick={() => setState("picker", false)}>
                            {copy.t("orchestra.workflows.plan.cancel")}
                          </button>
                        </div>
                        <div class="wf-plan-kinds">
                          <For each={offered()}>
                            {(entry, index) => (
                              <button
                                type="button"
                                class="wf-pick"
                                ref={(element) => index() === 0 && queueMicrotask(() => element.focus())}
                                onClick={() => action(entry.key, entry.type)}
                                onKeyDown={(event) =>
                                  event.key === "Escape" && (event.stopPropagation(), setState("picker", false))
                                }
                              >
                                <span class={`wf-pick-tile k-${entry.tone}`}>
                                  <NodeGlyph name={entry.glyph} />
                                </span>
                                <span>
                                  <strong>{copy.t(`orchestra.hooks.type.${entry.key}`)}</strong>
                                  <small>{copy.t(`orchestra.hooks.typeDesc.${entry.key}`)}</small>
                                </span>
                              </button>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </Show>
                </section>
              </Show>
            </>
          )}
        </Show>
      </div>
      <footer class="wf-plan-foot">{props.save}</footer>
    </div>
  )
}
