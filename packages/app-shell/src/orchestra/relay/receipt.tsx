import { skipToken, useQuery } from "@tanstack/solid-query"
import { createSignal, For, Show } from "solid-js"
import type { RelayDocument } from "./client"
import type { RelayRun, RelayRunStep } from "./runs"
import { createAction } from "./dialogs"
import { badgeTone, runHandle, span, STEP_TONE, type Tone } from "./format"
import { type Flow, nodeOf, phaseOf, readChecklist, retryBudget, steps } from "./graph"
import { RunBadge } from "./parts"
import type { RelaySource } from "./source"
import { Ic, Menu, useRelayCopy } from "./ui"

// One run's receipt: the decision first (waiting card or failure), then the phase strip, the per-step verdicts
// and the recorded audit. Execution and release stay with Maestro.
export function Receipt(props: {
  run: RelayRun
  document: RelayDocument
  flow: Flow
  source: RelaySource
  onOpenStep: (wp: string) => void
  onCanvas: () => void
  onSession: (sessionID: string) => void
}) {
  const copy = useRelayCopy()
  const [menu, setMenu] = createSignal<HTMLElement>()
  const ledger = createAction()
  const audit = useQuery(
    () => ({
      queryKey: props.source.key("audit", props.run.runID, props.run.status),
      queryFn: props.run.status === "running" ? skipToken : () => props.source.runClient.audit(props.run.runID),
      retry: false,
    }),
    props.source.queryClient,
  )
  const step = (wp: string) => props.run.steps.find((item) => item.wp === wp)
  const at = () => nodeOf(props.flow, props.run.position)
  const budget = () => retryBudget(props.flow)
  const sessionOf = (wp: string | undefined) =>
    (wp ? step(wp)?.sessionID : undefined) ?? props.run.steps.findLast((item) => item.sessionID)?.sessionID
  const order = () => steps(props.flow)
  const phases = () =>
    props.flow.phases
      .filter((phase) => phase.nodeIds.length)
      .toSorted(
        (a, b) =>
          order().findIndex((node) => node.id === a.nodeIds[0]) - order().findIndex((node) => node.id === b.nodeIds[0]),
      )
      .map((phase) => {
        const states = order()
          .filter((node) => phase.nodeIds.includes(node.id))
          .map((node) => step(node.id)?.status ?? "pending")
        const state: [Tone, Parameters<typeof copy.t>[0]] = states.includes("escalated")
          ? ["warm", "orchestra.workflows.phase.waiting"]
          : states.includes("failed")
            ? ["bad", "orchestra.workflows.phase.failed"]
            : states.includes("running")
              ? ["run", "orchestra.workflows.phase.running"]
              : states.length && states.every((value) => value === "passed")
                ? ["good", "orchestra.workflows.phase.passed"]
                : states.some((value) => value === "passed")
                  ? ["run", "orchestra.workflows.phase.progress"]
                  : ["", "orchestra.workflows.phase.pending"]
        return { phase, tone: state[0], label: copy.t(state[1]) }
      })
  const download = () =>
    ledger.run(async () => {
      const value = await props.source.runClient.ledger(props.run.runID)
      const blob = new Blob([typeof value === "string" ? value : JSON.stringify(value, null, 2)], {
        type: "application/json",
      })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `run-${runHandle(props.run.runID)}-ledger.json`
      link.click()
      URL.revokeObjectURL(link.href)
    })

  return (
    <div class="wf-receipt-inner" data-component="relay-receipt">
      <div class="wf-rhead">
        <div>
          <h2>
            {copy.t("orchestra.workflows.receipt.title", { id: runHandle(props.run.runID) })}
            <RunBadge run={props.run} />
          </h2>
          <p>
            {[
              props.run.label,
              props.run.version !== undefined ? `v${props.run.version}` : undefined,
              props.run.startedAt !== undefined
                ? copy.t("orchestra.workflows.receipt.started", {
                    time: copy.clock(props.run.startedAt),
                    ago: copy.when(props.run.startedAt),
                  })
                : undefined,
              span(props.run.startedAt, props.run.endedAt, Date.now()),
              props.run.agent,
              props.run.baseRef ? copy.t("orchestra.workflows.receipt.base", { ref: props.run.baseRef }) : undefined,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div class="wf-rhead-actions">
          <Show
            when={props.run.position && props.run.status !== "completed" ? props.run.position : undefined}
            fallback={
              <button type="button" class="mx-btn" onClick={props.onCanvas}>
                <Ic name="open" />
                {copy.t("orchestra.workflows.receipt.canvas")}
              </button>
            }
          >
            {(position) => (
              <button type="button" class="mx-btn" onClick={() => props.onOpenStep(position())}>
                <Ic name="open" />
                {copy.t(
                  props.run.status === "running"
                    ? "orchestra.workflows.receipt.openCurrent"
                    : "orchestra.workflows.receipt.openFailed",
                )}
              </button>
            )}
          </Show>
          <button
            type="button"
            class="mx-btn icon"
            aria-haspopup="menu"
            aria-label={copy.t("orchestra.workflows.receipt.more", { id: runHandle(props.run.runID) })}
            onClick={(event) => setMenu(event.currentTarget)}
          >
            <Ic name="more" />
          </button>
        </div>
      </div>
      <Show when={props.run.status === "parked"}>
        <section class="wf-wait" aria-label={copy.t("orchestra.workflows.receipt.waitingLabel")}>
          <div class="wf-wait-head">
            <Ic name="wait" />
            {copy.t("orchestra.workflows.receipt.waiting", { step: at()?.name ?? props.run.position ?? "" })}
          </div>
          <div class="wf-wait-body">
            {copy.t("orchestra.workflows.receipt.spent", {
              attempt: step(props.run.position ?? "")?.attempts ?? "",
              budget: budget(),
            })}{" "}
            <Show when={props.run.failing.length}>
              {copy.t("orchestra.workflows.receipt.failing")}{" "}
              <For each={props.run.failing}>
                {(item, index) => (
                  <>
                    <Show when={index() > 0}> </Show>
                    <code>{item}</code>
                  </>
                )}
              </For>
              .
            </Show>
            <br />
            {copy.t("orchestra.workflows.maestroOnly")}
          </div>
          <div class="wf-wait-foot">
            <Show when={sessionOf(props.run.position)}>
              {(session) => (
                <button type="button" class="mx-btn" onClick={() => props.onSession(session())}>
                  {copy.t("orchestra.workflows.receipt.openSession")}
                </button>
              )}
            </Show>
            <Show when={props.run.position}>
              {(position) => (
                <button type="button" class="mx-btn" onClick={() => props.onOpenStep(position())}>
                  {copy.t("orchestra.workflows.receipt.openStep")}
                </button>
              )}
            </Show>
          </div>
        </section>
      </Show>
      <Show when={props.run.status === "failed" || props.run.status === "cancelled"}>
        <div class="wf-alert">
          <Ic name="warn" />
          <span>
            <Show when={at()}>
              <b style={{ "font-family": "var(--mx-emphasis)", "font-weight": "600" }}>
                {copy.t("orchestra.workflows.receipt.stopped", { step: at()!.name })}
              </b>{" "}
            </Show>
            {props.run.reason ?? copy.t("orchestra.workflows.receipt.noReason")}
          </span>
        </div>
      </Show>
      <Show when={phases().length}>
        <div class="wf-phases">
          <For each={phases()}>
            {(item) => (
              <div class={`wf-phase ${item.tone}`}>
                <div class="bar" />
                <b>{item.phase.name}</b>
                <small>{item.label}</small>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="wf-sub">
        <h3 class="mx-section" style={{ "margin-top": "4px" }}>
          {copy.t("orchestra.workflows.receipt.steps")}
        </h3>
        <span class="mx-meta">
          {copy.count(order().length, "orchestra.workflows.count.step.one", "orchestra.workflows.count.step.other")} ·{" "}
          {copy.t("orchestra.workflows.receipt.budgetMeta", { count: budget() })}
        </span>
      </div>
      <div class="mx-table wf-steps">
        <div class="mx-row wf-steps-head" aria-hidden="true">
          <span />
          <span>{copy.t("orchestra.workflows.receipt.head.step")}</span>
          <span>{copy.t("orchestra.workflows.receipt.head.verdict")}</span>
          <span class="num">{copy.t("orchestra.workflows.receipt.head.attempts")}</span>
          <span class="num">{copy.t("orchestra.workflows.receipt.head.checks")}</span>
          <span class="num">{copy.t("orchestra.workflows.receipt.head.time")}</span>
          <span />
        </div>
        <For each={order()}>
          {(node, index) => {
            const result = (): RelayRunStep | undefined => step(node.id)
            const status = () => result()?.status ?? "pending"
            const highlight = () => status() === "escalated" || status() === "failed"
            const phase = () => phaseOf(props.flow, node.id)
            const total = () => result()?.checks.length || readChecklist(node).controls.length
            return (
              <>
                <Show when={index() === 0 || phaseOf(props.flow, order()[index() - 1].id) !== phase()}>
                  <div class="mx-row phase">{phase()?.name ?? copy.t("orchestra.workflows.receipt.noPhase")}</div>
                </Show>
                <div class="mx-row" classList={{ hl: highlight() }} data-step={node.id}>
                  <span class={`wf-dot ${STEP_TONE[status()]}`} />
                  <div class="mx-grow">
                    <strong>{node.name}</strong>
                    <small>{[node.id, result()?.note].filter(Boolean).join(" · ")}</small>
                  </div>
                  <span class={`mx-badge ${badgeTone(STEP_TONE[status()])}`}>
                    {copy.t(`orchestra.workflows.verdict.${status()}`)}
                  </span>
                  <span class="num" classList={{ warm: (result()?.attempts ?? 0) > budget() }}>
                    {status() === "pending" ? "—" : `${Math.max(1, result()?.attempts ?? 1)} / ${budget() + 1}`}
                  </span>
                  <span class="num" classList={{ bad: highlight() }}>
                    {status() === "pending" || !result()?.checks.length
                      ? "—"
                      : `${result()!.checks.filter((check) => check.verdict === "pass").length}/${total()}`}
                  </span>
                  <span class="num">{span(result()?.startedAt, result()?.endedAt, Date.now()) ?? "—"}</span>
                  <button
                    type="button"
                    class="mx-btn icon"
                    aria-label={copy.t("orchestra.workflows.receipt.openInEditor", { name: node.name })}
                    title={copy.t("orchestra.workflows.receipt.openInEditor", { name: node.name })}
                    onClick={() => props.onOpenStep(node.id)}
                  >
                    <Ic name="open" />
                  </button>
                </div>
                <Show when={highlight() && result()?.checks.length}>
                  <div class="mx-row wf-step-detail">
                    <div class="wf-checks" style={{ "max-width": "620px" }}>
                      <For each={result()!.checks}>
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
                  </div>
                </Show>
              </>
            )
          }}
        </For>
      </div>
      <div class="wf-sub" style={{ "margin-top": "22px" }}>
        <h3 class="mx-section">{copy.t("orchestra.workflows.receipt.audit")}</h3>
        <Show when={audit.data}>
          {(value) => (
            <span class={`mx-badge ${value().status === "pass" ? "good" : value().status === "fail" ? "bad" : ""}`}>
              {[copy.t(`orchestra.workflows.audit.${value().status}`), value().code].filter(Boolean).join(" · ")}
            </span>
          )}
        </Show>
      </div>
      <Show
        when={audit.data?.rows.length}
        fallback={
          <p class="mx-empty" style={{ padding: "18px" }}>
            {props.run.status === "running"
              ? copy.t("orchestra.workflows.receipt.auditOpen")
              : audit.isError
                ? copy.t("orchestra.workflows.receipt.auditError", { reason: String(audit.error?.message ?? "") })
                : audit.isPending
                  ? copy.t("orchestra.workflows.receipt.auditLoading")
                  : copy.t("orchestra.workflows.receipt.auditEmpty")}
          </p>
        }
      >
        <div class="mx-table wf-audit" style={{ "margin-top": "12px" }}>
          <For each={audit.data!.rows}>
            {(row) => (
              <div class="mx-row">
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <div class="mx-toolbar" style={{ "margin-top": "12px" }}>
        <button
          type="button"
          class="mx-btn"
          disabled={props.run.status === "running" || audit.isFetching}
          onClick={() => void audit.refetch()}
        >
          <Ic name="history" />
          {copy.t("orchestra.workflows.receipt.refreshAudit")}
        </button>
        <button type="button" class="mx-btn" disabled={ledger.busy()} onClick={() => void download()}>
          <Ic name="download" />
          {copy.t("orchestra.workflows.receipt.ledger")}
        </button>
        <Show when={ledger.error()}>
          <span class="mx-error" style={{ margin: "0" }}>
            {ledger.error()}
          </span>
        </Show>
      </div>
      <p class="mx-note">{copy.t("orchestra.workflows.receipt.note")}</p>
      <Show when={menu()}>
        {(anchor) => (
          <Menu
            anchor={anchor()}
            label={copy.t("orchestra.workflows.receipt.more", { id: runHandle(props.run.runID) })}
            items={[
              { label: copy.t("orchestra.workflows.receipt.canvas"), icon: "open", run: props.onCanvas },
              {
                label: copy.t("orchestra.workflows.receipt.openSession"),
                icon: "next",
                disabled: !sessionOf(props.run.position),
                run: () => {
                  const session = sessionOf(props.run.position)
                  if (session) props.onSession(session)
                },
              },
              { label: copy.t("orchestra.workflows.receipt.ledger"), icon: "download", run: () => void download() },
            ]}
            onClose={() => setMenu(undefined)}
          />
        )}
      </Show>
    </div>
  )
}
