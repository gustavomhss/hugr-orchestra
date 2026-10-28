import { For, type JSX, Show } from "solid-js"
import type { RelayRun } from "./runs"
import { workflowKey } from "./catalog"
import { Empty, NodeDetails, Rows, Switchable } from "./details"
import { Params } from "./details-params"
import { badgeTone, runHandle, span, STEP_TONE } from "./format"
import { chain, checkCount, type Flow, type FlowNode, HUMAN, listedSteps, nodeOf, phaseOf, retryBudget, START, steps } from "./graph"
import { phaseNames } from "./parts"
import { Ic, useRelayCopy } from "./ui"
import type { SkillSource } from "../chapters/skills-data"

// The skill catalog as the editor has it: `names` is every skill a step can resolve and `choices` the ones the picker
// offers, in Skills page order; both are undefined until it has loaded, and `error` says it could not.
export type Skills = {
  names: string[] | undefined
  choices: { name: string; description?: string; source: SkillSource }[] | undefined
  error: boolean
  retry: () => void
}

export type Props = {
  flow: Flow
  node: FlowNode
  run: RelayRun | undefined
  frozen: Flow | undefined
  issues: string[]
  skills: Skills
  // The MCP servers the project configures, for a step to choose from; undefined until loaded.
  servers: string[] | undefined
  focusPhase?: string
  // The workflow's own description, edited on its Start step.
  description: string
  save: JSX.Element
  readOnly?: boolean
  // Shown inside a plan card instead of the details dialog: no column heading, no autofocus.
  inline?: boolean
  // The project folder: context files are picked inside it and kept relative to it.
  directory?: string
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
                listedSteps(props.flow).length,
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
            listedSteps(props.flow)[0]?.name ?? copy.t("orchestra.workflows.details.none"),
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
