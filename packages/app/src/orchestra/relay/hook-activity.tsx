import { createSignal, For, Show } from "solid-js"
import { operationGlyph } from "./catalog"
import type { RelayDecision, RelayNodeType } from "./client"
import { triggerName } from "./details-hook"
import { type Flow, nodeOf, type Outputs, TRIGGER, walkHook } from "./graph"
import { NodeGlyph, RelayDialog, useRelayCopy } from "./ui"

// Every event the installed hooks handled, newest first. Rows come only from recorded decisions.
export function ActivityRows(props: {
  decisions: (RelayDecision & { hook?: string })[]
  hookName?: (installID: string) => string | undefined
  onOpen?: (installID: string) => void
}) {
  const copy = useRelayCopy()
  const ordered = () => props.decisions.toSorted((a, b) => (b.at ?? 0) - (a.at ?? 0))
  const tone = (outcome: string) =>
    /block|deny|fail|repair/i.test(outcome)
      ? "bad"
      : /ask|approv|pending/i.test(outcome)
        ? "warm"
        : /allow|pass|record|remind/i.test(outcome)
          ? "good"
          : ""
  return (
    <>
      <div class="wf-lhead" aria-hidden="true">
        <span />
        <span>{copy.t("orchestra.hooks.head.event")}</span>
        <span>{copy.t("orchestra.hooks.head.result")}</span>
        <span>{copy.t("orchestra.hooks.head.when")}</span>
        <span />
      </div>
      <div class="mx-table" role="list" aria-label={copy.t("orchestra.hooks.tab.activity")}>
        <For each={ordered()}>
          {(decision) => (
            <div class="mx-row wf-lrow static" role="listitem" data-decision={decision.decisionID}>
              <span class="mx-mark wf-mark-glyph">
                <NodeGlyph name={operationGlyph(decision.trigger.replace(/^(before|after)[.:-]?/, ""))} />
              </span>
              <div class="mx-grow">
                <strong style={{ font: "11.5px var(--mx-mono)" }}>{decision.subject || decision.tool}</strong>
                <small>
                  {[decision.trigger, decision.tool, props.hookName?.(decision.installID)].filter(Boolean).join(" · ")}
                </small>
              </div>
              <div>
                <span class={`mx-badge ${tone(decision.outcome)}`}>{decision.outcome}</span>
              </div>
              <div class="wf-state">
                <span>
                  {copy.clock(decision.at)}
                  <Show when={decision.at !== undefined}>
                    <small> · {copy.when(decision.at)}</small>
                  </Show>
                  <small style={{ display: "block", "margin-top": "2px" }}>{decision.sessionID ?? ""}</small>
                </span>
              </div>
              <div class="wf-actions">
                <Show when={props.onOpen}>
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.hooks.activity.open")}
                    onClick={() => props.onOpen?.(decision.installID)}
                  >
                    <svg class="wf-ic" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="m6.5 3.5 4.5 4.5-4.5 4.5" />
                    </svg>
                  </button>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </>
  )
}

export function HookActivity(props: {
  decisions: RelayDecision[]
  loading: boolean
  installed: boolean
  flow: Flow
  profile: string
}) {
  const copy = useRelayCopy()
  return (
    <div class="mx-page">
      <div class="mx-inner" style={{ "padding-top": "28px" }}>
        <Show
          when={props.decisions.length}
          fallback={
            <div class="mx-empty wf-empty">
              <strong>
                {copy.t(props.loading ? "orchestra.hooks.activity.loading" : "orchestra.hooks.activity.empty")}
              </strong>
              {copy.t(
                props.installed ? "orchestra.hooks.activity.emptyInstalled" : "orchestra.hooks.activity.emptyOff",
              )}
            </div>
          }
        >
          <ActivityRows decisions={props.decisions} />
        </Show>
        <p class="mx-note">{copy.t("orchestra.hooks.activity.note", { profile: props.profile })}</p>
      </div>
    </div>
  )
}

// Walks the hook with a sample value. Nothing is blocked, installed or executed.
export function TestDialog(props: {
  flow: Flow
  outputs: Outputs
  types: RelayNodeType[] | undefined
  onClose: () => void
  onResult: (result: { path: string[]; result: string; label: string }) => void
}) {
  const copy = useRelayCopy()
  const trigger = () => props.flow.nodes.find((node) => node.type === TRIGGER)
  const field = () => (trigger()?.parameters.operation === "command" ? "command" : "path")
  const [value, setValue] = createSignal(field() === "command" ? "git push origin dev" : "src/generated/client.ts")
  const run = () => {
    const walked = walkHook(props.flow, value(), props.outputs)
    const result = walked.result
      ? (nodeOf(props.flow, walked.result.id)?.name ?? "")
      : copy.t("orchestra.hooks.testDialog.noAction")
    props.onResult({ path: walked.path, result, label: value() })
  }
  return (
    <RelayDialog
      title={copy.t("orchestra.hooks.testDialog.title")}
      description={copy.t("orchestra.hooks.testDialog.description")}
      onClose={props.onClose}
      onSubmit={run}
      foot={
        <>
          <button type="button" class="mx-btn" onClick={props.onClose}>
            {copy.t("orchestra.workflows.dialog.cancel")}
          </button>
          <button type="submit" class="mx-btn primary" disabled={!trigger()}>
            {copy.t("orchestra.hooks.testDialog.run")}
          </button>
        </>
      }
    >
      <Show when={trigger()} fallback={<p class="mx-error">{copy.t("orchestra.hooks.testDialog.noTrigger")}</p>}>
        {(node) => (
          <>
            <dl class="wf-kv" style={{ "margin-bottom": "16px" }}>
              <dt>{copy.t("orchestra.hooks.details.event")}</dt>
              <dd>
                {triggerName(
                  copy,
                  String(node().parameters.operation ?? "edit"),
                  String(node().parameters.timing ?? "before"),
                  props.types,
                )}
              </dd>
            </dl>
            <label class="mx-field">
              <span>
                {copy.t(field() === "command" ? "orchestra.hooks.field.command" : "orchestra.hooks.field.path")}
              </span>
              <input
                value={value()}
                style={{ "font-family": "var(--mx-mono)" }}
                onInput={(event) => setValue(event.currentTarget.value)}
              />
            </label>
          </>
        )}
      </Show>
    </RelayDialog>
  )
}
