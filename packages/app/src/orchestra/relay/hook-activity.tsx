import { useNavigate } from "@solidjs/router"
import { createMemo, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { useLayout } from "@/context/layout"
import { sessionHref } from "@/utils/session-route"
import { operationGlyph } from "./catalog"
import { decisionTime, type RelayDecision, type RelayNodeType } from "./client"
import { outcomeTone, triggerName } from "./details-hook"
import { type Flow, type HookProbe, TRIGGER, walkHook } from "./graph"
import { NodeGlyph, RelayDialog, useRelayCopy } from "./ui"

// The subject of a command or a prompt is its sha256, never its text.
const HASH = /^[0-9a-f]{64}$/

// Every event the installed hooks handled, newest first. Rows come only from recorded decisions. "Allowed" only says
// that nothing restrictive fired, so those rows stay hidden until asked for.
export function ActivityRows(props: {
  decisions: RelayDecision[]
  hookName?: (installID: string) => string | undefined
  onOpen?: (installID: string) => void
}) {
  const copy = useRelayCopy()
  const layout = useLayout()
  const navigate = useNavigate()
  const [filter, setFilter] = createStore({ hook: "", outcome: "", allowed: false })
  const operation = (trigger: string) => trigger.split(".")[0] ?? trigger
  const timing = (trigger: string) => trigger.split(".")[1] ?? "before"
  const hooks = createMemo(() => [...new Set(props.decisions.map((decision) => decision.install))])
  const ofHook = createMemo(() =>
    props.decisions.filter((decision) => !filter.hook || decision.install === filter.hook),
  )
  const allowed = () => ofHook().filter((decision) => decision.outcome === "allowed").length
  const listed = createMemo(() => ofHook().filter((decision) => filter.allowed || decision.outcome !== "allowed"))
  const outcomes = () => [...new Set(listed().map((decision) => decision.outcome))].toSorted()
  const shown = createMemo(() =>
    listed()
      .filter((decision) => !filter.outcome || decision.outcome === filter.outcome)
      .toSorted((a, b) => b.ts - a.ts || b.seq - a.seq),
  )
  const title = (decision: RelayDecision) => {
    const event = operation(decision.trigger)
    if (HASH.test(decision.subject) && event === "prompt") return copy.t("orchestra.hooks.activity.promptHidden")
    if (HASH.test(decision.subject) && (event === "command" || event === "tool"))
      return copy.t("orchestra.hooks.activity.commandHidden")
    return (
      decision.subject.replaceAll("\n", ", ") || decision.tool || triggerName(copy, event, timing(decision.trigger))
    )
  }
  // The chapter belongs to the selected server, so its sessions open there.
  const openSession = (sessionID: string) => navigate(sessionHref(layout.home.selection().server, sessionID))
  return (
    <>
      <div class="mx-toolbar" style={{ "flex-wrap": "wrap" }}>
        <Show when={props.hookName && hooks().length > 1}>
          <div class="mx-field" style={{ margin: "0", "min-inline-size": "180px" }}>
            <select
              aria-label={copy.t("orchestra.hooks.activity.hookFilter")}
              value={filter.hook}
              onChange={(event) => setFilter({ hook: event.currentTarget.value, outcome: "" })}
            >
              <option value="">{copy.t("orchestra.hooks.activity.allHooks")}</option>
              <For each={hooks()}>
                {(install) => (
                  <option value={install}>
                    {props.hookName?.(install) ?? copy.t("orchestra.hooks.activity.unnamedHook")}
                  </option>
                )}
              </For>
            </select>
          </div>
        </Show>
        <div class="wf-range" role="group" aria-label={copy.t("orchestra.hooks.activity.outcomeFilter")}>
          <button type="button" aria-pressed={!filter.outcome} onClick={() => setFilter("outcome", "")}>
            {copy.t("orchestra.hooks.activity.all")}
            <span class="wf-count">{listed().length}</span>
          </button>
          <For each={outcomes()}>
            {(outcome) => (
              <button
                type="button"
                aria-pressed={filter.outcome === outcome}
                onClick={() => setFilter("outcome", outcome)}
              >
                {copy.t(`orchestra.hooks.outcome.${outcome}`)}
                <span class="wf-count">{listed().filter((decision) => decision.outcome === outcome).length}</span>
              </button>
            )}
          </For>
        </div>
        <Show when={allowed()}>
          <button
            type="button"
            class="mx-link"
            aria-pressed={filter.allowed}
            onClick={() => setFilter({ allowed: !filter.allowed, outcome: "" })}
          >
            {filter.allowed
              ? copy.t("orchestra.hooks.activity.hideAllowed")
              : copy.t("orchestra.hooks.activity.showAllowed", { count: allowed() })}
          </button>
        </Show>
      </div>
      <Show when={shown().length} fallback={<p class="mx-empty">{copy.t("orchestra.hooks.activity.noMatches")}</p>}>
        <div class="wf-lhead" aria-hidden="true">
          <span />
          <span>{copy.t("orchestra.hooks.head.event")}</span>
          <span>{copy.t("orchestra.hooks.head.result")}</span>
          <span>{copy.t("orchestra.hooks.head.when")}</span>
          <span />
        </div>
        <div class="mx-table" role="list" aria-label={copy.t("orchestra.hooks.tab.activity")}>
          <For each={shown()}>
            {(decision) => (
              <div class="mx-row wf-lrow static" role="listitem" data-decision={decision.decision}>
                <span class="mx-mark wf-mark-glyph">
                  <NodeGlyph name={operationGlyph(operation(decision.trigger))} />
                </span>
                <div class="mx-grow">
                  <strong style={{ font: "11.5px var(--mx-mono)" }}>{title(decision)}</strong>
                  <small>
                    {[
                      triggerName(copy, operation(decision.trigger), timing(decision.trigger)),
                      decision.tool,
                      props.hookName?.(decision.install),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
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
                    <button
                      type="button"
                      class="mx-link"
                      style={{ display: "block", "margin-top": "2px" }}
                      title={decision.session}
                      onClick={() => openSession(decision.session)}
                    >
                      {copy.t("orchestra.hooks.activity.openSession")}
                    </button>
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
      </Show>
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

// A sample call per concrete operation, as the runtime reports it: the tool ID, and the path or command it carries.
// Session events carry none of these, so their conditions on path, command and tool take No.
const SAMPLE_TOOL: Record<string, string> = {
  read: "read",
  edit: "edit",
  write: "write",
  command: "bash",
  tool: "webfetch",
}
const SAMPLE = { path: "src/generated/client.ts", command: "git push origin dev" }
const CALLS = ["read", "edit", "write", "command", "tool"] as const

// Walks this draft with a sample call. Nothing is blocked, installed or executed.
export function TestDialog(props: {
  flow: Flow
  types: RelayNodeType[] | undefined
  onClose: () => void
  onResult: (result: { path: string[]; result: string; label: string }) => void
}) {
  const copy = useRelayCopy()
  const trigger = () => props.flow.nodes.find((node) => node.type === TRIGGER)
  const event = () => String(trigger()?.parameters.operation ?? "edit")
  const timing = () => String(trigger()?.parameters.timing ?? "before")
  // A tool trigger fires on one concrete call; for "Any tool" the test picks which.
  const toolCall = () => SAMPLE_TOOL[event()] !== undefined
  const first = event() === "tool" ? "edit" : event()
  const [sample, setSample] = createStore({
    operation: first,
    tool: SAMPLE_TOOL[first] ?? "",
    path: SAMPLE.path,
    command: SAMPLE.command,
    invalid: false,
  })
  const file = () => sample.operation === "read" || sample.operation === "edit" || sample.operation === "write"
  const run = () => {
    const probe: HookProbe = {
      operation: sample.operation,
      timing: timing(),
      ...(toolCall() ? { tool: sample.tool } : {}),
      ...(file() ? { path: sample.path } : {}),
      ...(sample.operation === "command" ? { command: sample.command } : {}),
    }
    const walked = walk(props.flow, probe)
    if (!walked) return setSample("invalid", true)
    const result = walked.actions.length
      ? walked.actions.map((node) => node.name).join(" → ")
      : copy.t("orchestra.hooks.testDialog.noAction")
    const label = file()
      ? sample.path
      : sample.operation === "command"
        ? sample.command
        : toolCall()
          ? sample.tool
          : triggerName(copy, event(), timing())
    props.onResult({ path: walked.path, result, label })
  }
  const field = (key: "tool" | "path" | "command") => (
    <label class="mx-field">
      <span>{copy.t(`orchestra.hooks.field.${key}`)}</span>
      <input
        value={sample[key]}
        style={{ "font-family": "var(--mx-mono)" }}
        onInput={(input) => setSample(key, input.currentTarget.value)}
      />
    </label>
  )
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
          <dd>{triggerName(copy, event(), timing(), props.types)}</dd>
        </dl>
        <Show
          when={toolCall()}
          fallback={
            <p class="mx-note" style={{ margin: "0" }}>
              {copy.t("orchestra.hooks.testDialog.noSubject")}
            </p>
          }
        >
          <Show when={event() === "tool"}>
            <label class="mx-field">
              <span>{copy.t("orchestra.hooks.testDialog.call")}</span>
              <select
                value={sample.operation}
                onChange={(input) =>
                  setSample({
                    operation: input.currentTarget.value,
                    tool: SAMPLE_TOOL[input.currentTarget.value] ?? "",
                  })
                }
              >
                <For each={CALLS}>
                  {(call) => <option value={call}>{copy.t(`orchestra.hooks.testDialog.call.${call}`)}</option>}
                </For>
              </select>
            </label>
          </Show>
          {field("tool")}
          <Show when={file()}>{field("path")}</Show>
          <Show when={sample.operation === "command"}>{field("command")}</Show>
        </Show>
        <Show when={sample.invalid}>
          <p class="mx-error" role="alert">
            {copy.t("orchestra.hooks.testDialog.invalid")}
          </p>
        </Show>
      </Show>
    </RelayDialog>
  )
}

// The runtime matcher never throws; should a pattern ever make the walk throw, the dialog says so instead of
// silently staying open.
function walk(flow: Flow, probe: HookProbe) {
  try {
    return walkHook(flow, probe)
  } catch {
    return undefined
  }
}
