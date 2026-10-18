import { createEffect, createSignal, createUniqueId, For, Index, type JSX, on, Show } from "solid-js"
import { createStore } from "solid-js/store"
import type { RelayRun } from "./runs"
import { workflowKey } from "./catalog"
import { CheckList } from "./checks"
import { Empty, NodeDetails, NodeNameField, pasteOneLine, Rows, Switchable } from "./details"
import { badgeTone, runHandle, span, STEP_TONE } from "./format"
import {
  chain,
  checkCount,
  checkID,
  type Flow,
  type FlowNode,
  type FlowPhase,
  HUMAN,
  INJECT,
  issueNode,
  issues,
  nodeOf,
  phaseChoices,
  phaseOf,
  readChecklist,
  retryBudget,
  setPhase,
  START,
  steps,
  updateNode,
  updatePhase,
  writeChecklist,
} from "./graph"
import { issueText, phaseNames } from "./parts"
import { Ic, useRelayCopy } from "./ui"

// The skill catalog as the editor has it: `names` is undefined until it has loaded, and `error` says it could not.
export type Skills = { names: string[] | undefined; error: boolean; retry: () => void }

type Props = {
  flow: Flow
  node: FlowNode
  run: RelayRun | undefined
  frozen: Flow | undefined
  issues: string[]
  skills: Skills
  focusPhase?: string
  // The workflow's own description, edited on its Start step.
  description: string
  save: JSX.Element
  readOnly?: boolean
  onChange: (flow: Flow) => void
  onDescribe: (description: string) => void
  onNav: (id: string) => void
  onClose: () => void
  onReview: (run: RelayRun) => void
}

export function WorkflowDetails(props: Props) {
  const copy = useRelayCopy()
  const order = () => chain(props.flow)
  const index = () => order().findIndex((node) => node.id === props.node.id)
  // Kept out of the JSX: a condition inside a prop compiles to a memo, and NodeDetails reads `next` in its click
  // handler, where that memo has no owner, outlives the layer and throws a stale read when the layer closes.
  const next = () => (index() >= 0 ? order()[index() + 1] : undefined)
  // Per-node run columns stay hidden: the run routes serve only external runs, which have no document to open.
  // The compile summary of Start sits under its parameters instead.
  const summary = () =>
    props.node.type === START ? (
      <StartOutput {...props} title={copy.t("orchestra.workflows.details.summary")} />
    ) : undefined
  const kindLabel = () => {
    if (props.node.type === START) return copy.t("orchestra.workflows.details.startKind")
    // A human step is no longer offered, but documents made before may still hold one.
    const key = workflowKey(props.node.type) ?? (props.node.type === HUMAN ? "human" : undefined)
    const label = key ? copy.t(`orchestra.workflows.type.${key}`) : props.node.type
    const phase = phaseOf(props.flow, props.node.id)
    return [label, phase ? copy.t("orchestra.workflows.details.phase", { phase: phase.name }) : undefined]
      .filter(Boolean)
      .join(" · ")
  }
  return (
    <NodeDetails
      node={props.node}
      kind={kindLabel()}
      previous={order()[index() - 1]}
      next={next()}
      runs={false}
      input={<Input {...props} />}
      params={<Params {...props} />}
      output={<Output {...props} />}
      summary={summary()}
      save={props.save}
      readOnly={props.readOnly}
      onNav={props.onNav}
      onClose={props.onClose}
    />
  )
}

function stepOf(props: Props) {
  return props.run?.steps.find((step) => step.wp === props.node.id)
}

function Input(props: Props) {
  const copy = useRelayCopy()
  const step = () => stepOf(props)
  const previous = () => {
    const order = chain(props.flow)
    return order[order.findIndex((node) => node.id === props.node.id) - 1]
  }
  const sent = () => {
    const frozen = props.frozen
    const node = frozen ? nodeOf(frozen, props.node.id) : undefined
    if (!frozen || !node) return
    const protocol = phaseOf(frozen, node.id)?.description ?? ""
    const instructions = String(node.parameters.instructions ?? "")
    return [protocol.split("\n").slice(0, 8).join("\n"), instructions].filter(Boolean).join("\n…\n\n")
  }
  return (
    <Show when={props.run} fallback={<NoRun start={props.node.type === START} />}>
      {(run) => (
        <Show
          when={props.node.type !== START}
          fallback={
            <Switchable
              title={copy.t("orchestra.workflows.details.inputRun", { id: runHandle(run().runID) })}
              json={{
                runID: run().runID,
                label: run().label,
                baseRef: run().baseRef,
                agent: run().agent,
                version: run().version,
              }}
            >
              <Rows
                rows={[
                  [copy.t("orchestra.workflows.details.workPackage"), run().label],
                  [copy.t("orchestra.workflows.details.baseRef"), run().baseRef],
                  [copy.t("orchestra.workflows.details.runner"), run().agent],
                  [
                    copy.t("orchestra.workflows.details.version"),
                    run().version !== undefined ? `v${run().version}` : undefined,
                  ],
                ]}
              />
            </Switchable>
          }
        >
          <Show
            when={step() && step()!.status !== "pending"}
            fallback={
              <>
                <div class="wf-col-head">
                  <h3>{copy.t("orchestra.workflows.details.inputRun", { id: runHandle(run().runID) })}</h3>
                </div>
                <Empty>{copy.t("orchestra.workflows.details.notReached", { id: runHandle(run().runID) })}</Empty>
              </>
            }
          >
            <Switchable
              title={copy.t("orchestra.workflows.details.inputRun", { id: runHandle(run().runID) })}
              json={{
                wp: props.node.id,
                macro: phaseOf(props.flow, props.node.id)?.id ?? null,
                attempt: step()!.attempts,
                retry_budget: retryBudget(props.flow),
                base_ref: run().baseRef ?? null,
                previous: previous()?.id ?? null,
              }}
            >
              <Rows
                rows={[
                  [copy.t("orchestra.workflows.details.workPackage"), run().label],
                  [
                    copy.t("orchestra.workflows.details.attempt"),
                    copy.t("orchestra.workflows.details.attemptOf", {
                      attempt: Math.max(1, step()!.attempts),
                      total: retryBudget(props.flow) + 1,
                    }),
                  ],
                  [
                    copy.t("orchestra.workflows.details.previous.label"),
                    previous() && previous()!.type !== START
                      ? copy.t("orchestra.workflows.details.advanced", { name: previous()!.name })
                      : copy.t("orchestra.workflows.type.start"),
                  ],
                  [copy.t("orchestra.workflows.details.baseRef"), run().baseRef],
                ]}
              />
              <Show when={sent()}>
                <div class="wf-col-head" style={{ "margin-top": "18px" }}>
                  <h3>{copy.t("orchestra.workflows.details.sent")}</h3>
                </div>
                <pre class="mx-log" style={{ margin: "0", "max-height": "260px", overflow: "auto" }}>
                  {sent()}
                </pre>
              </Show>
            </Switchable>
          </Show>
        </Show>
      )}
    </Show>
  )
}

function NoRun(props: { start: boolean }) {
  const copy = useRelayCopy()
  return (
    <>
      <div class="wf-col-head">
        <h3>{copy.t("orchestra.workflows.details.input")}</h3>
      </div>
      <Empty>
        {copy.t(props.start ? "orchestra.workflows.details.noRunStart" : "orchestra.workflows.details.noRun")}
      </Empty>
    </>
  )
}

function Output(props: Props) {
  const copy = useRelayCopy()
  const step = () => stepOf(props)
  return (
    <Show when={props.node.type !== START} fallback={<StartOutput {...props} />}>
      <Show
        when={props.run && step() && step()!.status !== "pending" ? { run: props.run, step: step()! } : undefined}
        fallback={
          <>
            <div class="wf-col-head">
              <h3>{copy.t("orchestra.workflows.details.output")}</h3>
            </div>
            <Empty>{copy.t("orchestra.workflows.details.noOutput")}</Empty>
          </>
        }
      >
        {(current) => (
          <Show
            when={current().step.status !== "running"}
            fallback={
              <>
                <div class="wf-col-head">
                  <h3>{copy.t("orchestra.workflows.details.outputRun", { id: runHandle(current().run.runID) })}</h3>
                </div>
                <Empty>
                  <span class="wf-dot run" />{" "}
                  {copy.t("orchestra.workflows.details.running", { attempt: Math.max(1, current().step.attempts) })}
                </Empty>
              </>
            }
          >
            <Switchable
              title={copy.t("orchestra.workflows.details.outputRun", { id: runHandle(current().run.runID) })}
              json={{
                wp: props.node.id,
                status: current().step.status,
                attempts: current().step.attempts,
                checks: current().step.checks,
              }}
            >
              <div class="wf-out-head">
                <span class={`mx-badge ${badgeTone(STEP_TONE[current().step.status])}`}>
                  {copy.t(`orchestra.workflows.outcome.${current().step.status}`)}
                </span>
                <span class="mx-meta">
                  {[
                    copy.t("orchestra.workflows.details.checksPassed", {
                      passed: current().step.checks.filter((check) => check.verdict === "pass").length,
                      total: current().step.checks.length,
                    }),
                    span(current().step.startedAt, current().step.endedAt, Date.now()),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </div>
              <Show when={current().step.status === "escalated"}>
                <div class="wf-alert warm">
                  <Ic name="wait" />
                  <span>
                    {copy.t("orchestra.workflows.details.escalated", {
                      attempt: current().step.attempts,
                      budget: retryBudget(props.flow),
                      id: runHandle(current().run.runID),
                    })}{" "}
                    <button type="button" class="mx-link" onClick={() => props.onReview(current().run)}>
                      {copy.t("orchestra.workflows.details.reviewRun")}
                    </button>
                  </span>
                </div>
              </Show>
              <Show when={current().step.status === "failed" && current().run.reason}>
                <div class="wf-alert">
                  <Ic name="warn" />
                  <span>{current().run.reason}</span>
                </div>
              </Show>
              <Show
                when={current().step.checks.length}
                fallback={<Empty>{copy.t("orchestra.workflows.details.noChecks")}</Empty>}
              >
                <div class="wf-checks">
                  <For each={current().step.checks}>
                    {(check) => (
                      <div class="wf-check" classList={{ bad: check.verdict === "fail" }}>
                        <div class="wf-check-top">
                          {check.id}
                          <span
                            class={`mx-badge ${check.verdict === "pass" ? "good" : check.verdict === "fail" ? "bad" : ""}`}
                          >
                            {check.verdict}
                          </span>
                        </div>
                        <Show when={check.output}>
                          <pre>{check.output}</pre>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </Switchable>
          </Show>
        )}
      </Show>
    </Show>
  )
}

function StartOutput(props: Props & { title?: string }) {
  const copy = useRelayCopy()
  return (
    <Switchable
      title={props.title ?? copy.t("orchestra.workflows.details.output")}
      json={{
        brief: String(props.node.parameters.relayBrief ?? ""),
        retry_budget: retryBudget(props.flow),
        macros: props.flow.phases.map((phase) => phase.id),
        work_packages: steps(props.flow).map((node) => node.id),
      }}
    >
      <Rows
        rows={[
          [
            copy.t("orchestra.workflows.details.compiles"),
            [
              copy.count(
                phaseNames(props.flow).length,
                "orchestra.workflows.count.phase.one",
                "orchestra.workflows.count.phase.other",
              ),
              copy.count(
                steps(props.flow).length,
                "orchestra.workflows.count.step.one",
                "orchestra.workflows.count.step.other",
              ),
            ].join(" · "),
          ],
          [copy.t("orchestra.workflows.details.checks"), String(checkCount(props.flow))],
          [
            copy.t("orchestra.workflows.details.budget"),
            copy.t("orchestra.workflows.details.budgetValue", { count: retryBudget(props.flow) }),
          ],
          [
            copy.t("orchestra.workflows.details.firstStep"),
            steps(props.flow)[0]?.name ?? copy.t("orchestra.workflows.details.none"),
          ],
        ]}
      />
      <Show when={props.issues.length}>
        <div class="wf-alert" style={{ "margin-top": "14px" }}>
          <Ic name="warn" />
          <span>
            {copy.count(
              props.issues.length,
              "orchestra.workflows.issues.blockOne",
              "orchestra.workflows.issues.blockOther",
            )}{" "}
            {props.issues[0]}
          </span>
        </div>
      </Show>
    </Switchable>
  )
}

function Params(props: Props) {
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
  const skillOptions = () => [...new Set([...(props.skills.names ?? []), skill()].filter(Boolean))]
  const unchecked = () => ["relay.execute", "relay.review"].includes(props.node.type) && !checklist().controls.length
  return (
    <>
      <div class="wf-col-head">
        <h3>{copy.t("orchestra.workflows.details.params")}</h3>
      </div>
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
                <span class="mx-hint">{copy.t("orchestra.workflows.details.phaseMiddle", { phase: phase().name })}</span>
              )}
            </Show>
          </label>
        </div>
        <Show when={props.node.type === INJECT}>
          <label class="mx-field">
            <span>{copy.t("orchestra.workflows.details.context")}</span>
            <textarea
              style={{ "min-height": "120px" }}
              placeholder={copy.t("orchestra.workflows.details.contextHint")}
              value={String(props.node.parameters.text ?? "")}
              onInput={(event) => update({ text: event.currentTarget.value })}
            />
          </label>
          <label class="mx-field">
            <span>{copy.t("orchestra.workflows.details.contextFile")}</span>
            <input
              placeholder={copy.t("orchestra.workflows.details.contextFilePlaceholder")}
              value={String(props.node.parameters.file ?? "")}
              onInput={(event) => update({ file: event.currentTarget.value })}
            />
            <span class="mx-hint">{copy.t("orchestra.workflows.details.contextFileHint")}</span>
          </label>
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
          </label>
          <div class="mx-fields">
            <label class="mx-field">
              <span>{copy.t("orchestra.workflows.details.skill")}</span>
              <select value={skill()} onChange={(event) => update({ skill: event.currentTarget.value })}>
                <option value="">{copy.t("orchestra.workflows.details.noSkill")}</option>
                <For each={skillOptions()}>
                  {(name) => (
                    <option value={name}>
                      {skillGone() && name === skill()
                        ? copy.t("orchestra.workflows.details.skillMissing", { skill: name })
                        : name}
                    </option>
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
          newID={() => checkID(props.flow, props.node.id)}
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
          data-autofocus=""
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
      <div class="wf-field-row">
        <span>{copy.t("orchestra.workflows.details.protocols")}</span>
      </div>
      <Show when={props.flow.phases.length} fallback={<Empty>{copy.t("orchestra.workflows.details.noPhases")}</Empty>}>
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
    </>
  )
}

// Renames a phase as the user types; an empty or repeated name is shown as an error and never reaches the flow.
function PhaseNameField(props: { flow: Flow; phase: FlowPhase; onChange: (flow: Flow) => void }) {
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
