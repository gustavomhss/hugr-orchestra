import { createSignal, For, Show } from "solid-js"
import { operationGlyph } from "./catalog"
import { decisionTime, type RelayDecision, type RelayNodeType } from "./client"
import { outcomeTone, triggerName } from "./details-hook"
import { type Flow, type HookProbe, TRIGGER, walkHook } from "./graph"
import { NodeGlyph, RelayDialog, useRelayCopy } from "./ui"

// Every event the installed hooks handled, newest first. Rows come only from recorded decisions.
// A command's subject is the sha256 of the command, never its text; the row says so instead of showing a hash.
export function ActivityRows(props: {
  decisions: RelayDecision[]
  hookName?: (installID: string) => string | undefined
  onOpen?: (installID: string) => void
}) {
  const copy = useRelayCopy()
  const ordered = () => props.decisions.toSorted((a, b) => b.ts - a.ts || b.seq - a.seq)
  const operation = (trigger: string) => trigger.split(".")[0] ?? trigger
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
            <div class="mx-row wf-lrow static" role="listitem" data-decision={decision.decision}>
              <span class="mx-mark wf-mark-glyph">
                <NodeGlyph name={operationGlyph(operation(decision.trigger))} />
              </span>
              <div class="mx-grow">
                <strong style={{ font: "11.5px var(--mx-mono)" }}>
                  {operation(decision.trigger) === "command"
                    ? copy.t("orchestra.hooks.activity.commandHash", { hash: decision.subject.slice(0, 12) })
                    : decision.subject || decision.tool || decision.trigger}
                </strong>
                <small>
                  {[decision.trigger, decision.tool, props.hookName?.(decision.install)].filter(Boolean).join(" · ")}
                </small>
              </div>
              <div>
                <span class={`mx-badge ${outcomeTone(decision.outcome)}`}>
                  {copy.t(`orchestra.hooks.outcome.${decision.outcome}`)}
                </span>
              </div>
              <div class="wf-state">
                <span>
                  {copy.clock(decisionTime(decision))}
                  <small> · {copy.when(decisionTime(decision))}</small>
                  <small style={{ display: "block", "margin-top": "2px" }}>{decision.session}</small>
                </span>
              </div>
              <div class="wf-actions">
                <Show when={props.onOpen}>
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.hooks.activity.open")}
                    onClick={() => props.onOpen?.(decision.install)}
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

// The value a trigger's conditions read: a path for file operations, the command text, a tool ID, or nothing for
// session events (whose path, command and tool conditions take No).
type Subject = "path" | "command" | "tool" | undefined
const subjectOf = (operation: string): Subject => {
  if (operation === "read" || operation === "edit" || operation === "write") return "path"
  if (operation === "command") return "command"
  if (operation === "tool") return "tool"
}
const SAMPLE = { path: "src/generated/client.ts", command: "git push origin dev", tool: "bash" }

// Walks the hook with a sample event. Nothing is blocked, installed or executed.
export function TestDialog(props: {
  flow: Flow
  types: RelayNodeType[] | undefined
  onClose: () => void
  onResult: (result: { path: string[]; result: string; label: string }) => void
}) {
  const copy = useRelayCopy()
  const trigger = () => props.flow.nodes.find((node) => node.type === TRIGGER)
  const operation = () => String(trigger()?.parameters.operation ?? "edit")
  const timing = () => String(trigger()?.parameters.timing ?? "before")
  const subject = () => subjectOf(operation())
  const [value, setValue] = createSignal(subject() ? SAMPLE[subject()!] : "")
  const run = () => {
    const current = subject()
    const probe: HookProbe = { operation: operation(), timing: timing(), ...(current ? { [current]: value() } : {}) }
    const walked = walkHook(props.flow, probe)
    const result = walked.actions.length
      ? walked.actions.map((node) => node.name).join(" → ")
      : copy.t("orchestra.hooks.testDialog.noAction")
    props.onResult({ path: walked.path, result, label: current ? value() : triggerName(copy, operation(), timing()) })
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
        <dl class="wf-kv" style={{ "margin-bottom": "16px" }}>
          <dt>{copy.t("orchestra.hooks.details.event")}</dt>
          <dd>{triggerName(copy, operation(), timing(), props.types)}</dd>
        </dl>
        <Show
          when={subject()}
          fallback={
            <p class="mx-note" style={{ margin: "0" }}>
              {copy.t("orchestra.hooks.testDialog.noSubject")}
            </p>
          }
        >
          {(current) => (
            <label class="mx-field">
              <span>{copy.t(`orchestra.hooks.field.${current()}`)}</span>
              <input
                value={value()}
                style={{ "font-family": "var(--mx-mono)" }}
                onInput={(event) => setValue(event.currentTarget.value)}
              />
            </label>
          )}
        </Show>
      </Show>
    </RelayDialog>
  )
}
